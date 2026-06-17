import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'
import { AUTH_TOKEN_SYNC_KEY, AUTH_USER_CACHE_KEY, mockCheckOAuth, mockCheckOAuthWithRetry, mockSetGlobalDemoMode, renderWithAuthProvider, STORAGE_KEY_TOKEN } from './auth.shared'

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
