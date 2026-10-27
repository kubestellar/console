// Unit tests for logoutCleanup (web/src/lib/auth/logoutCleanup.ts):
// Covers invalidateServerSession, clearLocalAuthStorage, and clearSessionCaches.
// Addresses issue #24639.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockClearStoredAuthToken,
  mockGetStoredAuthToken,
  mockClearAgentToken,
  mockSetGlobalDemoMode,
  mockCacheUser,
  mockSafeSet,
  mockSafeRemove,
  mockDashboardSyncClearCache,
  mockClearPermissionsCache,
  mockClearSSECache,
  mockClearClusterCacheOnLogout,
  mockDisconnectPresence,
} = vi.hoisted(() => ({
  mockClearStoredAuthToken: vi.fn().mockResolvedValue(undefined),
  mockGetStoredAuthToken: vi.fn().mockResolvedValue(null),
  mockClearAgentToken: vi.fn(),
  mockSetGlobalDemoMode: vi.fn(),
  mockCacheUser: vi.fn(),
  mockSafeSet: vi.fn(),
  mockSafeRemove: vi.fn(),
  mockDashboardSyncClearCache: vi.fn(),
  mockClearPermissionsCache: vi.fn(),
  mockClearSSECache: vi.fn(),
  mockClearClusterCacheOnLogout: vi.fn(),
  mockDisconnectPresence: vi.fn(),
}))

vi.mock('../authToken', () => ({
  clearStoredAuthToken: mockClearStoredAuthToken,
  getStoredAuthToken: mockGetStoredAuthToken,
}))

vi.mock('../demoMode', () => ({
  setDemoMode: mockSetGlobalDemoMode,
}))

vi.mock('../safeLocalStorage', () => ({
  safeSet: mockSafeSet,
  safeRemove: mockSafeRemove,
}))

vi.mock('../tokenHelpers', () => ({
  AUTH_USER_CACHE_KEY: 'kc-auth-user-cache',
  cacheUser: mockCacheUser,
}))

vi.mock('../dashboards/dashboardSync', () => ({
  dashboardSync: {
    clearCache: mockDashboardSyncClearCache,
  },
}))

vi.mock('../../hooks/usePermissions', () => ({
  clearPermissionsCache: mockClearPermissionsCache,
}))

vi.mock('../../hooks/useActiveUsers', () => ({
  disconnectPresence: mockDisconnectPresence,
}))

vi.mock('../sseClient', () => ({
  clearSSECache: mockClearSSECache,
}))

vi.mock('../../hooks/mcp/shared', () => ({
  clearClusterCacheOnLogout: mockClearClusterCacheOnLogout,
}))

vi.mock('../../hooks/mcp/agentFetch', () => ({
  clearAgentToken: mockClearAgentToken,
}))

import {
  clearLocalAuthStorage,
  clearSessionCaches,
  invalidateServerSession,
} from '../logoutCleanup'
import {
  DEMO_TOKEN_VALUE,
  STORAGE_KEY_DEMO_MODE,
  STORAGE_KEY_HAS_SESSION,
} from '../constants'

describe('logoutCleanup', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('invalidateServerSession', () => {
    it('skips the /auth/logout POST when there is no stored token', async () => {
      mockGetStoredAuthToken.mockResolvedValueOnce(null)

      await invalidateServerSession()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('skips the /auth/logout POST when the token is DEMO_TOKEN_VALUE', async () => {
      mockGetStoredAuthToken.mockResolvedValueOnce(DEMO_TOKEN_VALUE)

      await invalidateServerSession()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends POST /auth/logout with Bearer token and X-Requested-With header for valid token', async () => {
      mockGetStoredAuthToken.mockResolvedValueOnce('valid-jwt-token-xyz')
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

      await invalidateServerSession()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe('/auth/logout')
      expect(options.method).toBe('POST')
      expect(options.headers).toEqual({
        Authorization: 'Bearer valid-jwt-token-xyz',
        'X-Requested-With': 'XMLHttpRequest',
      })
      expect(options.signal).toBeDefined()
    })

    it('swallows network errors and does not reject if backend is unreachable', async () => {
      mockGetStoredAuthToken.mockResolvedValueOnce('valid-jwt-token-xyz')
      fetchMock.mockRejectedValueOnce(new Error('Network error / connection refused'))

      await expect(invalidateServerSession()).resolves.toBeUndefined()
    })
  })

  describe('clearLocalAuthStorage', () => {
    it('clears stored tokens, resets demo mode flags, and clears session storage', async () => {
      sessionStorage.setItem('kc-auth-user-cache', 'cached-data')
      sessionStorage.setItem('kc-session-id', 'session-123')

      await clearLocalAuthStorage()

      expect(mockClearStoredAuthToken).toHaveBeenCalledTimes(1)
      expect(mockClearAgentToken).toHaveBeenCalledTimes(1)
      expect(mockSafeSet).toHaveBeenCalledWith(STORAGE_KEY_DEMO_MODE, 'false')
      expect(mockSetGlobalDemoMode).toHaveBeenCalledWith(false, true)
      expect(mockSafeRemove).toHaveBeenCalledWith('kc-auth-user-cache')
      expect(mockSafeRemove).toHaveBeenCalledWith(STORAGE_KEY_HAS_SESSION)
      expect(sessionStorage.getItem('kc-auth-user-cache')).toBeNull()
      expect(sessionStorage.getItem('kc-session-id')).toBeNull()
      expect(mockCacheUser).toHaveBeenCalledWith(null)
    })

    it('still disables demo mode and clears user even when sessionStorage throws', async () => {
      const originalRemoveItem = sessionStorage.removeItem
      sessionStorage.removeItem = vi.fn().mockImplementation(() => {
        throw new DOMException('SecurityError: Access denied', 'SecurityError')
      })

      try {
        await expect(clearLocalAuthStorage()).resolves.toBeUndefined()

        expect(mockClearStoredAuthToken).toHaveBeenCalledTimes(1)
        expect(mockSafeSet).toHaveBeenCalledWith(STORAGE_KEY_DEMO_MODE, 'false')
        expect(mockSetGlobalDemoMode).toHaveBeenCalledWith(false, true)
        expect(mockCacheUser).toHaveBeenCalledWith(null)
      } finally {
        sessionStorage.removeItem = originalRemoveItem
      }
    })
  })

  describe('clearSessionCaches', () => {
    it('invokes all subsystem cache and presence disconnect helpers', () => {
      clearSessionCaches()

      expect(mockDashboardSyncClearCache).toHaveBeenCalledTimes(1)
      expect(mockClearPermissionsCache).toHaveBeenCalledTimes(1)
      expect(mockClearSSECache).toHaveBeenCalledTimes(1)
      expect(mockClearClusterCacheOnLogout).toHaveBeenCalledTimes(1)
      expect(mockDisconnectPresence).toHaveBeenCalledTimes(1)
    })
  })
})
