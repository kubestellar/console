/**
 * Focused auth provider and caching tests for auth.tsx.
 * Covers user cache helpers, useAuth fallback behavior,
 * expiry banner DOM behavior, and AuthProvider integration.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
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
}))

vi.mock('../demoMode', () => ({
  setDemoMode: vi.fn(),
  setGlobalDemoMode: vi.fn(),
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
// Constants matching auth.tsx internals
// ---------------------------------------------------------------------------
const AUTH_USER_CACHE_KEY = 'kc-user-cache'
const STORAGE_KEY_TOKEN = 'token'
const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

async function readStoredSessionToken(): Promise<string | null> {
  return getStoredAuthToken()
}


function getCachedUser(): unknown | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

// cacheUser
function cacheUser(userData: unknown | null) {
  if (userData) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(userData))
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
  }
}

beforeEach(() => {
  localStorage.clear()
  // Clean up any DOM elements from previous tests
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

afterEach(() => {
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

// ============================================================================
// AuthProvider — full integration tests exercising the real module
// ============================================================================


const apiMod = await import('../api')
const dashMod = await import('../dashboards/dashboardSync')
const analyticsMod = await import('../analytics')
const demoMod = await import('../demoMode')

// Cast to vi.Mock for type-safe mock API
const mockCheckOAuth = apiMod.checkOAuthConfigured as unknown as ReturnType<typeof vi.fn>
// #6055 — retry helper is the one auth.tsx actually calls on the no-token path
const mockCheckOAuthWithRetry = apiMod.checkOAuthConfiguredWithRetry as unknown as ReturnType<typeof vi.fn>
const mockClearCache = dashMod.dashboardSync.clearCache as unknown as ReturnType<typeof vi.fn>
const mockEmitLogin = analyticsMod.emitLogin as unknown as ReturnType<typeof vi.fn>
const mockEmitLogout = analyticsMod.emitLogout as unknown as ReturnType<typeof vi.fn>
const mockEmitConversionStep = analyticsMod.emitConversionStep as unknown as ReturnType<typeof vi.fn>
const mockSetAnalyticsUserId = analyticsMod.setAnalyticsUserId as unknown as ReturnType<typeof vi.fn>
const mockSetAnalyticsUserProperties = analyticsMod.setAnalyticsUserProperties as unknown as ReturnType<typeof vi.fn>
const mockEmitDeveloperSession = analyticsMod.emitDeveloperSession as unknown as ReturnType<typeof vi.fn>
const mockSetGlobalDemoMode = demoMod.setDemoMode as unknown as ReturnType<typeof vi.fn>

// Helper: render useAuth inside AuthProvider using dynamic import
async function renderWithAuthProvider() {
  const { AuthProvider, useAuth } = await import('../auth')

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children)

  return renderHook(() => useAuth(), { wrapper })
}

describe('AuthProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    await clearStoredAuthToken()
    document.getElementById('session-expiry-warning')?.remove()
    document.getElementById('session-banner-animation')?.remove()
    // Default: backend down, no OAuth
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })
    // #6055 — default the retry helper to the same "backend down" result
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: false, oauthConfigured: false })
    // Mock global fetch for /api/me calls
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
    await clearStoredAuthToken()
  })

  // ---------- Initial state ----------
  it('starts in loading state when no token exists', async () => {
    const { result } = await renderWithAuthProvider()

    // Initially loading because no token and no cached user
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('is not loading initially when token + cached user exist', async () => {
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'some-real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const { result } = await renderWithAuthProvider()

    // Has token + has cached user -> not loading (stale-while-revalidate)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.user).toEqual(cachedUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  // ---------- refreshUser: no token, backend down -> demo mode ----------

  it('auto-enables demo mode when no token and backend is down', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result} = await renderWithAuthProvider()

    // Wait for refreshUser() to resolve
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.token).toBe('demo-token')
    expect(result.current.user?.github_login).toBe('demo-user')
    expect(result.current.isAuthenticated).toBe(true)
  })

  // ---------- refreshUser: no token, backend up + OAuth -> stay on login ----------

  it('does not auto-enable demo mode when backend is up with OAuth', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: true })
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: true, oauthConfigured: true })
    // #6066 — when backend is up with OAuth, refreshUser attempts the cookie-restore
    // path via POST /auth/refresh. Mock it to fail so we fall through to "show login".
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should not enter demo mode — user should see login page
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
  })

  // ---------- refreshUser: no token, checkOAuth throws -> demo mode ----------

  it('falls back to demo mode when checkOAuthConfigured throws', async () => {
    mockCheckOAuth.mockRejectedValue(new Error('network error'))
    // #6055 — retry helper is what auth.tsx actually calls; mimic the underlying throw
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.token).toBe('demo-token')
    expect(result.current.user?.id).toBe('demo-user')
  })

  // ---------- refreshUser: demo token, user explicitly enabled demo ----------

  it('stays in demo mode when user explicitly enabled it', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.token).toBe('demo-token')
    expect(result.current.user?.id).toBe('demo-user')
  })

  // ---------- refreshUser: demo token, backend up, no OAuth -> stay demo ----------

  it('stays in demo mode when backend is up but no OAuth configured', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.token).toBe('demo-token')
    expect(result.current.user?.id).toBe('demo-user')
  })

  // ---------- refreshUser: demo token, backend up + OAuth -> clear token ----------

  it('clears demo token when backend is up with OAuth configured', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: true })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should clear token so login page appears
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
  })

  // ---------- refreshUser: real token, /api/me success ----------

  it('fetches user from /api/me when real token exists', async () => {
    const realUser = {
      id: 'user-42',
      github_id: '42',
      github_login: 'realuser',
      email: 'real@example.com',
      onboarded: true,
    }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(realUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(realUser)
    expect(result.current.token).toBe('real-jwt-token')
    expect(mockSetAnalyticsUserId).toHaveBeenCalledWith('user-42')
    expect(mockSetAnalyticsUserProperties).toHaveBeenCalledWith({ auth_mode: 'github-oauth' })
    expect(mockEmitDeveloperSession).toHaveBeenCalled()
  })

  // ---------- refreshUser: real token, /api/me fails, cached user exists ----------

  it('falls back to fresh cached user when /api/me fails (#6067)', async () => {
    const cachedUser = { id: 'cached-1', github_id: '1', github_login: 'cached', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    // #6067 — cache was validated just now, so it's fresh and should be trusted
    localStorage.setItem('kc-user-cache-validated', String(Date.now()))

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(cachedUser)
    expect(result.current.token).toBe('real-jwt-token')
  })

  // ---------- #6067 — stale cache drops to login ----------

  it('drops session to login when /api/me fails and cache is stale (#6067)', async () => {
    const cachedUser = { id: 'cached-1', github_id: '1', github_login: 'cached', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    // Cache validated 1 hour ago — well past MAX_CACHED_USER_AGE_MS (5 min)
    const ONE_HOUR_MS = 60 * 60 * 1_000
    localStorage.setItem('kc-user-cache-validated', String(Date.now() - ONE_HOUR_MS))

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    // #6144 — When a token AND cached user both exist in localStorage,
    // AuthProvider starts with isLoading=false (stale-while-revalidate), so
    // waiting on isLoading resolves BEFORE refreshUser's async catch block
    // has a chance to clear the token. Wait directly for the token to be
    // cleared by the stale-cache drop path instead.
    //
    // #6175 — bump the waitFor timeout from the default 1000ms to 5000ms.
    // The default is enough locally but flakes in the coverage suite where
    // istanbul instrumentation slows the async unwind (refreshUser →
    // catch → setTokenState(null) → React commit) past 1s. 5s is generous
    // and still completes in <100ms on a healthy run.
    await waitFor(
      () => {
        expect(result.current.token).toBeNull()
      },
      { timeout: 5_000 },
    )

    // Stale cache → session dropped (token cleared, user null)
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
  })

  // ---------- refreshUser: real token, /api/me fails, no cache -> drops session ----------

  it('drops session when /api/me fails and no cache (#6067)', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // No cache → dropped to login (not demo mode anymore per #6067)
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
  })

  // ---------- refreshUser: real token, /api/me returns non-ok ----------

  it('drops session when /api/me returns non-ok (#6067)', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // No cache → session dropped
    expect(result.current.token).toBeNull()
  })

  // ---------- refreshUser: real token, /api/me returns invalid JSON ----------

  it('drops session when /api/me returns invalid JSON (#6067)', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(null),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // null userData → session dropped
    expect(result.current.token).toBeNull()
  })

  // ---------- logout ----------

  it('clears user, token, and localStorage on logout', async () => {
    // Start authenticated
    await setStoredAuthToken('demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.isAuthenticated).toBe(true)

    await act(async () => {
      await result.current.logout()
    })

    await waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(result.current.token).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })
    await expect(getStoredAuthToken()).resolves.toBeNull()
    expect(mockEmitLogout).toHaveBeenCalled()
    expect(mockClearCache).toHaveBeenCalled()
  })

  // ---------- setToken ----------

  it('setToken stores token and sets temporary user', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setToken('new-jwt-token', true)
    })

    await waitFor(() => expect(result.current.token).toBe('new-jwt-token'))
    await expect(readStoredSessionToken()).resolves.toBe('new-jwt-token')
    // setToken clears cached user (cacheUser(null))
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    // Sets a temp user with onboarded flag
    expect(result.current.user?.onboarded).toBe(true)
  })

  // ---------- login: demo mode when backend down ----------

  it('login() enters demo mode when backend is down', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Reset mocks after initial mount
    vi.clearAllMocks()
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    await act(async () => {
      await result.current.login()
    })

    expect(mockEmitLogin).toHaveBeenCalledWith('demo')
    expect(mockEmitConversionStep).toHaveBeenCalledWith(2, 'login', { method: 'demo' })
  })

  // ---------- login: OAuth redirect when backend up + OAuth configured ----------

  it('login() redirects to /auth/github when backend is up with OAuth', async () => {
    // First call (mount): backend down -> demo mode
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now simulate backend coming up for login()
    vi.clearAllMocks()
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: true })

    // We can't spy on window.location.href in jsdom, so verify the analytics
    // event was emitted for github-oauth. The actual redirect (window.location.href
    // assignment) will throw in jsdom but the function path is still exercised.
    try {
      await act(async () => {
        await result.current.login()
      })
    } catch {
      // jsdom may throw on location assignment — that's fine
    }

    expect(mockEmitLogin).toHaveBeenCalledWith('github-oauth')
    expect(mockEmitConversionStep).toHaveBeenCalledWith(2, 'login', { method: 'github-oauth' })
  })

  // ---------- setDemoMode respects explicit disable ----------

  it('setDemoMode does nothing when user explicitly disabled demo', async () => {
    localStorage.setItem('kc-demo-mode', 'false')
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should NOT have entered demo mode because kc-demo-mode is 'false'
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
  })

  // ---------- Storage event listener ----------

  it('updates token when auth sync event fires with a new session token', async () => {
    await setStoredAuthToken('demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const newToken = 'refreshed-jwt-token'
    await act(async () => {
      await setStoredAuthToken(newToken)
      window.dispatchEvent(new StorageEvent('storage', {
        key: AUTH_TOKEN_SYNC_KEY,
        newValue: JSON.stringify({ state: 'session', ts: Date.now() }),
      }))
    })

    await waitFor(() => expect(result.current.token).toBe(newToken))
  })

  it('ignores storage events for non-token keys', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const tokenBefore = result.current.token

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'some-other-key',
        newValue: 'irrelevant',
      }))
    })

    expect(result.current.token).toBe(tokenBefore)
  })

  it('ignores storage events with demo token value', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt')
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(cachedUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Storage event with demo token should be ignored
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY_TOKEN,
        newValue: 'demo-token',
      }))
    })

    // Token should not change to demo-token
    expect(result.current.token).not.toBe('demo-token')
  })

  // ---------- demo user onboarded flag ----------

  it('demo user has onboarded=true when STORAGE_KEY_ONBOARDED is set', async () => {
    localStorage.setItem('demo-user-onboarded', 'true')
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user?.onboarded).toBe(true)
  })
})
