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
  it('demo user has onboarded=false when STORAGE_KEY_ONBOARDED is not set', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user?.onboarded).toBe(false)
  })

  // ---------- isLoading: token exists but no cached user → loading ----------

  it('starts in loading state when token exists but no cached user', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'some-real-token')
    // No cached user in localStorage

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'u1', github_id: '1', github_login: 'test', onboarded: true,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    // isLoading should start true because we have token but no cache
    // (stale-while-revalidate does not apply)
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  // ---------- refreshUser: /api/me returns non-ok status with cached user → use cache ----------

  it('uses fresh cached user when /api/me returns 403 status (#6067)', async () => {
    const cachedUser = { id: 'cached-403', github_id: '403', github_login: 'cached403', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    // Fresh cache — trusted by #6067 stale-cache bound
    localStorage.setItem('kc-user-cache-validated', String(Date.now()))

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // /api/me returned 403 → throws → falls back to cached user
    expect(result.current.user).toEqual(cachedUser)
    expect(result.current.token).toBe('real-jwt-token')
  })

  // ---------- refreshUser: /api/me .json() throws → treats as invalid JSON ----------

  it('drops session when /api/me returns ok but .json() throws (#6067)', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // .json().catch(() => null) returns null → "Invalid JSON from /api/me" → session dropped
    expect(result.current.token).toBeNull()
  })

  // ---------- refreshUser with overrideToken ----------

  it('refreshUser uses overrideToken when provided', async () => {
    const realUser = {
      id: 'override-user',
      github_id: '99',
      github_login: 'override',
      email: 'override@example.com',
      onboarded: true,
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(realUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Start with no token — demo mode auto-enables on mount
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now manually call refreshUser with an override token
    await act(async () => {
      await result.current.refreshUser('override-jwt')
    })

    // fetch should have been called with the override token in Authorization header
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer override-jwt' },
      }),
    )
    expect(result.current.user).toEqual(realUser)
  })

  // ---------- setToken with onboarded=false ----------

  it('setToken stores token with onboarded=false and temp user reflects it', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.setToken('new-token', false)
    })

    expect(result.current.token).toBe('new-token')
    expect(result.current.user?.onboarded).toBe(false)
    expect(result.current.user?.id).toBe('')
  })

  // ---------- login: checkOAuth throws → demo mode ----------

  it('login() enters demo mode when checkOAuthConfigured throws', async () => {
    // Mount with backend down
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.clearAllMocks()
    mockCheckOAuth.mockRejectedValue(new Error('network failure'))

    await act(async () => {
      await result.current.login()
    })

    expect(mockEmitLogin).toHaveBeenCalledWith('demo')
    expect(result.current.token).toBe('demo-token')
  })

  // ---------- login: backend up, no OAuth → demo mode ----------

  it('login() enters demo mode when backend is up but no OAuth configured', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.clearAllMocks()
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: false })

    await act(async () => {
      await result.current.login()
    })

    expect(mockEmitLogin).toHaveBeenCalledWith('demo')
    expect(mockEmitConversionStep).toHaveBeenCalledWith(2, 'login', { method: 'demo' })
  })

  // ---------- #20823: in-cluster + no OAuth → passwordless dev-login ----------

  /** Replace window.location with a stub exposing an assign() spy. Returns a restore fn. */
  function stubWindowLocation(): { assignSpy: ReturnType<typeof vi.fn>; restore: () => void } {
    const originalLocation = window.location
    const assignSpy = vi.fn()
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      href: '/',
      hostname: 'localhost',
      assign: assignSpy,
    } as unknown as Location
    return {
      assignSpy,
      restore: () => {
        ;(window as unknown as { location: Location }).location = originalLocation
      },
    }
  }

  it('login() redirects to dev-login when in-cluster with no OAuth (#20823)', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.clearAllMocks()
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: false, inCluster: true })

    const { assignSpy, restore } = stubWindowLocation()
    try {
      await act(async () => {
        await result.current.login()
      })

      expect(assignSpy).toHaveBeenCalledWith('/auth/github')
      expect(mockEmitLogin).toHaveBeenCalledWith('dev-login')
      // Must NOT fall into demo mode
      expect(mockEmitLogin).not.toHaveBeenCalledWith('demo')
    } finally {
      restore()
    }
  })

  it('login({ preferDemo: true }) skips the in-cluster dev-login redirect (#20823)', async () => {
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.clearAllMocks()
    mockCheckOAuth.mockResolvedValue({ backendUp: true, oauthConfigured: false, inCluster: true })

    const { assignSpy, restore } = stubWindowLocation()
    try {
      await act(async () => {
        await result.current.login({ preferDemo: true })
      })

      expect(assignSpy).not.toHaveBeenCalled()
      expect(mockEmitLogin).toHaveBeenCalledWith('demo')
      expect(result.current.token).toBe('demo-token')
    } finally {
      restore()
    }
  })

  it('refreshUser() redirects to dev-login when in-cluster, no OAuth, no explicit demo (#20823)', async () => {
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: true, oauthConfigured: false, inCluster: true })

    const { assignSpy, restore } = stubWindowLocation()
    try {
      const { result } = await renderWithAuthProvider()
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(assignSpy).toHaveBeenCalledWith('/auth/github')
      // Must NOT fall into demo mode while redirecting
      expect(result.current.token).toBeNull()
    } finally {
      restore()
    }
  })

  it('refreshUser() stays in demo mode when user explicitly enabled demo, even in-cluster (#20823)', async () => {
    localStorage.setItem('kc-demo-mode', 'true')
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: true, oauthConfigured: false, inCluster: true })

    const { assignSpy, restore } = stubWindowLocation()
    try {
      const { result } = await renderWithAuthProvider()
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(assignSpy).not.toHaveBeenCalled()
      expect(result.current.token).toBe('demo-token')
      expect(result.current.user?.id).toBe('demo-user')
    } finally {
      restore()
    }
  })

  it('refreshUser() enters demo mode when backend up, no OAuth, NOT in-cluster (existing behavior)', async () => {
    mockCheckOAuthWithRetry.mockResolvedValue({ backendUp: true, oauthConfigured: false, inCluster: false })

    const { assignSpy, restore } = stubWindowLocation()
    try {
      const { result } = await renderWithAuthProvider()
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(assignSpy).not.toHaveBeenCalled()
      expect(result.current.token).toBe('demo-token')
    } finally {
      restore()
    }
  })

  // ---------- storage event: null newValue clears local state (#6065) ----------
  // Behavior changed in #6065 — previously `null` was ignored; now the other
  // tab's logout is mirrored locally so both tabs end up logged out.

  it('clears local auth state when auth sync event reports logout (#6065)', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    // Stub window.location.href to avoid jsdom navigation noise
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
        key: AUTH_TOKEN_SYNC_KEY,
        newValue: JSON.stringify({ state: 'cleared', ts: Date.now() }),
      }))
    })

    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()

    ;(window as unknown as { location: Location }).location = originalLocation
  })

  // ---------- refreshUser: demo token, backend down, explicit demo → stay demo ----------

  it('stays in demo mode when demo token + backend down + explicit demo enabled', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    mockCheckOAuth.mockResolvedValue({ backendUp: false, oauthConfigured: false })

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.token).toBe('demo-token')
    expect(result.current.user?.id).toBe('demo-user')
    expect(mockSetGlobalDemoMode).toHaveBeenCalledWith(true)
  })

  // ---------- /api/me success caches user in localStorage ----------

  it('caches user in localStorage after successful /api/me fetch', async () => {
    const realUser = {
      id: 'cache-test',
      github_id: '55',
      github_login: 'cachetest',
      onboarded: true,
    }
    localStorage.setItem(STORAGE_KEY_TOKEN, 'real-jwt')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(realUser),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()

    await waitFor(() => {
      const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
      expect(cached).not.toBeNull()
      expect(JSON.parse(cached!)).toEqual(realUser)
    })
  })

  // ---------- logout clears user cache from localStorage ----------

  it('logout removes user cache from localStorage', async () => {
    await setStoredAuthToken('demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Verify cache is set (demo user gets cached)
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).not.toBeNull()

    await act(async () => {
      await result.current.logout()
    })

    await waitFor(() => expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull())
    await expect(getStoredAuthToken()).resolves.toBeNull()
  })
})
