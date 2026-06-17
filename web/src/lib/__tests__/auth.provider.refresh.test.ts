import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'
import { AUTH_USER_CACHE_KEY, mockCheckOAuth, mockCheckOAuthWithRetry, mockEmitDeveloperSession, mockSetAnalyticsUserId, mockSetAnalyticsUserProperties, renderWithAuthProvider, STORAGE_KEY_TOKEN } from './auth.shared'

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
})
