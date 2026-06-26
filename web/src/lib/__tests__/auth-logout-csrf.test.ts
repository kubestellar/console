import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { setStoredAuthToken } from '../authToken'

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
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

const AUTH_USER_CACHE_KEY = 'kc-user-cache'

async function renderWithAuthProvider() {
  const { AuthProvider, useAuth } = await import('../auth')
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children)
  return renderHook(() => useAuth(), { wrapper })
}

describe('logout CSRF protection', () => {
  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.stubGlobal('fetch', vi.fn())
    await setStoredAuthToken(null)
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
    await setStoredAuthToken(null)
  })

  it('adds X-Requested-With header to logout fetch', async () => {
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
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = await renderWithAuthProvider()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.logout()

    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Bearer ${realToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      }),
    }))
  }, 15000)
})
