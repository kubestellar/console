// Unit tests for restoreCookieSession (web/src/lib/auth/sessionRestore.ts):
// the /auth/refresh + /api/me flow run when only the kc-has-session hint exists.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSetAgentToken,
  mockSetAnalyticsUserId,
  mockSetAnalyticsUserProperties,
  mockCacheUser,
  mockIsLocalAgentSuppressed,
} = vi.hoisted(() => ({
  mockSetAgentToken: vi.fn(),
  mockSetAnalyticsUserId: vi.fn(),
  mockSetAnalyticsUserProperties: vi.fn(),
  mockCacheUser: vi.fn(),
  mockIsLocalAgentSuppressed: vi.fn().mockReturnValue(false),
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({ setAgentToken: mockSetAgentToken }))
vi.mock('../../analytics', () => ({
  setAnalyticsUserId: mockSetAnalyticsUserId,
  setAnalyticsUserProperties: mockSetAnalyticsUserProperties,
}))
vi.mock('../tokenHelpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tokenHelpers')>()),
  cacheUser: mockCacheUser,
}))
vi.mock('../../constants/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants/network')>()),
  isLocalAgentSuppressed: mockIsLocalAgentSuppressed,
}))

import { restoreCookieSession } from '../sessionRestore'
import { STORAGE_KEY_HAS_SESSION } from '../../constants'
import { AUTH_USER_CACHE_VALIDATED_KEY } from '../tokenHelpers'

const USER = {
  id: 'u1',
  github_id: '123',
  github_login: 'octocat',
  onboarded: true,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('restoreCookieSession', () => {
  const fetchMock = vi.fn()
  const setUser = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLocalAgentSuppressed.mockReturnValue(false)
    localStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockHappyPath() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/auth/refresh') return jsonResponse({ refreshed: true, onboarded: true })
      if (url === '/api/agent/token') return jsonResponse({ token: 'agent-tok' })
      if (url === '/api/me') return jsonResponse(USER)
      throw new Error(`unexpected url ${url}`)
    })
  }

  it.each([
    [true, 'github-oauth'],
    [false, 'dev-login'],
  ])('restores session when oauthConfigured=%s', async (oauthConfigured, authMode) => {
    mockHappyPath()

    await expect(restoreCookieSession(oauthConfigured, setUser)).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }),
      }),
    )
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }))
    expect(mockCacheUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }))
    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBe('true')
    expect(localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY)).not.toBeNull()
    expect(mockSetAgentToken).toHaveBeenCalledWith('agent-tok')
    expect(mockSetAnalyticsUserId).toHaveBeenCalledWith('u1')
    expect(mockSetAnalyticsUserProperties).toHaveBeenCalledWith({ auth_mode: authMode })
  })

  it('skips agent token fetch when local agent is suppressed', async () => {
    mockIsLocalAgentSuppressed.mockReturnValue(true)
    mockHappyPath()

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(true)

    expect(fetchMock).not.toHaveBeenCalledWith('/api/agent/token', expect.anything())
    expect(mockSetAgentToken).not.toHaveBeenCalled()
  })

  it('treats agent token fetch failure as non-fatal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/auth/refresh') return jsonResponse({ refreshed: true })
      if (url === '/api/agent/token') throw new Error('agent down')
      if (url === '/api/me') return jsonResponse(USER)
      throw new Error(`unexpected url ${url}`)
    })

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(true)

    expect(mockSetAgentToken).not.toHaveBeenCalled()
    expect(setUser).toHaveBeenCalled()
  })

  it('returns false when /auth/refresh is non-ok (non-auth status) and keeps hint', async () => {
    localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(false)

    expect(setUser).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBe('true')
  })

  it('returns false when /api/me is non-ok after successful refresh', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/auth/refresh') return jsonResponse({ refreshed: true })
      if (url === '/api/agent/token') return jsonResponse({ token: 'agent-tok' })
      if (url === '/api/me') return new Response('', { status: 500 })
      throw new Error(`unexpected url ${url}`)
    })

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(false)

    expect(setUser).not.toHaveBeenCalled()
    expect(mockCacheUser).not.toHaveBeenCalled()
    expect(mockSetAnalyticsUserId).not.toHaveBeenCalled()
  })

  it('returns false when refresh body lacks refreshed=true', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ refreshed: false }))

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setUser).not.toHaveBeenCalled()
  })

  it.each([401, 403])('clears kc-has-session on %i from /auth/refresh', async (status) => {
    localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
    fetchMock.mockResolvedValue(new Response('', { status }))

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(false)

    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBeNull()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('falls through without clearing hint on network error', async () => {
    localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(restoreCookieSession(true, setUser)).resolves.toBe(false)

    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBe('true')
    expect(setUser).not.toHaveBeenCalled()
  })

  it('falls through without clearing hint on timeout', async () => {
    localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))

    await expect(restoreCookieSession(false, setUser)).resolves.toBe(false)

    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBe('true')
  })
})
