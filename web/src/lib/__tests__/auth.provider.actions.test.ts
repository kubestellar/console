import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'
import { AUTH_USER_CACHE_KEY, mockCheckOAuth, mockCheckOAuthWithRetry, mockClearCache, mockEmitConversionStep, mockEmitLogin, mockEmitLogout, readStoredSessionToken, renderWithAuthProvider, STORAGE_KEY_TOKEN } from './auth.shared'

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
})
