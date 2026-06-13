import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { AUTH_TOKEN_SYNC_KEY, getStoredAuthToken, setStoredAuthToken } from '../authToken'

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
  checkOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
}))

vi.mock('../dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: vi.fn() },
}))

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

const STORAGE_KEY_TOKEN = 'token'
const AUTH_USER_CACHE_KEY = 'kc-user-cache'
const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'

function makeAuthSyncEvent(state: 'cleared' | 'demo' | 'session'): string {
  return JSON.stringify({ state, ts: Date.now() })
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = btoa('test-signature')
  return `${header}.${body}.${sig}`
}

const analyticsMod = await import('../analytics')
const permsMod = await import('../../hooks/usePermissions')
const sseMod = await import('../sseClient')
const clusterMod = await import('../../hooks/mcp/shared')
const presenceMod = await import('../../hooks/useActiveUsers')
const dashMod = await import('../dashboards/dashboardSync')

const mockEmitLogout = analyticsMod.emitLogout as unknown as ReturnType<typeof vi.fn>
const mockClearPermissions = permsMod.clearPermissionsCache as unknown as ReturnType<typeof vi.fn>
const mockClearSSE = sseMod.clearSSECache as unknown as ReturnType<typeof vi.fn>
const mockClearCluster = clusterMod.clearClusterCacheOnLogout as unknown as ReturnType<typeof vi.fn>
const mockDisconnectPresence = presenceMod.disconnectPresence as unknown as ReturnType<typeof vi.fn>
const mockDashClearCache = dashMod.dashboardSync.clearCache as unknown as ReturnType<typeof vi.fn>

async function renderWithAuthProvider() {
  const { AuthProvider, useAuth } = await import('../auth')
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(AuthProvider, null, children)
  return renderHook(() => useAuth(), { wrapper })
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) }))
  await setStoredAuthToken(null)
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
  localStorage.clear()
  sessionStorage.clear()
  await setStoredAuthToken(null)
})

describe('auth coverage regressions', () => {
  it('posts /auth/logout for real tokens and clears client caches', async () => {
    const realToken = 'real-jwt-token-abc'
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal)
    await setStoredAuthToken(realToken)
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      if (input === '/api/me') {
        return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
      }
      if (input === '/auth/logout') {
        return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}) })
      }
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}) })
    }, 15000)
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.logout()

    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: `Bearer ${realToken}` }),
    }))
    expect(mockEmitLogout).toHaveBeenCalled()
    expect(mockDashClearCache).toHaveBeenCalled()
    expect(mockClearPermissions).toHaveBeenCalled()
    expect(mockClearSSE).toHaveBeenCalled()
    expect(mockClearCluster).toHaveBeenCalled()
    expect(mockDisconnectPresence).toHaveBeenCalled()
    await waitFor(() => {
      expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    })
    await expect(getStoredAuthToken()).resolves.toBeNull()
  })

  it('skips /auth/logout for demo tokens', async () => {
    await setStoredAuthToken('demo-token')
    localStorage.setItem('kc-demo-mode', 'true')

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    mockFetch.mockClear()
    await act(async () => {
      await result.current.logout()
    })

    expect(mockFetch).not.toHaveBeenCalledWith('/auth/logout', expect.anything())
    await expect(getStoredAuthToken()).resolves.toBeNull()
  })

  it('shows the expiry banner for near-expiry JWTs and refreshes via cookie session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const nowSec = Math.floor(Date.now() / 1000)
    const nearExpiryToken = makeJwt({ exp: nowSec + (15 * 60) })
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    await setStoredAuthToken(nearExpiryToken)
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      if (input === '/api/me') {
        return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue(cachedUser) })
      }
      if (input === '/auth/refresh') {
        return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({ refreshed: true, onboarded: true }) })
      }
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderWithAuthProvider()
    await vi.advanceTimersByTimeAsync(100)
    await waitFor(() => expect(document.getElementById('session-expiry-warning')).not.toBeNull())

    const button = document.querySelector('#session-expiry-warning button') as HTMLButtonElement | null
    expect(button).not.toBeNull()
    await act(async () => {
      button?.click()
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(mockFetch).toHaveBeenCalledWith('/auth/refresh', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }))
  })

  it('keeps a fresh cached user when /api/me fails temporarily', async () => {
    const cachedUser = { id: 'fresh', github_id: '1', github_login: 'fresh', onboarded: true }
    await setStoredAuthToken('real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now() - 60_000))

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/me', expect.anything())
      expect(result.current.user?.github_login).toBe('fresh')
    })
    await expect(getStoredAuthToken()).resolves.toBe('real-token')
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBe(JSON.stringify(cachedUser))
  })

  it('drops stale cached users when /api/me cannot be refreshed', async () => {
    const cachedUser = { id: 'stale', github_id: '1', github_login: 'stale', onboarded: true }
    await setStoredAuthToken('real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now() - (10 * 60_000)))

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = await renderWithAuthProvider()
    await waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    })
    await expect(getStoredAuthToken()).resolves.toBeNull()
  })

  it('clears auth state when a cross-tab cleared sync event arrives', async () => {
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'test', onboarded: true }
    await setStoredAuthToken('real-token')
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    window.history.pushState({}, '', '/login')

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => {
      await setStoredAuthToken(null)
      window.dispatchEvent(new StorageEvent('storage', {
        key: AUTH_TOKEN_SYNC_KEY,
        newValue: makeAuthSyncEvent('cleared'),
      }))
    })

    await waitFor(() => {
      expect(result.current.token).toBeNull()
      expect(result.current.user).toBeNull()
    })
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    await expect(getStoredAuthToken()).resolves.toBeNull()
  })

  it('isJWTExpired handles past, future, and opaque tokens', async () => {
    const { isJWTExpired } = await import('../auth')
    const nowSec = Math.floor(Date.now() / 1000)
    expect(isJWTExpired(makeJwt({ exp: nowSec - 100 }))).toBe(true)
    expect(isJWTExpired(makeJwt({ exp: nowSec + 3600 }))).toBe(false)
    expect(isJWTExpired('opaque-server-token')).toBe(false)
  })
})
