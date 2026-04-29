import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

import { STORAGE_KEY_HAS_SESSION } from '../constants/storage'

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 5000,
    BACKEND_HEALTH_CHECK_TIMEOUT_MS: 2000,
    STORAGE_KEY_TOKEN: 'kc-auth-token',
    STORAGE_KEY_USER_CACHE: 'kc-user-cache',
    DEMO_TOKEN_VALUE: 'demo-token',
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

vi.mock('../analytics', () => ({
  emitError: vi.fn(),
  emitSessionExpired: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_TOKEN = 'kc-auth-token'
const STORAGE_KEY_USER_CACHE = 'kc-user-cache'
const DEMO_TOKEN_VALUE = 'demo-token'
const BACKEND_STATUS_KEY = 'kc-backend-status'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, options: { status?: number; headers?: Record<string, string> } = {}): Response {
  const { status = 200, headers = {} } = options
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function makeTextResponse(text: string, status = 500): Response {
  return new Response(text, { status })
}

/**
 * Because the module uses singleton state at the module level, we need to
 * re-import it for each test to get a clean slate.
 */
async function importFresh() {
  vi.resetModules()
  const mod = await import('../api')
  return mod
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('api.ts', () => {

  // ── Error classes ────────────────────────────────────────────────────────

  describe('error classes', () => {
    it('UnauthenticatedError has correct name and message', async () => {
      const { UnauthenticatedError } = await importFresh()
      const err = new UnauthenticatedError()
      expect(err.name).toBe('UnauthenticatedError')
      expect(err.message).toBe('No authentication token available')
      expect(err).toBeInstanceOf(Error)
    })

    it('UnauthorizedError has correct name and message', async () => {
      const { UnauthorizedError } = await importFresh()
      const err = new UnauthorizedError()
      expect(err.name).toBe('UnauthorizedError')
      expect(err.message).toBe('Token is invalid or expired')
      expect(err).toBeInstanceOf(Error)
    })

    it('BackendUnavailableError has correct name and message', async () => {
      const { BackendUnavailableError } = await importFresh()
      const err = new BackendUnavailableError()
      expect(err.name).toBe('BackendUnavailableError')
      expect(err.message).toBe('Backend API is currently unavailable')
      expect(err).toBeInstanceOf(Error)
    })

    it('RateLimitError has correct name, message, and retryAfter', async () => {
      const { RateLimitError } = await importFresh()
      const err = new RateLimitError(30)
      expect(err.name).toBe('RateLimitError')
      expect(err.message).toBe('Rate limited. Try again in 30 seconds.')
      expect(err.retryAfter).toBe(30)
      expect(err).toBeInstanceOf(Error)
    })

    it('RateLimitError stores arbitrary retryAfter values', async () => {
      const { RateLimitError } = await importFresh()
      const err = new RateLimitError(120)
      expect(err.retryAfter).toBe(120)
      expect(err.message).toContain('120')
    })
  })

  // ── checkBackendAvailability ────────────────────────────────────────────

  describe('checkBackendAvailability', () => {
    it('returns true when health endpoint responds with 200', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { checkBackendAvailability } = await importFresh()
      const result = await checkBackendAvailability()
      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith('/health', expect.objectContaining({ method: 'GET' }))
    })

    it('returns true for non-500 error responses (e.g. 404)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({}, { status: 404 }))
      const { checkBackendAvailability } = await importFresh()
      const result = await checkBackendAvailability()
      expect(result).toBe(true)
    })

    it('returns false for 500+ responses', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({}, { status: 500 }))
      const { checkBackendAvailability } = await importFresh()
      const result = await checkBackendAvailability()
      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      const { checkBackendAvailability } = await importFresh()
      const result = await checkBackendAvailability()
      expect(result).toBe(false)
    })

    it('caches successful result to localStorage', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      const stored = JSON.parse(localStorage.getItem(BACKEND_STATUS_KEY) || '{}')
      expect(stored.available).toBe(true)
      expect(stored.timestamp).toBeGreaterThan(0)
    })

    it('does NOT cache failure to localStorage', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      const { checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      expect(localStorage.getItem(BACKEND_STATUS_KEY)).toBeNull()
    })

    it('returns cached result on second call without re-fetching', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      vi.mocked(fetch).mockClear()

      const result = await checkBackendAvailability()
      expect(result).toBe(true)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('deduplicates concurrent calls into a single request', async () => {
      let resolvePromise: (v: Response) => void
      vi.mocked(fetch).mockReturnValue(new Promise(r => { resolvePromise = r }))

      const { checkBackendAvailability } = await importFresh()
      const p1 = checkBackendAvailability(true)
      const p2 = checkBackendAvailability(true)

      resolvePromise!(makeResponse({ status: 'ok' }))
      const [r1, r2] = await Promise.all([p1, p2])

      expect(r1).toBe(true)
      expect(r2).toBe(true)
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('forceCheck ignores cached result', async () => {
      // First call succeeds
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()

      // Second call with forceCheck should re-fetch
      vi.mocked(fetch).mockResolvedValue(makeResponse({}, { status: 500 }))
      const result = await checkBackendAvailability(true)
      expect(result).toBe(false)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('loads cached status from localStorage on module init', async () => {
      const cached = { available: true, timestamp: Date.now() }
      localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify(cached))

      const { checkBackendAvailability } = await importFresh()
      const result = await checkBackendAvailability()
      expect(result).toBe(true)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('ignores stale cached status from localStorage', async () => {
      const staleTimestamp = Date.now() - 400_000 // > 5 minutes ago
      const cached = { available: true, timestamp: staleTimestamp }
      localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify(cached))

      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      expect(fetch).toHaveBeenCalled()
    })
  })

  // ── checkOAuthConfigured ───────────────────────────────────────────────

  describe('checkOAuthConfigured', () => {
    it('returns oauthConfigured true when server indicates it', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok', oauth_configured: true }))
      const { checkOAuthConfigured } = await importFresh()
      const result = await checkOAuthConfigured()
      expect(result).toEqual({ backendUp: true, oauthConfigured: true })
    })

    it('returns both false when health endpoint fails', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({}, { status: 503 }))
      const { checkOAuthConfigured } = await importFresh()
      const result = await checkOAuthConfigured()
      expect(result).toEqual({ backendUp: false, oauthConfigured: false })
    })

    it('returns both false on network error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network'))
      const { checkOAuthConfigured } = await importFresh()
      const result = await checkOAuthConfigured()
      expect(result).toEqual({ backendUp: false, oauthConfigured: false })
    })

    it('handles invalid JSON response gracefully', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }))
      const { checkOAuthConfigured } = await importFresh()
      const result = await checkOAuthConfigured()
      expect(result).toEqual({ backendUp: false, oauthConfigured: false })
    })

    it('treats degraded backend as up so demo mode is not triggered (#5401)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'degraded', oauth_configured: true }))
      const { checkOAuthConfigured } = await importFresh()
      const result = await checkOAuthConfigured()
      expect(result).toEqual({ backendUp: true, oauthConfigured: true })
    })
  })

  // ── isBackendUnavailable ───────────────────────────────────────────────

  describe('isBackendUnavailable', () => {
    it('returns false when backend status is unknown', async () => {
      const { isBackendUnavailable } = await importFresh()
      expect(isBackendUnavailable()).toBe(false)
    })

    it('returns false when backend is available', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 'ok' }))
      const { isBackendUnavailable, checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      expect(isBackendUnavailable()).toBe(false)
    })

    it('returns true when backend check failed recently', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      const { isBackendUnavailable, checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      expect(isBackendUnavailable()).toBe(true)
    })

    it('returns false after recheck interval has passed', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      const { isBackendUnavailable, checkBackendAvailability } = await importFresh()
      await checkBackendAvailability()
      expect(isBackendUnavailable()).toBe(true)

      // Advance past recheck interval (10 seconds)
      vi.advanceTimersByTime(11_000)
      expect(isBackendUnavailable()).toBe(false)
    })
  })

  // ── api.get ────────────────────────────────────────────────────────────

  describe('api.get', () => {
    it('makes GET request with auth header', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token-123')
      // Health check + actual request
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({ items: [1, 2, 3] })) // actual

      const { api } = await importFresh()
      const result = await api.get('/api/data')

      expect(result.data).toEqual({ items: [1, 2, 3] })

      const apiCall = vi.mocked(fetch).mock.calls[1]
      expect(apiCall[0]).toBe('/api/data')
      expect(apiCall[1]?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer jwt-token-123' })
      )
    })

    it('throws UnauthenticatedError when no token is present', async () => {
      const { api, UnauthenticatedError } = await importFresh()
      await expect(api.get('/api/protected')).rejects.toThrow(UnauthenticatedError)
    })

    it('does NOT throw UnauthenticatedError for public API paths', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ data: 'public' }))
      const { api } = await importFresh()
      // /api/missions/browse is in the PUBLIC_API_PREFIXES
      const result = await api.get('/api/missions/browse')
      expect(result.data).toEqual({ data: 'public' })
    })

    it('does NOT throw UnauthenticatedError when requiresAuth is false', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ data: 'open' }))
      const { api } = await importFresh()
      const result = await api.get('/api/something', { requiresAuth: false })
      expect(result.data).toEqual({ data: 'open' })
    })

    it('throws UnauthenticatedError for demo token', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
      const { api, UnauthenticatedError } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow(UnauthenticatedError)
    })

    it('throws BackendUnavailableError when backend is down', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      const { api, BackendUnavailableError, checkBackendAvailability } = await importFresh()
      // Mark backend as unavailable
      await checkBackendAvailability()
      await expect(api.get('/api/data')).rejects.toThrow(BackendUnavailableError)
    })

    it('handles 401 by clearing auth state', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'expired-token')
      localStorage.setItem(STORAGE_KEY_USER_CACHE, '{}')

      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // 401
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // /api/me verify probe (#8372)

      const { api, UnauthorizedError } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow(UnauthorizedError)

      // The 401 handler verifies the session via /api/me before clearing —
      // wait for that microtask chain to resolve before asserting cleanup.
      await vi.waitFor(() => {
        expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
      })
      expect(localStorage.getItem(STORAGE_KEY_USER_CACHE)).toBeNull()
    })

    // A 401 from /api/github/* means the GitHub OAuth token is missing or
    // expired — NOT that the user's console session is dead. The caller
    // (e.g. Mission Browser) needs to handle it with a feature-local prompt
    // instead of the whole app logging out. See api.ts:418-427.
    it('does not clear auth state on 401 from /api/github/*', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      localStorage.setItem(STORAGE_KEY_USER_CACHE, '{"id":1}')

      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // 401 on github path

      const { api, UnauthorizedError } = await importFresh()
      await expect(api.get('/api/github/repos/foo/bar/contents/x')).rejects.toThrow(UnauthorizedError)

      expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe('valid-token')
      expect(localStorage.getItem(STORAGE_KEY_USER_CACHE)).toBe('{"id":1}')
    })

    it('handles 500 with error text', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeTextResponse('Internal Server Error', 500))

      const { api } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow('Internal Server Error')
    })

    it('throws on invalid JSON response', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(new Response('not json', { status: 200 }))

      const { api } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow('Invalid JSON response from API')
    })

    it('marks backend as failed on fetch TypeError', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health succeeds
        .mockRejectedValueOnce(new TypeError('Failed to fetch')) // actual request fails

      const { api, isBackendUnavailable } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow()
      expect(isBackendUnavailable()).toBe(true)
    })

    it('triggers silent token refresh when X-Token-Refresh header is present', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'old-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({ data: 'ok' }, { headers: { 'X-Token-Refresh': 'true' } })) // response with refresh header
        .mockResolvedValueOnce(makeResponse({ refreshed: true, onboarded: true })) // refresh endpoint (#6590 — no token in body)

      const { api } = await importFresh()
      await api.get('/api/data')

      // Wait for the async refresh to complete
      await vi.runAllTimersAsync()
      // #6590 — /auth/refresh delivers the new JWT exclusively via the
      // HttpOnly kc_auth cookie (not visible to this test's localStorage
      // mock). The Bearer token in localStorage intentionally stays put —
      // subsequent API requests send the fresh cookie automatically, and
      // the stale-bearer-fallback in the auth middleware (#6026) handles
      // the transition until localStorage catches up on next page load.
      expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe('old-token')
      // Silent refresh also marks the persistent session hint so reloads
      // know to attempt cookie restoration.
      expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBe('true')
    })
  })

  // ── api.post ───────────────────────────────────────────────────────────

  describe('api.post', () => {
    it('sends POST request with JSON body', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({ id: 1 })) // post response

      const { api } = await importFresh()
      const result = await api.post('/api/items', { name: 'test' })

      expect(result.data).toEqual({ id: 1 })

      const postCall = vi.mocked(fetch).mock.calls[1]
      expect(postCall[1]?.method).toBe('POST')
      expect(postCall[1]?.body).toBe(JSON.stringify({ name: 'test' }))
    })

    it('handles 401 on POST', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'expired-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({}, { status: 401 }))
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // /api/me verify probe (#8372)

      const { api, UnauthorizedError } = await importFresh()
      await expect(api.post('/api/items', {})).rejects.toThrow(UnauthorizedError)
    })
  })

  // ── api.put ────────────────────────────────────────────────────────────

  describe('api.put', () => {
    it('sends PUT request', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({ updated: true }))

      const { api } = await importFresh()
      const result = await api.put('/api/items/1', { name: 'updated' })

      expect(result.data).toEqual({ updated: true })
      const putCall = vi.mocked(fetch).mock.calls[1]
      expect(putCall[1]?.method).toBe('PUT')
    })
  })

  // ── api.delete ─────────────────────────────────────────────────────────

  describe('api.delete', () => {
    it('sends DELETE request', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({ ok: true })) // 200 OK

      const { api } = await importFresh()
      await expect(api.delete('/api/items/1')).resolves.toBeUndefined()

      const deleteCall = vi.mocked(fetch).mock.calls[1]
      expect(deleteCall[1]?.method).toBe('DELETE')
    })

    it('handles 401 on DELETE', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'expired-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({}, { status: 401 }))
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // /api/me verify probe (#8372)

      const { api, UnauthorizedError } = await importFresh()
      await expect(api.delete('/api/items/1')).rejects.toThrow(UnauthorizedError)
    })
  })

  // ── authFetch ──────────────────────────────────────────────────────────

  describe('authFetch', () => {
    it('injects Authorization header from localStorage', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token')
      vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: true }))

      const { authFetch } = await importFresh()
      await authFetch('/api/mcp/clusters')

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer jwt-token')
    })

    it('does NOT inject header for demo token', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
      vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: true }))

      const { authFetch } = await importFresh()
      await authFetch('/api/mcp/clusters')

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Headers
      expect(headers.has('Authorization')).toBe(false)
    })

    it('does NOT overwrite existing Authorization header', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'jwt-token')
      vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: true }))

      const { authFetch } = await importFresh()
      await authFetch('/api/mcp/clusters', {
        headers: { Authorization: 'Bearer custom-token' },
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer custom-token')
    })

    it('does NOT inject header when no token exists', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: true }))

      const { authFetch } = await importFresh()
      await authFetch('/api/public/data')

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Headers
      expect(headers.has('Authorization')).toBe(false)
    })
  })

  // ── handle429 (via api.get 429 responses) ──────────────────────────────

  describe('handle429 / RateLimitError on 429', () => {
    it('throws RateLimitError with Retry-After header (numeric)', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const RETRY_AFTER_SECONDS = 45
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) },
          }),
        )

      const { api, RateLimitError } = await importFresh()
      await expect(api.get('/api/data')).rejects.toThrow(RateLimitError)

      try {
        await api.get('/api/data')
      } catch (err) {
        // Already threw above; use a fresh call is not possible since
        // the module is the same instance. Instead verify via the first throw.
      }
    })

    it('RateLimitError.retryAfter matches numeric Retry-After header', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const RETRY_AFTER_SECONDS = 45
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) },
          }),
        )

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        expect((err as { retryAfter: number }).retryAfter).toBe(RETRY_AFTER_SECONDS)
      }
    })

    it('defaults retryAfter to 60 when Retry-After header is missing', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const DEFAULT_RETRY_AFTER = 60
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(new Response('', { status: 429 })) // no Retry-After header

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        expect((err as { retryAfter: number }).retryAfter).toBe(DEFAULT_RETRY_AFTER)
      }
    })

    it('defaults retryAfter to 60 when Retry-After header is non-numeric', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const DEFAULT_RETRY_AFTER = 60
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': 'not-a-number' },
          }),
        )

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        expect((err as { retryAfter: number }).retryAfter).toBe(DEFAULT_RETRY_AFTER)
      }
    })

    it('stores rate-limit backoff deadline in localStorage', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const RETRY_AFTER_SECONDS = 30
      const RATE_LIMIT_STORAGE_KEY = 'kc-api-rate-limit-until'
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) },
          }),
        )

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
      } catch {
        // expected
      }

      const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
      expect(stored).not.toBeNull()
      const deadline = Number(stored)
      expect(deadline).toBeGreaterThan(0)
    })

    it('throws RateLimitError on 429 from POST', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': '10' },
          }),
        )

      const { api, RateLimitError } = await importFresh()
      await expect(api.post('/api/items', { name: 'test' })).rejects.toThrow(RateLimitError)
    })

    it('defaults retryAfter to 60 when Retry-After is zero', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const DEFAULT_RETRY_AFTER = 60
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': '0' },
          }),
        )

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        expect((err as { retryAfter: number }).retryAfter).toBe(DEFAULT_RETRY_AFTER)
      }
    })

    it('defaults retryAfter to 60 when Retry-After is negative', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'valid-token')
      const DEFAULT_RETRY_AFTER = 60
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': '-5' },
          }),
        )

      const { api } = await importFresh()
      try {
        await api.get('/api/data')
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        expect((err as { retryAfter: number }).retryAfter).toBe(DEFAULT_RETRY_AFTER)
      }
    })
  })

  // ── safeJson ──────────────────────────────────────────────────────────

  describe('safeJson', () => {
    it('parses valid JSON response with application/json content-type', async () => {
      const { safeJson } = await importFresh()
      const response = new Response(JSON.stringify({ foo: 'bar' }), {
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await safeJson<{ foo: string }>(response)
      expect(result).toEqual({ foo: 'bar' })
    })

    it('parses JSON when content-type includes charset', async () => {
      const { safeJson } = await importFresh()
      const response = new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
      const result = await safeJson<{ ok: boolean }>(response)
      expect(result).toEqual({ ok: true })
    })

    it('throws descriptive error for text/html content-type', async () => {
      const { safeJson } = await importFresh()
      const response = new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
      await expect(safeJson(response)).rejects.toThrow(
        'Expected JSON response but received text/html (status 200)',
      )
    })

    it('throws descriptive error for text/plain content-type', async () => {
      const { safeJson } = await importFresh()
      const response = new Response('plain text', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
      await expect(safeJson(response)).rejects.toThrow(
        'Expected JSON response but received text/plain (status 500)',
      )
    })

    it('throws with "unknown content-type" when content-type header is absent', async () => {
      const { safeJson } = await importFresh()
      const response = new Response('{}', { status: 200 })
      // Remove Content-Type header to simulate missing content-type
      response.headers.delete('Content-Type')
      await expect(safeJson(response)).rejects.toThrow(
        /unknown content-type/i,
      )
    })

    it('parses an array JSON body', async () => {
      const { safeJson } = await importFresh()
      const body = [1, 2, 3]
      const response = new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await safeJson<number[]>(response)
      expect(result).toEqual([1, 2, 3])
    })

    it('includes status code in the error message', async () => {
      const { safeJson } = await importFresh()
      const response = new Response('not json', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
      await expect(safeJson(response)).rejects.toThrow('status 404')
    })
  })

  // ── 401 debounce ───────────────────────────────────────────────────────

  describe('401 handling debounce', () => {
    it('only handles 401 once for concurrent requests', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'expired-token')

      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health for req 1
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // 401 for req 1
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // /api/me verify probe (#8372)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health for req 2
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // 401 for req 2

      const { api } = await importFresh()

      // Both should throw but only one handle401 should fire
      await expect(api.get('/api/a')).rejects.toThrow()

      // Token clearing is async (waits for /api/me verify probe) — poll.
      await vi.waitFor(() => {
        expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
      })
    })

    // #8372 — a 401 from one endpoint must NOT nuke the session if /api/me
    // still returns 200. Otherwise the user gets bounced to /login with a
    // stale ?reason=session_expired param on refresh, even though their
    // cookie is still valid.
    it('does NOT clear auth state when /api/me still returns 200', async () => {
      localStorage.setItem(STORAGE_KEY_TOKEN, 'still-valid-token')
      localStorage.setItem(STORAGE_KEY_USER_CACHE, '{"id":1}')

      vi.mocked(fetch)
        .mockResolvedValueOnce(makeResponse({ status: 'ok' })) // health
        .mockResolvedValueOnce(makeResponse({}, { status: 401 })) // endpoint 401
        .mockResolvedValueOnce(makeResponse({ id: 1 }, { status: 200 })) // /api/me OK

      const { api, UnauthorizedError } = await importFresh()
      await expect(api.get('/api/some-scoped-route')).rejects.toThrow(UnauthorizedError)

      // Drain microtasks so the verify-probe promise chain settles under
      // fake timers. Token should remain because /api/me returned 200.
      await vi.advanceTimersByTimeAsync(100)
      expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe('still-valid-token')
      expect(localStorage.getItem(STORAGE_KEY_USER_CACHE)).toBe('{"id":1}')
    })
  })
})
