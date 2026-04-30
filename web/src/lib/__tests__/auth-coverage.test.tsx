/**
 * Coverage-focused tests for auth.tsx
 *
 * Targets uncovered branches not hit by auth.test.ts / auth-expand.test.ts:
 * - logout() with a real token (fires POST /auth/logout)
 * - logout() when fetch('/auth/logout') rejects (fire-and-forget path)
 * - Token expiry timer: checkExpiry when token is near expiry
 * - Token expiry timer: checkExpiry removes stale banner when not near expiry
 * - Token refresh via "Refresh Now" button (success + failure)
 * - setDemoMode on Netlify preview hostnames
 * - isLoading initial state: no token and no cache
 * - Storage event: removes expiry banner on new token
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
  // #6055 — retry helper mirrors checkOAuthConfigured so tests don't hang on real setTimeout delays
  checkOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
}))

vi.mock('../dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: vi.fn() },
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'token',
    DEMO_TOKEN_VALUE: 'demo-token',
    STORAGE_KEY_DEMO_MODE: 'kc-demo-mode',
    STORAGE_KEY_ONBOARDED: 'demo-user-onboarded',
    STORAGE_KEY_USER_CACHE: 'kc-user-cache',
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

vi.mock('../analytics', () => ({
  emitLogin: vi.fn(),
  emitLogout: vi.fn(),
  setAnalyticsUserId: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitConversionStep: vi.fn(),
  emitDeveloperSession: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  setDemoMode: vi.fn(),
  isDemoMode: vi.fn().mockReturnValue(false),
  isNetlifyDeployment: false,
  isDemoToken: vi.fn().mockReturnValue(false),
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../hooks/usePermissions', () => ({
  clearPermissionsCache: vi.fn(),
}))

vi.mock('../../hooks/useActiveUsers', () => ({
  disconnectPresence: vi.fn(),
}))

vi.mock('../sseClient', () => ({
  clearSSECache: vi.fn(),
}))

vi.mock('../../hooks/mcp/shared', () => ({
  clearClusterCacheOnLogout: vi.fn(),
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STORAGE_KEY_TOKEN = 'token'
const AUTH_USER_CACHE_KEY = 'kc-user-cache'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = btoa('test-signature')
  return `${header}.${body}.${sig}`
}

const apiMod = await import('../api')
const analyticsMod = await import('../analytics')
const permsMod = await import('../../hooks/usePermissions')
const sseMod = await import('../sseClient')
const clusterMod = await import('../../hooks/mcp/shared')
const presenceMod = await import('../../hooks/useActiveUsers')
const dashMod = await import('../dashboards/dashboardSync')

const mockCheckOAuth = apiMod.checkOAuthConfigured as unknown as ReturnType<typeof vi.fn>
const mockEmitLogout = analyticsMod.emitLogout as unknown as ReturnType<typeof vi.fn>
const mockClearPermissions = permsMod.clearPermissionsCache as unknown as ReturnType<typeof vi.fn>
const mockClearSSE = sseMod.clearSSECache as unknown as ReturnType<typeof vi.fn>
const mockClearCluster = clusterMod.clearClusterCacheOnLogout as unknown as ReturnType<typeof vi.fn>
const mockDisconnectPresence = presenceMod.disconnectPresence as unknown as ReturnType<typeof vi.fn>
const mockDashClearCache = dashMod.dashboardSync.clearCache as unknown as ReturnType<typeof vi.fn>

async function renderWithAuthProvider() {
  const { AuthProvider, useAuth } = await import('../auth')
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children)
  return renderHook(() => useAuth(), { wrapper })
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
  vi.unstubAllGlobals()
})

// ============================================================================
// logout() — real token branch (fires POST /auth/logout)
// ============================================================================

describe('logout with real token', () => {
  it('fires POST /auth/logout when token is a real JWT', async () => {
    const realToken = 'real-jwt-token-abc'
    localStorage.setItem(STORAGE_KEY_TOKEN, realToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Clear mocks after initial mount's /api/me call
    mockFetch.mockClear()
    // Mock the logout fetch separately
    mockFetch.mockResolvedValue({ ok: true })

    act(() => {
      result.current.logout()
    })

    // Should have called POST /auth/logout with Bearer token
    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Bearer ${realToken}`,
      }),
    }))

    // Should have cleared all caches
    expect(mockEmitLogout).toHaveBeenCalled()
    expect(mockDashClearCache).toHaveBeenCalled()
    expect(mockClearPermissions).toHaveBeenCalled()
    expect(mockClearSSE).toHaveBeenCalled()
    expect(mockClearCluster).toHaveBeenCalled()
    expect(mockDisconnectPresence).toHaveBeenCalled()
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('still clears client state when /auth/logout fetch rejects', async () => {
    const realToken = 'real-jwt-token-abc'
    localStorage.setItem(STORAGE_KEY_TOKEN, realToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    // First call: /api/me success
    mockFetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
    // Second call: /auth/logout rejects
    mockFetch.mockRejectedValueOnce(new Error('Backend unreachable'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.logout()
    })

    // Client state should still be cleared despite fetch failure
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
  })

  it('does not fire POST /auth/logout for demo token', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockFetch.mockClear()

    act(() => {
      result.current.logout()
    })

    // Should NOT have called /auth/logout for demo token
    expect(mockFetch).not.toHaveBeenCalledWith('/auth/logout', expect.anything())
  })

  // #6010: logout() must scrub every location a token or cached user could
  // live, including sessionStorage, so that a past or future code path that
  // parks credentials there can't leak into the next session. The presence
  // session ID must also be rotated so the next login isn't tracked as a
  // continuation of the logged-out user's session.
  it('clears sessionStorage token, cached user, and presence session ID', async () => {
    const realToken = 'real-jwt-token-xyz'
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, realToken)
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    // Pre-populate sessionStorage with the auth keys the logout handler
    // must clear. The presence session ID is also set because logout must
    // rotate it (#6004).
    const PRESENCE_SESSION_KEY = 'kc-session-id'
    sessionStorage.setItem(STORAGE_KEY_TOKEN, realToken)
    sessionStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    sessionStorage.setItem(PRESENCE_SESSION_KEY, 'stale-presence-id')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.logout()
    })

    // localStorage cleared
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    // sessionStorage fully scrubbed
    expect(sessionStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
    expect(sessionStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    expect(sessionStorage.getItem(PRESENCE_SESSION_KEY)).toBeNull()
    // In-memory state also flushed so no stale reference survives
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()

    sessionStorage.clear()
  })
})

// ============================================================================
// Token expiry timer — checkExpiry logic
// ============================================================================

describe('token expiry timer', () => {
  it('shows expiry warning banner when token is near expiry', async () => {
    // Create a JWT that expires in 15 minutes (within the 30-minute warning threshold)
    const MINUTES_UNTIL_EXPIRY = 15
    const MS_PER_MINUTE = 60_000
    const MS_PER_SECOND = 1000
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const expSec = nowSec + (MINUTES_UNTIL_EXPIRY * 60)
    const nearExpiryToken = makeJwt({ exp: expSec })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()

    // Advance timers to trigger the initial checkExpiry
    await vi.advanceTimersByTimeAsync(100)

    // Banner should appear
    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })
  })

  it('does not show banner when token expiry is far away', async () => {
    // Create a JWT that expires in 2 hours (well beyond the 30-minute warning threshold)
    const HOURS_UNTIL_EXPIRY = 2
    const MS_PER_SECOND = 1000
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const expSec = nowSec + (HOURS_UNTIL_EXPIRY * 3600)
    const farExpiryToken = makeJwt({ exp: expSec })

    localStorage.setItem(STORAGE_KEY_TOKEN, farExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })

  it('removes stale banner when token is refreshed (not near expiry)', async () => {
    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    // Banner should appear
    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    // Simulate token refresh: update localStorage with far-future token
    const HOURS_2 = 2
    const farToken = makeJwt({ exp: nowSec + (HOURS_2 * 3600) })
    localStorage.setItem(STORAGE_KEY_TOKEN, farToken)

    // Advance to next check interval (60 seconds)
    const EXPIRY_CHECK_INTERVAL_MS = 60_000
    await vi.advanceTimersByTimeAsync(EXPIRY_CHECK_INTERVAL_MS)

    // Banner should be removed since token is no longer near expiry
    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).toBeNull()
    })
  })

  it('clicking Refresh Now calls /auth/refresh and refreshes the cookie session on success', async () => {
    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    // First call: /api/me
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    // #6590 — /auth/refresh delivers the new JWT exclusively via the
    // HttpOnly kc_auth cookie. The JSON body carries only
    // { refreshed: true, onboarded } — never the token itself.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ refreshed: true, onboarded: true }),
    })

    // Click the "Refresh Now" button
    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      // Allow the async refresh handler to complete
      await vi.advanceTimersByTimeAsync(100)
    })

    // Banner should be removed
    expect(document.getElementById('session-expiry-warning')).toBeNull()

    // The localStorage token (Bearer) is intentionally NOT mutated by the
    // banner refresh — the refreshed JWT lives in the HttpOnly cookie now.
    // The original Bearer token remains in localStorage as a fallback for
    // legacy code paths that still send Authorization headers.
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(nearExpiryToken)
  })

  it('clicking Refresh Now handles /auth/refresh failure gracefully', async () => {
    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    // First call: /api/me
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    // Setup the /auth/refresh to fail
    mockFetch.mockRejectedValueOnce(new Error('Refresh failed'))

    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await vi.advanceTimersByTimeAsync(100)
    })

    // Banner should still be removed (removed on click regardless of refresh result)
    expect(document.getElementById('session-expiry-warning')).toBeNull()

    // Token should remain unchanged
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(nearExpiryToken)
  })

  it('emits emitSessionRefreshFailure GA4 event when /auth/refresh fails', async () => {
    const { emitSessionRefreshFailure } = await import('../analytics')
    const mockEmitRefreshFailure = vi.mocked(emitSessionRefreshFailure)
    mockEmitRefreshFailure.mockClear()

    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(mockEmitRefreshFailure).toHaveBeenCalledWith('Connection refused')
  })

  it('does NOT emit emitSessionRefreshFailure when /auth/refresh succeeds', async () => {
    const { emitSessionRefreshFailure } = await import('../analytics')
    const mockEmitRefreshFailure = vi.mocked(emitSessionRefreshFailure)
    mockEmitRefreshFailure.mockClear()

    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ refreshed: true, onboarded: true }),
    })

    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(mockEmitRefreshFailure).not.toHaveBeenCalled()
  })

  it('does not run checkExpiry for demo tokens', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    // No banner should appear for demo tokens
    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })

  it('checkExpiry handles token without exp claim (returns early)', async () => {
    // A JWT without exp claim — checkExpiry should return without showing banner
    const noExpToken = makeJwt({ sub: 'user-1' })

    localStorage.setItem(STORAGE_KEY_TOKEN, noExpToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })

  it('checkExpiry handles already-expired token (removes stale banner)', async () => {
    const MS_PER_SECOND = 1000
    const PAST_SECONDS = 100
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const expiredToken = makeJwt({ exp: nowSec - PAST_SECONDS })

    localStorage.setItem(STORAGE_KEY_TOKEN, expiredToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Pre-create a stale banner
    const staleBanner = document.createElement('div')
    staleBanner.id = 'session-expiry-warning'
    document.body.appendChild(staleBanner)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    // Stale banner should be removed for expired tokens
    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })
})

// ============================================================================
// Storage event — additional coverage
// ============================================================================

describe('storage event coverage', () => {
  it('updates token state when storage event fires with new real token', async () => {
    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    // Simulate storage event from another tab with a new real token
    const newToken = 'new-jwt-from-another-tab'
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY_TOKEN,
        newValue: newToken,
      }))
    })

    // Token should be updated in auth state
    expect(result.current.token).toBe(newToken)
  })
})

// ============================================================================
// refreshUser: /auth/refresh returns non-ok
// ============================================================================

describe('token refresh non-ok response', () => {
  it('does not update token when /auth/refresh returns non-ok', async () => {
    const MS_PER_SECOND = 1000
    const MINUTES_15 = 15
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const nearExpiryToken = makeJwt({ exp: nowSec + (MINUTES_15 * 60) })

    localStorage.setItem(STORAGE_KEY_TOKEN, nearExpiryToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    await waitFor(() => {
      expect(document.getElementById('session-expiry-warning')).not.toBeNull()
    })

    // /auth/refresh returns 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await vi.advanceTimersByTimeAsync(100)
    })

    // Token should remain the original near-expiry token
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(nearExpiryToken)
  })
})

// ============================================================================
// #6058 — isJWTExpired helper + isAuthenticated getter
// ============================================================================

describe('isJWTExpired helper (#6058)', () => {
  it('returns true for a JWT whose exp has passed', async () => {
    const { isJWTExpired } = await import('../auth')
    const MS_PER_SECOND = 1000
    const PAST_SECONDS = 100
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const expiredToken = makeJwt({ exp: nowSec - PAST_SECONDS })
    expect(isJWTExpired(expiredToken)).toBe(true)
  })

  it('returns false for a JWT whose exp is in the future', async () => {
    const { isJWTExpired } = await import('../auth')
    const MS_PER_SECOND = 1000
    const FUTURE_SECONDS = 3600
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const freshToken = makeJwt({ exp: nowSec + FUTURE_SECONDS })
    expect(isJWTExpired(freshToken)).toBe(false)
  })

  it('returns false for a non-JWT opaque token (cannot determine expiry)', async () => {
    const { isJWTExpired } = await import('../auth')
    expect(isJWTExpired('opaque-server-token')).toBe(false)
  })

  it('isAuthenticated returns false for an expired JWT (#6058)', async () => {
    const MS_PER_SECOND = 1000
    const PAST_SECONDS = 100
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    const expiredToken = makeJwt({ exp: nowSec - PAST_SECONDS })
    localStorage.setItem(STORAGE_KEY_TOKEN, expiredToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    // Regardless of loading state, an expired token must never count as authenticated.
    expect(result.current.isAuthenticated).toBe(false)
  })
})

// ============================================================================
// #6067 — cached user age bound
// ============================================================================

describe('cached user staleness bound (#6067)', () => {
  const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'
  const FIVE_MIN_MS = 5 * 60 * 1_000

  it('trusts cached user when validated within MAX_CACHED_USER_AGE_MS', async () => {
    const cachedUser = { id: 'fresh', github_id: '1', github_login: 'fresh', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    // Validated 1 minute ago — well within the 5-minute bound
    const ONE_MIN_MS = 60 * 1_000
    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now() - ONE_MIN_MS))

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toEqual(cachedUser)
    expect(result.current.token).toBe('real-token')
  })

  it('drops cached user when older than MAX_CACHED_USER_AGE_MS', async () => {
    const cachedUser = { id: 'stale', github_id: '1', github_login: 'stale', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    // Validated 10 minutes ago — past the 5-minute bound
    const TEN_MIN_MS = 10 * 60 * 1_000
    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now() - TEN_MIN_MS))

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    // Stale cache + failed refetch fires setTokenState(null)/setUser(null) —
    // wait for both flushes, not just the isLoading flip.
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.token).toBeNull()
      expect(result.current.user).toBeNull()
    })
  })

  it('writes validated timestamp after successful /api/me fetch', async () => {
    const fetchedUser = { id: 'u1', github_id: '1', github_login: 'u1', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-token')

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(fetchedUser) })
    vi.stubGlobal('fetch', mockFetch)

    const before = Date.now()
    await renderWithAuthProvider()
    await waitFor(() => {
      expect(localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY)).not.toBeNull()
    })
    const validated = Number(localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY))
    expect(validated).toBeGreaterThanOrEqual(before)
    expect(FIVE_MIN_MS).toBeGreaterThan(0) // sanity-reference the constant
  })
})

// ============================================================================
// #6065 — cross-tab logout
// ============================================================================

describe('cross-tab logout (#6065)', () => {
  it('clears local state when storage event fires with newValue=null', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    // Prevent jsdom navigation errors when the handler sets location.href
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      href: '/',
      pathname: '/dashboard',
    } as unknown as Location

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY_TOKEN,
        newValue: null,
      }))
    })

    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()

    ;(window as unknown as { location: Location }).location = originalLocation
  })
})

// ============================================================================
// #6069 — proactive logout on expiry
// ============================================================================

describe('proactive logout on expiry (#6069)', () => {
  it('calls logout() when timeUntilExpiry drops below zero', async () => {
    const MS_PER_SECOND = 1000
    const TWO_MINUTES_SEC = 120
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND)
    // Token expires in 2 minutes — inside the 30-minute warning threshold
    const aboutToExpireToken = makeJwt({ exp: nowSec + TWO_MINUTES_SEC })

    localStorage.setItem(STORAGE_KEY_TOKEN, aboutToExpireToken)
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)

    // Fast-forward past the token exp (2 min + buffer) and past the next
    // checkExpiry interval (60s) so the proactive logout fires.
    const THREE_MINUTES_MS = 3 * 60 * 1_000
    await vi.advanceTimersByTimeAsync(THREE_MINUTES_MS)

    // After expiry, the interval should have invoked logout() which clears
    // the in-memory token.
    expect(result.current.token).toBeNull()
  })
})
