// Unit tests for AuthProvider (web/src/lib/auth/AuthContext.tsx), which had
// 0% unit coverage before this file — see #24175. These tests exercise the
// logic that the e2e suites (oauth-flow.spec.ts, Login.spec.ts,
// demo-mode-banner.spec.ts) only cover indirectly through full-page
// rendering: the logout() cleanup sequence, setToken()'s cache-busting
// behaviour, and the isAuthenticated/isLoading derivation branches.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

const {
  mockClearStoredAuthToken,
  mockGetStoredAuthToken,
  mockGetStoredAuthTokenSync,
  mockSetStoredAuthToken,
  mockParseAuthTokenSyncEvent,
  mockClearAgentToken,
  mockSetAgentToken,
  mockClearPermissionsCache,
  mockDisconnectPresence,
  mockClearSSECache,
  mockClearClusterCacheOnLogout,
  mockClearCache,
  mockSetGlobalDemoMode,
  mockCheckOAuthConfigured,
  mockCheckOAuthConfiguredWithRetry,
} = vi.hoisted(() => ({
  mockClearStoredAuthToken: vi.fn().mockResolvedValue(undefined),
  mockGetStoredAuthToken: vi.fn().mockResolvedValue(null),
  mockGetStoredAuthTokenSync: vi.fn().mockReturnValue(null),
  mockSetStoredAuthToken: vi.fn().mockResolvedValue(undefined),
  mockParseAuthTokenSyncEvent: vi.fn().mockReturnValue(null),
  mockClearAgentToken: vi.fn(),
  mockSetAgentToken: vi.fn(),
  mockClearPermissionsCache: vi.fn(),
  mockDisconnectPresence: vi.fn(),
  mockClearSSECache: vi.fn(),
  mockClearClusterCacheOnLogout: vi.fn(),
  mockClearCache: vi.fn(),
  mockSetGlobalDemoMode: vi.fn(),
  mockCheckOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false }),
  mockCheckOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false }),
}))


vi.mock('../../authToken', () => ({
  AUTH_TOKEN_SYNC_KEY: 'kc-auth-token-sync',
  clearStoredAuthToken: mockClearStoredAuthToken,
  getStoredAuthToken: mockGetStoredAuthToken,
  getStoredAuthTokenSync: mockGetStoredAuthTokenSync,
  setStoredAuthToken: mockSetStoredAuthToken,
  parseAuthTokenSyncEvent: mockParseAuthTokenSyncEvent,
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({
  clearAgentToken: mockClearAgentToken,
  setAgentToken: mockSetAgentToken,
}))

vi.mock('../../../hooks/usePermissions', () => ({
  clearPermissionsCache: mockClearPermissionsCache,
}))

vi.mock('../../../hooks/useActiveUsers', () => ({
  disconnectPresence: mockDisconnectPresence,
}))

vi.mock('../../sseClient', () => ({
  clearSSECache: mockClearSSECache,
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  clearClusterCacheOnLogout: mockClearClusterCacheOnLogout,
}))

vi.mock('../../dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: mockClearCache },
}))

vi.mock('../../demoMode', () => ({
  setDemoMode: mockSetGlobalDemoMode,
}))

vi.mock('../../api', () => ({
  checkOAuthConfigured: mockCheckOAuthConfigured,
  checkOAuthConfiguredWithRetry: mockCheckOAuthConfiguredWithRetry,
}))

vi.mock('../../analytics', () => ({
  emitLogin: vi.fn(),
  emitLogout: vi.fn(),
  setAnalyticsUserId: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitConversionStep: vi.fn(),
  emitDeveloperSession: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}))

vi.mock('../../devLogin', () => ({
  redirectToDevLogin: vi.fn(),
}))

vi.mock('../../schemas', () => ({
  AuthRefreshResponseSchema: {},
  UserSchema: {},
}))

vi.mock('../../schemas/validate', () => ({
  validateResponse: vi.fn((_schema: unknown, data: unknown) => data),
}))

import { AuthContext } from '../context'
import { AuthProvider } from '../AuthContext'
import { useContext } from 'react'
import { AUTH_USER_CACHE_KEY } from '../tokenHelpers'
import { DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_HAS_SESSION } from '../../constants'

function Probe() {
  const ctx = useContext(AuthContext)
  if (!ctx) return null
  return (
    <div>
      <span data-testid="is-authenticated">{String(ctx.isAuthenticated)}</span>
      <span data-testid="is-loading">{String(ctx.isLoading)}</span>
      <span data-testid="token">{ctx.token ?? 'null'}</span>
      <span data-testid="user">{ctx.user ? ctx.user.github_login : 'null'}</span>
      <button onClick={() => ctx.logout()}>logout</button>
      <button onClick={() => ctx.setToken('new-token', true)}>set-token</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockCheckOAuthConfigured.mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false })
    mockCheckOAuthConfiguredWithRetry.mockResolvedValue({ backendUp: false, oauthConfigured: false, inCluster: false })
    mockGetStoredAuthToken.mockResolvedValue(null)
    mockGetStoredAuthTokenSync.mockReturnValue(null)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable in test')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('logout()', () => {
    it('clears every cache/session store and disconnects presence', async () => {
      // Use a real (non-demo) token so the mount-time refreshUser() effect
      // doesn't race logout() by asynchronously caching a demo user.
      mockGetStoredAuthTokenSync.mockReturnValue('real-jwt-token')
      mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')

      renderProvider()

      act(() => { screen.getByText('logout').click() })

      await waitFor(() => {
        expect(mockClearStoredAuthToken).toHaveBeenCalled()
      })

      expect(mockClearAgentToken).toHaveBeenCalled()
      expect(mockSetGlobalDemoMode).toHaveBeenCalledWith(false, true)
      expect(mockClearCache).toHaveBeenCalled()
      expect(mockClearPermissionsCache).toHaveBeenCalled()
      expect(mockClearSSECache).toHaveBeenCalled()
      expect(mockClearClusterCacheOnLogout).toHaveBeenCalled()
      expect(mockDisconnectPresence).toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY_DEMO_MODE)).toBe('false')
      expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
      expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBeNull()

      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('null')
        expect(screen.getByTestId('user').textContent).toBe('null')
      })
    })

    it('still clears local state when the best-effort /auth/logout call rejects', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue('real-jwt-token')
      mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      vi.stubGlobal('fetch', fetchMock)

      renderProvider()
      act(() => { screen.getByText('logout').click() })

      await waitFor(() => {
        expect(mockClearStoredAuthToken).toHaveBeenCalled()
      })
      // The POST to /auth/logout is fire-and-forget; its rejection must not
      // prevent local cleanup.
      expect(fetchMock).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }))
    })
  })

  describe('setToken()', () => {
    it('stores the new token and clears the stale cached user instead of caching a placeholder', async () => {
      // Use a real (non-demo) token so the mount-time refreshUser() effect
      // doesn't race setToken() by asynchronously caching a demo user.
      mockGetStoredAuthTokenSync.mockReturnValue('real-jwt-token')
      mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')
      localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ id: 'stale', github_login: 'stale-user', onboarded: true }))

      renderProvider()
      act(() => { screen.getByText('set-token').click() })

      expect(mockSetStoredAuthToken).toHaveBeenCalledWith('new-token')
      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('new-token')
      })
      // cacheUser(null) must run so a failed refreshUser() doesn't leave the
      // stale placeholder user cached under the new token.
      expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    })
  })

  describe('isLoading initial state', () => {
    it('is true when there is no stored token (refreshUser must run first)', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue(null)
      renderProvider()
      expect(screen.getByTestId('is-loading').textContent).toBe('true')
      await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'))
    })

    it('is false immediately when a token and a cached user both exist (stale-while-revalidate)', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue('real-jwt-token')
      mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')
      localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ id: 'u1', github_login: 'cached-user', onboarded: true }))
      renderProvider()
      expect(screen.getByTestId('is-loading').textContent).toBe('false')
      await waitFor(() => expect(mockGetStoredAuthToken).toHaveBeenCalled())
    })

    it('is true when a token exists but there is no cached user yet', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue('real-jwt-token')
      mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')
      renderProvider()
      expect(screen.getByTestId('is-loading').textContent).toBe('true')
      await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'))
    })
  })

  describe('isAuthenticated', () => {
    it('is true for the demo token sentinel regardless of session hints', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue(DEMO_TOKEN_VALUE)
      mockGetStoredAuthToken.mockResolvedValue(DEMO_TOKEN_VALUE)
      renderProvider()
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true')
      await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'))
    })

    it('is false when there is no token and no user', async () => {
      mockGetStoredAuthTokenSync.mockReturnValue(null)
      renderProvider()
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false')
      await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'))
    })
  })
})
