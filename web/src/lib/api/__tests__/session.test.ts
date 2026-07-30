import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RateLimitError } from '../types'

// Silence and observe side-effect dependencies without importing the real ones.
const clearStoredAuthTokenMock = vi.fn()
const getStoredAuthTokenSyncMock = vi.fn<[], string | null>(() => null)
const emitSessionExpiredMock = vi.fn()
const reportAppErrorMock = vi.fn()

vi.mock('../../authToken', () => ({
  clearStoredAuthToken: (...args: unknown[]) => clearStoredAuthTokenMock(...args),
  getStoredAuthTokenSync: () => getStoredAuthTokenSyncMock(),
  AUTH_TOKEN_SYNC_KEY: 'kc-auth-token-sync',
}))

vi.mock('../../analytics', () => ({
  emitSessionExpired: (...args: unknown[]) => emitSessionExpiredMock(...args),
}))

vi.mock('../../errors/handleError', () => ({
  reportAppError: (...args: unknown[]) => reportAppErrorMock(...args),
}))

// Import AFTER mocks so the module picks them up.
import {
  handle401,
  handle429,
  performSessionExpiry,
  resetSessionStateForTests,
  showSessionExpiredBanner,
} from '../session'
import * as sessionModule from '../session'

const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'
const STORAGE_KEY_USER_CACHE = 'kc-user-cache'
const STORAGE_KEY_HAS_SESSION = 'kc-has-session'
const DEFAULT_RETRY_S = 60
const SESSION_EXPIRY_REDIRECT_MS = 3_000
const HANDLING_401_RESET_MS = 10_000

function buildResponse(headers: Record<string, string> = {}, opts: { ok?: boolean; status?: number } = {}): Response {
  const h = new Headers(headers)
  return {
    headers: h,
    ok: opts.ok ?? false,
    status: opts.status ?? 429,
  } as unknown as Response
}

describe('session.ts', () => {
  let originalHref: string
  let hrefSetter: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    resetSessionStateForTests()
    clearStoredAuthTokenMock.mockClear()
    getStoredAuthTokenSyncMock.mockReset().mockReturnValue(null)
    emitSessionExpiredMock.mockClear()
    reportAppErrorMock.mockClear()

    // Stub window.location.href assignment without navigating jsdom.
    originalHref = window.location.href
    hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        get href() { return originalHref },
        set href(value: string) { hrefSetter(value) },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('handle429', () => {
    it('throws RateLimitError with the Retry-After header value', () => {
      const resp = buildResponse({ 'Retry-After': '42' })
      try {
        handle429(resp)
        throw new Error('handle429 did not throw')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
        expect((err as RateLimitError).retryAfter).toBe(42)
      }
    })

    it('falls back to DEFAULT_RATE_LIMIT_RETRY_AFTER_S when header is missing', () => {
      const resp = buildResponse({})
      expect(() => handle429(resp)).toThrow(RateLimitError)
      try { handle429(resp) } catch (err) {
        expect((err as RateLimitError).retryAfter).toBe(DEFAULT_RETRY_S)
      }
    })

    it('falls back to default when header is unparseable', () => {
      const resp = buildResponse({ 'Retry-After': 'not-a-number' })
      try { handle429(resp) } catch (err) {
        expect((err as RateLimitError).retryAfter).toBe(DEFAULT_RETRY_S)
      }
    })

    it('falls back to default when Retry-After is zero or negative', () => {
      for (const value of ['0', '-5']) {
        try { handle429(buildResponse({ 'Retry-After': value })) } catch (err) {
          expect((err as RateLimitError).retryAfter).toBe(DEFAULT_RETRY_S)
        }
      }
    })

    it('persists the effective backoff deadline in localStorage', () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)
      try { handle429(buildResponse({ 'Retry-After': '30' })) } catch { /* expected */ }
      expect(localStorage.getItem(STORAGE_KEY_RATE_LIMIT_UNTIL)).toBe(String(now + 30 * 1000))
    })

    it('reports the error and still throws when localStorage.setItem throws', () => {
      const original = localStorage.setItem.bind(localStorage)
      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      try {
        expect(() => handle429(buildResponse({ 'Retry-After': '15' }))).toThrow(RateLimitError)
        expect(reportAppErrorMock).toHaveBeenCalledTimes(1)
        expect(reportAppErrorMock.mock.calls[0][1]).toMatchObject({ level: 'warn' })
      } finally {
        spy.mockRestore()
        // Sanity: original still works after restore.
        original('kc-restore-check', '1')
      }
    })
  })

  describe('handle401', () => {
    it('debounces concurrent invocations via the handling401 flag', () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      handle401()
      handle401()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(sessionModule.handling401).toBe(true)
    })

    it('auto-resets the handling401 flag after HANDLING_401_RESET_MS', () => {
      const fetchMock = vi.fn().mockReturnValue(new Promise(() => { /* never resolve */ }))
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      expect(sessionModule.handling401).toBe(true)
      vi.advanceTimersByTime(HANDLING_401_RESET_MS)
      expect(sessionModule.handling401).toBe(false)
    })

    it('calls the auth verify endpoint with credentials included', () => {
      const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/me')
      expect(init.credentials).toBe('include')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('aborts session expiry when the verify probe returns 200 OK', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      await vi.runOnlyPendingTimersAsync()

      // No expiry side effects.
      expect(document.getElementById('session-expired-banner')).toBeNull()
      expect(clearStoredAuthTokenMock).not.toHaveBeenCalled()
      expect(emitSessionExpiredMock).not.toHaveBeenCalled()
      // Flag reset synchronously in the OK branch.
      expect(sessionModule.handling401).toBe(false)
    })

    it('aborts session expiry when the verify probe returns 429', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response)
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      await vi.runOnlyPendingTimersAsync()

      expect(document.getElementById('session-expired-banner')).toBeNull()
      expect(emitSessionExpiredMock).not.toHaveBeenCalled()
      expect(sessionModule.handling401).toBe(false)
    })

    it('proceeds with session expiry when verify probe returns a non-OK, non-429 status', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401 } as Response)  // verify probe
        .mockResolvedValue({ ok: true, status: 200 } as Response)       // logout POST
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      await vi.runOnlyPendingTimersAsync()

      expect(document.getElementById('session-expired-banner')).not.toBeNull()
      expect(emitSessionExpiredMock).toHaveBeenCalledTimes(1)
      expect(clearStoredAuthTokenMock).toHaveBeenCalledTimes(1)
    })

    it('proceeds with session expiry when the verify probe network call rejects', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error('network down'))  // verify
        .mockResolvedValue({ ok: true } as Response)       // logout
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      await vi.runOnlyPendingTimersAsync()

      expect(emitSessionExpiredMock).toHaveBeenCalledTimes(1)
      expect(document.getElementById('session-expired-banner')).not.toBeNull()
    })
  })

  describe('performSessionExpiry', () => {
    it('shows the banner, clears auth state, and schedules a login redirect', () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
      vi.stubGlobal('fetch', fetchMock)
      localStorage.setItem(STORAGE_KEY_USER_CACHE, '{"id":"x"}')
      localStorage.setItem(STORAGE_KEY_HAS_SESSION, '1')

      performSessionExpiry()

      expect(document.getElementById('session-expired-banner')).not.toBeNull()
      expect(emitSessionExpiredMock).toHaveBeenCalledTimes(1)
      expect(clearStoredAuthTokenMock).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(STORAGE_KEY_USER_CACHE)).toBeNull()
      expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBeNull()

      // Redirect is deferred by SESSION_EXPIRY_REDIRECT_MS.
      expect(hrefSetter).not.toHaveBeenCalled()
      vi.advanceTimersByTime(SESSION_EXPIRY_REDIRECT_MS)
      expect(hrefSetter).toHaveBeenCalledWith('/login?reason=session_expired')
    })

    it('posts to the logout endpoint with an Authorization header when a real token is stored', () => {
      getStoredAuthTokenSyncMock.mockReturnValue('real-token-abc')
      const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
      vi.stubGlobal('fetch', fetchMock)

      performSessionExpiry()

      const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/auth/logout')
      expect(logoutCall).toBeTruthy()
      const init = logoutCall![1]
      expect(init.method).toBe('POST')
      expect(init.credentials).toBe('include')
      expect(init.headers['Authorization']).toBe('Bearer real-token-abc')
      expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('omits the Authorization header when the stored token is the demo sentinel', () => {
      getStoredAuthTokenSyncMock.mockReturnValue('demo-token')
      const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
      vi.stubGlobal('fetch', fetchMock)

      performSessionExpiry()

      const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/auth/logout')!
      expect(logoutCall[1].headers['Authorization']).toBeUndefined()
    })

    it('omits the Authorization header when no token is stored', () => {
      getStoredAuthTokenSyncMock.mockReturnValue(null)
      const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
      vi.stubGlobal('fetch', fetchMock)

      performSessionExpiry()

      const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/auth/logout')!
      expect(logoutCall[1].headers['Authorization']).toBeUndefined()
    })

    it('reports the logout failure and still finishes the client-side flow when logout fetch rejects', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('backend down'))
      vi.stubGlobal('fetch', fetchMock)

      performSessionExpiry()
      // Let the rejection propagate through the microtask queue.
      await Promise.resolve()
      await Promise.resolve()

      expect(clearStoredAuthTokenMock).toHaveBeenCalledTimes(1)
      // 1 = "Received 401 …" warning, 1 = logout-failure warning.
      expect(reportAppErrorMock).toHaveBeenCalledTimes(2)
    })

    it('reports and swallows synchronous fetch() throws', () => {
      const fetchMock = vi.fn(() => { throw new Error('sync boom') })
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      expect(() => performSessionExpiry()).not.toThrow()
      expect(clearStoredAuthTokenMock).toHaveBeenCalledTimes(1)
      // "Received 401 …" + "Failed to initiate logout request …"
      expect(reportAppErrorMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('showSessionExpiredBanner', () => {
    it('injects the banner element with the expected id', () => {
      showSessionExpiredBanner()
      const el = document.getElementById('session-expired-banner')
      expect(el).not.toBeNull()
      expect(el?.textContent).toMatch(/Session expired/)
    })

    it('injects the slideUp keyframes style exactly once across calls', () => {
      showSessionExpiredBanner()
      // Remove the banner so a second call is allowed to run its full body.
      document.getElementById('session-expired-banner')?.remove()
      showSessionExpiredBanner()

      const styles = document.head.querySelectorAll('#session-banner-animation')
      expect(styles).toHaveLength(1)
      expect((styles[0] as HTMLStyleElement).textContent).toContain('@keyframes slideUp')
    })

    it('does not create a duplicate banner if one already exists', () => {
      showSessionExpiredBanner()
      showSessionExpiredBanner()
      expect(document.querySelectorAll('#session-expired-banner')).toHaveLength(1)
    })
  })

  describe('resetSessionStateForTests', () => {
    it('resets the handling401 flag to false', () => {
      const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
      vi.stubGlobal('fetch', fetchMock)

      handle401()
      expect(sessionModule.handling401).toBe(true)
      resetSessionStateForTests()
      expect(sessionModule.handling401).toBe(false)
    })
  })
})
