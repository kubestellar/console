/**
 * Unit tests for web/src/lib/auth.tsx — OAuth session management
 * 
 * Coverage: token refresh, session validation, OAuth callback, login/logout state transitions
 * Addresses: #20697 — zero test coverage creates OAuth session leak risk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth, isJWTExpired } from './auth'
import { ReactNode } from 'react'
import { MS_PER_SECOND } from './constants/time'
import { DEMO_TOKEN_VALUE, STORAGE_KEY_HAS_SESSION, STORAGE_KEY_USER_CACHE } from './constants'

// Mock dependencies to prevent side effects
vi.mock('./api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: true, oauthConfigured: true }),
  checkOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: true, oauthConfigured: true }),
}))

vi.mock('./dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: vi.fn() },
}))

vi.mock('../hooks/usePermissions', () => ({
  clearPermissionsCache: vi.fn(),
}))

vi.mock('../hooks/useActiveUsers', () => ({
  disconnectPresence: vi.fn(),
}))

vi.mock('./sseClient', () => ({
  clearSSECache: vi.fn(),
}))

vi.mock('../hooks/mcp/shared', () => ({
  clearClusterCacheOnLogout: vi.fn(),
}))

vi.mock('../hooks/mcp/agentFetch', () => ({
  clearAgentToken: vi.fn(),
  setAgentToken: vi.fn(),
}))

vi.mock('./analytics', () => ({
  emitLogin: vi.fn(),
  emitLogout: vi.fn(),
  setAnalyticsUserId: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitConversionStep: vi.fn(),
  emitDeveloperSession: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}))

vi.mock('./demoMode', () => ({
  setDemoMode: vi.fn(),
}))

const VALID_JWT_PAYLOAD = { exp: Math.floor(Date.now() / MS_PER_SECOND) + 3600 } // expires in 1 hour
const EXPIRED_JWT_PAYLOAD = { exp: Math.floor(Date.now() / MS_PER_SECOND) - 60 } // expired 60s ago

function encodeJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.fake-signature`
}

describe('auth.tsx — OAuth session management', () => {
  let localStorageMock: Map<string, string>
  let sessionStorageMock: Map<string, string>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock localStorage
    localStorageMock = new Map()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock.get(key) || null,
        setItem: (key: string, value: string) => localStorageMock.set(key, value),
        removeItem: (key: string) => localStorageMock.delete(key),
        clear: () => localStorageMock.clear(),
      },
      writable: true,
    })

    // Mock sessionStorage
    sessionStorageMock = new Map()
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: (key: string) => sessionStorageMock.get(key) || null,
        setItem: (key: string, value: string) => sessionStorageMock.set(key, value),
        removeItem: (key: string) => sessionStorageMock.delete(key),
        clear: () => sessionStorageMock.clear(),
      },
      writable: true,
    })

    // Mock global fetch
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isJWTExpired()', () => {
    it('returns false for valid JWT with future expiry', () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      expect(isJWTExpired(validToken)).toBe(false)
    })

    it('returns true for JWT with past expiry', () => {
      const expiredToken = encodeJWT(EXPIRED_JWT_PAYLOAD)
      expect(isJWTExpired(expiredToken)).toBe(true)
    })

    it('returns false for malformed JWT (not base64)', () => {
      const malformed = 'not.a.jwt'
      expect(isJWTExpired(malformed)).toBe(false)
    })

    it('returns false for JWT missing exp field', () => {
      const noExp = encodeJWT({ sub: 'user-123' })
      expect(isJWTExpired(noExp)).toBe(false)
    })

    it('returns false for opaque non-JWT token', () => {
      expect(isJWTExpired(DEMO_TOKEN_VALUE)).toBe(false)
      expect(isJWTExpired('opaque-bearer-token')).toBe(false)
    })
  })

  describe('Token refresh logic', () => {
    it('attempts /auth/refresh when kc-has-session is present but no token exists', async () => {
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refreshed: true, onboarded: true }),
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'user-123',
          github_id: '456',
          github_login: 'testuser',
          onboarded: true,
        }),
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      )
    })

    it('skips /auth/refresh when kc-has-session is missing (fresh visitor)', async () => {
      localStorageMock.delete(STORAGE_KEY_HAS_SESSION)
      
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.anything()
      ))
    })

    it('clears kc-has-session on 401 from /auth/refresh', async () => {
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(localStorageMock.has(STORAGE_KEY_HAS_SESSION)).toBe(false))
    })

    it('clears kc-has-session on 403 from /auth/refresh', async () => {
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(localStorageMock.has(STORAGE_KEY_HAS_SESSION)).toBe(false))
    })

    it('keeps kc-has-session on network timeout during refresh', async () => {
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'))

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        // Should still have session hint — network may be temporarily down
        expect(localStorageMock.get(STORAGE_KEY_HAS_SESSION)).toBe('true')
      })
    })
  })

  describe('Session validation', () => {
    it('immediately clears expired JWT without calling /api/me', async () => {
      const expiredToken = encodeJWT(EXPIRED_JWT_PAYLOAD)
      localStorageMock.set('kc_token', expiredToken)
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      
      // Mock refresh flow for expired token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refreshed: true, onboarded: true }),
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'user-123',
          github_id: '456',
          github_login: 'testuser',
          onboarded: true,
        }),
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        // Token should be cleared, should NOT have called /api/me with expired token
        const apiMeCalls = fetchMock.mock.calls.filter(call => call[0] === '/api/me')
        const hadExpiredAuth = apiMeCalls.some(call => 
          call[1]?.headers?.Authorization?.includes(expiredToken)
        )
        expect(hadExpiredAuth).toBe(false)
      })
    })

    it('uses cached user when backend returns 429 (rate limited)', async () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      const cachedUser = {
        id: 'user-789',
        github_id: '101112',
        github_login: 'cached-user',
        onboarded: true,
      }
      
      localStorageMock.set('kc_token', validToken)
      localStorageMock.set(STORAGE_KEY_USER_CACHE, JSON.stringify(cachedUser))
      
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user?.id).toBe('user-789')
        expect(result.current.user?.github_login).toBe('cached-user')
      })
    })

    it('drops to login when cached user is stale (> 5 min)', async () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      const cachedUser = {
        id: 'user-old',
        github_id: '999',
        github_login: 'stale-user',
        onboarded: true,
      }
      
      const CACHE_STALE_MS = 6 * 60 * 1_000 // 6 minutes ago
      const staleTimestamp = Date.now() - CACHE_STALE_MS
      
      localStorageMock.set('kc_token', validToken)
      localStorageMock.set(STORAGE_KEY_USER_CACHE, JSON.stringify(cachedUser))
      localStorageMock.set('kc-user-cache-validated', String(staleTimestamp))
      
      fetchMock.mockRejectedValueOnce(new Error('Backend down'))

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        // Stale cache should be ignored — user dropped to null
        expect(result.current.user).toBeNull()
        expect(localStorageMock.has('kc-token')).toBe(false)
      })
    })

    it('keeps cached user when fresh (< 5 min) and backend is down', async () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      const cachedUser = {
        id: 'user-fresh',
        github_id: '777',
        github_login: 'fresh-user',
        onboarded: true,
      }
      
      const freshTimestamp = Date.now() - 60_000 // 1 minute ago
      
      localStorageMock.set('kc_token', validToken)
      localStorageMock.set(STORAGE_KEY_USER_CACHE, JSON.stringify(cachedUser))
      localStorageMock.set('kc-user-cache-validated', String(freshTimestamp))
      
      fetchMock.mockRejectedValueOnce(new Error('Backend down'))

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user?.id).toBe('user-fresh')
        expect(result.current.user?.github_login).toBe('fresh-user')
      })
    })
  })

  describe('Login/logout state transitions', () => {
    it('logout() clears all auth state', async () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      const user = {
        id: 'user-logout',
        github_id: '555',
        github_login: 'logout-test',
        onboarded: true,
      }
      
      localStorageMock.set('kc_token', validToken)
      localStorageMock.set(STORAGE_KEY_USER_CACHE, JSON.stringify(user))
      localStorageMock.set(STORAGE_KEY_HAS_SESSION, 'true')
      sessionStorageMock.set('kc-session-id', 'session-abc')
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => user,
      })
      fetchMock.mockResolvedValueOnce({ ok: true }) // /auth/logout

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.logout()

      await waitFor(() => {
        expect(result.current.user).toBeNull()
        expect(result.current.token).toBeNull()
        expect(result.current.isAuthenticated).toBe(false)
        expect(localStorageMock.has('kc-token')).toBe(false)
        expect(localStorageMock.has(STORAGE_KEY_USER_CACHE)).toBe(false)
        expect(sessionStorageMock.has('kc-session-id')).toBe(false)
      })
    })

    it('logout() sends POST to /auth/logout with bearer token', async () => {
      const validToken = encodeJWT(VALID_JWT_PAYLOAD)
      
      localStorageMock.set('kc_token', validToken)
      
      fetchMock.mockResolvedValueOnce({ ok: true })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.logout()

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/auth/logout',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: `Bearer ${validToken}`,
            }),
          })
        )
      })
    })

    it('logout() does not send /auth/logout for demo token', async () => {
      localStorageMock.set('kc_token', DEMO_TOKEN_VALUE)
      
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.logout()

      await waitFor(() => {
        const logoutCalls = fetchMock.mock.calls.filter(call => call[0] === '/auth/logout')
        expect(logoutCalls.length).toBe(0)
      })
    })

    it('logout() clears demo mode when STORAGE_KEY_DEMO_MODE is set', async () => {
      localStorageMock.set('kc_token', DEMO_TOKEN_VALUE)
      localStorageMock.set('kc-demo-mode', 'true')
      
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.logout()

      await waitFor(() => {
        expect(localStorageMock.get('kc-demo-mode')).toBe('false')
      })
    })
  })

  describe('OAuth callback handling (implicit via setToken)', () => {
    it('setToken() stores token and clears stale cached user', async () => {
      const oldUser = {
        id: 'old-user',
        github_id: '111',
        github_login: 'old',
        onboarded: true,
      }
      localStorageMock.set(STORAGE_KEY_USER_CACHE, JSON.stringify(oldUser))
      
      const newToken = encodeJWT(VALID_JWT_PAYLOAD)
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'new-user',
          github_id: '222',
          github_login: 'new',
          onboarded: true,
        }),
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.setToken(newToken, true)

      await waitFor(() => {
        expect(result.current.token).toBe(newToken)
        // Old cached user should be cleared
        expect(localStorageMock.has(STORAGE_KEY_USER_CACHE)).toBe(false)
      })
    })

    it('setToken() triggers refreshUser() to fetch new user data', async () => {
      const newToken = encodeJWT(VALID_JWT_PAYLOAD)
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'oauth-callback-user',
          github_id: '333',
          github_login: 'callback-user',
          onboarded: false,
        }),
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      result.current.setToken(newToken, false)

      // refreshUser should eventually call /api/me
      await waitFor(() => {
        const apiMeCalls = fetchMock.mock.calls.filter(call => call[0] === '/api/me')
        expect(apiMeCalls.length).toBeGreaterThan(0)
      })
    })
  })
})
