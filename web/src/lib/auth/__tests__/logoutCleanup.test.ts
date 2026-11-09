// Unit tests for the logout helpers in web/src/lib/auth/logoutCleanup.ts.
// AuthContext.test.tsx covers the logout() sequence end to end; these tests
// pin the branches it does not reach: the demo/no-token skip of the
// /auth/logout POST, the request headers, and sessionStorage cleanup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetStoredAuthToken, mockClearStoredAuthToken, mockClearAgentToken, mockSetGlobalDemoMode } = vi.hoisted(() => ({
  mockGetStoredAuthToken: vi.fn(),
  mockClearStoredAuthToken: vi.fn().mockResolvedValue(undefined),
  mockClearAgentToken: vi.fn(),
  mockSetGlobalDemoMode: vi.fn(),
}))

vi.mock('../../authToken', () => ({
  getStoredAuthToken: mockGetStoredAuthToken,
  clearStoredAuthToken: mockClearStoredAuthToken,
}))
vi.mock('../../../hooks/mcp/agentFetch', () => ({ clearAgentToken: mockClearAgentToken }))
vi.mock('../../demoMode', () => ({ setDemoMode: mockSetGlobalDemoMode }))
vi.mock('../../../hooks/usePermissions', () => ({ clearPermissionsCache: vi.fn() }))
vi.mock('../../../hooks/useActiveUsers', () => ({ disconnectPresence: vi.fn() }))
vi.mock('../../sseClient', () => ({ clearSSECache: vi.fn() }))
vi.mock('../../../hooks/mcp/shared', () => ({ clearClusterCacheOnLogout: vi.fn() }))
vi.mock('../../dashboards/dashboardSync', () => ({ dashboardSync: { clearCache: vi.fn() } }))

import { clearLocalAuthStorage, invalidateServerSession } from '../logoutCleanup'
import { AUTH_USER_CACHE_KEY } from '../tokenHelpers'
import { DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE } from '../../constants'

const SESSION_ID_KEY = 'kc-session-id'

describe('invalidateServerSession', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(new Response(null))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs /auth/logout with the bearer token for a real session', async () => {
    mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')

    await invalidateServerSession()

    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer real-jwt-token',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }))
  })

  it.each([
    ['no stored token', null],
    ['the demo token', DEMO_TOKEN_VALUE],
  ])('skips the backend call when there is %s', async (_label, token) => {
    mockGetStoredAuthToken.mockResolvedValue(token)

    await invalidateServerSession()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not reject when the backend is unreachable', async () => {
    mockGetStoredAuthToken.mockResolvedValue('real-jwt-token')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(invalidateServerSession()).resolves.toBeUndefined()
  })
})

describe('clearLocalAuthStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes the session-scoped user cache and rotates the presence session ID', async () => {
    sessionStorage.setItem(AUTH_USER_CACHE_KEY, '{"id":"u1"}')
    sessionStorage.setItem(SESSION_ID_KEY, 'old-session')

    await clearLocalAuthStorage()

    expect(sessionStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
    expect(sessionStorage.getItem(SESSION_ID_KEY)).toBeNull()
    expect(mockClearStoredAuthToken).toHaveBeenCalled()
    expect(mockClearAgentToken).toHaveBeenCalled()
  })

  it('still disables demo mode when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage) {
      if (this === sessionStorage) throw new DOMException('blocked', 'SecurityError')
    })

    await expect(clearLocalAuthStorage()).resolves.toBeUndefined()

    expect(localStorage.getItem(STORAGE_KEY_DEMO_MODE)).toBe('false')
    expect(mockSetGlobalDemoMode).toHaveBeenCalledWith(false, true)
  })
})
