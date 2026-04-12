import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  isBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

import { usePermissions, useCanI, clearPermissionsCache } from '../usePermissions'
import type { PermissionsSummary } from '../usePermissions'
import { isBackendUnavailable } from '../../lib/api'

/** Storage key matching the mocked constant */
const MOCKED_TOKEN_KEY = 'kc-auth-token'

/** A full admin cluster permissions fixture */
const ADMIN_CLUSTER_PERMS = {
  isClusterAdmin: true,
  canListNodes: true,
  canListNamespaces: true,
  canCreateNamespaces: true,
  canManageRBAC: true,
  canViewSecrets: true,
  accessibleNamespaces: ['default', 'kube-system', 'monitoring'],
}

/** A restricted (non-admin) cluster permissions fixture */
const RESTRICTED_CLUSTER_PERMS = {
  isClusterAdmin: false,
  canListNodes: false,
  canListNamespaces: true,
  canCreateNamespaces: false,
  canManageRBAC: false,
  canViewSecrets: false,
  accessibleNamespaces: ['app-ns', 'staging'],
}

/** Standard multi-cluster permissions summary used across tests */
const MULTI_CLUSTER_SUMMARY: PermissionsSummary = {
  clusters: {
    'prod-cluster': ADMIN_CLUSTER_PERMS,
    'dev-cluster': RESTRICTED_CLUSTER_PERMS,
  },
}

/** Single admin-only cluster summary */
const ADMIN_ONLY_SUMMARY: PermissionsSummary = {
  clusters: {
    'admin-cluster': ADMIN_CLUSTER_PERMS,
  },
}

/** Helper to create a mock fetch Response that returns JSON */
function mockFetchOk(data: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

/** Helper to create a mock fetch Response with a non-OK status */
function mockFetchError(status: number): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  })
}

/** Helper to set a valid real token in localStorage */
function setRealToken() {
  localStorage.setItem(MOCKED_TOKEN_KEY, 'real-jwt-token-abc123')
}

describe('usePermissions', () => {
  beforeEach(() => {
    localStorage.clear()
    clearPermissionsCache()
    // Re-establish the default return value after any prior restoreAllMocks
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips fetch when backend is unavailable', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips fetch when using demo token', async () => {
    localStorage.setItem(MOCKED_TOKEN_KEY, 'demo-token')
    vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips fetch when no token', async () => {
    vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('isClusterAdmin returns false for unknown cluster (fail-closed)', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.isClusterAdmin('unknown')).toBe(false)
  })

  it('hasPermission returns false for unknown cluster', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.hasPermission('unknown', 'canViewSecrets')).toBe(false)
  })

  it('canAccessNamespace returns false for unknown cluster', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.canAccessNamespace('unknown', 'default')).toBe(false)
  })

  it('getAccessibleNamespaces returns empty for unknown cluster', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.getAccessibleNamespaces('unknown')).toEqual([])
  })

  it('getClusterPermissions returns null for unknown cluster', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.getClusterPermissions('unknown')).toBeNull()
  })

  it('clusters is empty when no permissions data', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.clusters).toEqual([])
  })

  it('hasLimitedAccess is false when no data', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.hasLimitedAccess).toBe(false)
  })

  it('refresh function triggers a refetch', async () => {
    vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => usePermissions())
    await act(async () => { result.current.refresh() })
    // With no token, refresh still completes without error
    expect(result.current.error).toBeNull()
  })

  // --- New regression tests below ---

  it('fetches and populates permissions from API with a real token', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.permissions).toEqual(MULTI_CLUSTER_SUMMARY)
    expect(result.current.error).toBeNull()
  })

  it('sends Authorization header with Bearer token', async () => {
    setRealToken()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(ADMIN_ONLY_SUMMARY))

    renderHook(() => usePermissions())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/permissions/summary')
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer real-jwt-token-abc123')
  })

  it('isClusterAdmin returns true for admin cluster and false for restricted', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    expect(result.current.isClusterAdmin('prod-cluster')).toBe(true)
    expect(result.current.isClusterAdmin('dev-cluster')).toBe(false)
    // Unknown cluster returns false (fail-closed security)
    expect(result.current.isClusterAdmin('nonexistent')).toBe(false)
  })

  it('hasPermission returns correct values for each permission type', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    // Admin cluster - all permissions true
    expect(result.current.hasPermission('prod-cluster', 'canListNodes')).toBe(true)
    expect(result.current.hasPermission('prod-cluster', 'canManageRBAC')).toBe(true)
    expect(result.current.hasPermission('prod-cluster', 'canViewSecrets')).toBe(true)
    expect(result.current.hasPermission('prod-cluster', 'canCreateNamespaces')).toBe(true)

    // Restricted cluster - only canListNamespaces is true
    expect(result.current.hasPermission('dev-cluster', 'canListNodes')).toBe(false)
    expect(result.current.hasPermission('dev-cluster', 'canListNamespaces')).toBe(true)
    expect(result.current.hasPermission('dev-cluster', 'canManageRBAC')).toBe(false)
    expect(result.current.hasPermission('dev-cluster', 'canViewSecrets')).toBe(false)
    expect(result.current.hasPermission('dev-cluster', 'canCreateNamespaces')).toBe(false)
  })

  it('canAccessNamespace grants admin access to any namespace', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    // Admin cluster can access any namespace, even ones not in the list
    expect(result.current.canAccessNamespace('prod-cluster', 'default')).toBe(true)
    expect(result.current.canAccessNamespace('prod-cluster', 'arbitrary-ns')).toBe(true)

    // Restricted cluster can only access listed namespaces
    expect(result.current.canAccessNamespace('dev-cluster', 'app-ns')).toBe(true)
    expect(result.current.canAccessNamespace('dev-cluster', 'staging')).toBe(true)
    expect(result.current.canAccessNamespace('dev-cluster', 'kube-system')).toBe(false)
    expect(result.current.canAccessNamespace('dev-cluster', 'production')).toBe(false)
  })

  it('getAccessibleNamespaces returns the correct list per cluster', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    expect(result.current.getAccessibleNamespaces('prod-cluster')).toEqual(
      ['default', 'kube-system', 'monitoring']
    )
    expect(result.current.getAccessibleNamespaces('dev-cluster')).toEqual(
      ['app-ns', 'staging']
    )
    expect(result.current.getAccessibleNamespaces('nonexistent')).toEqual([])
  })

  it('getClusterPermissions returns full permission object for known clusters', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    const prodPerms = result.current.getClusterPermissions('prod-cluster')
    expect(prodPerms).toEqual(ADMIN_CLUSTER_PERMS)

    const devPerms = result.current.getClusterPermissions('dev-cluster')
    expect(devPerms).toEqual(RESTRICTED_CLUSTER_PERMS)

    expect(result.current.getClusterPermissions('nonexistent')).toBeNull()
  })

  it('clusters lists all cluster names from permissions data', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    expect(result.current.clusters).toEqual(
      expect.arrayContaining(['prod-cluster', 'dev-cluster'])
    )
    expect(result.current.clusters).toHaveLength(2)
  })

  it('hasLimitedAccess is true when any cluster has non-admin user', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    // dev-cluster is non-admin, so hasLimitedAccess should be true
    expect(result.current.hasLimitedAccess).toBe(true)
  })

  it('hasLimitedAccess is false when all clusters are admin', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(ADMIN_ONLY_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())

    expect(result.current.hasLimitedAccess).toBe(false)
  })

  it('silently handles non-OK API response without setting error', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchError(500))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Should not populate permissions or set error on 500
    expect(result.current.permissions).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('silently handles network error without crashing', async () => {
    setRealToken()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Should not crash; permissions remain null, no error exposed
    expect(result.current.permissions).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('uses cached data on subsequent renders within TTL', async () => {
    setRealToken()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(ADMIN_ONLY_SUMMARY))

    // First render - fetches from API
    const { result, unmount } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    unmount()

    // Second render - should use cache, no additional fetch
    fetchSpy.mockClear()
    const { result: result2 } = renderHook(() => usePermissions())
    await waitFor(() => expect(result2.current.loading).toBe(false))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result2.current.permissions).toEqual(ADMIN_ONLY_SUMMARY)
  })

  it('refresh bypasses cache and re-fetches from API', async () => {
    setRealToken()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(ADMIN_ONLY_SUMMARY))

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Now refresh - should force a new fetch even though cache is valid
    fetchSpy.mockClear()
    fetchSpy.mockImplementation(mockFetchOk(MULTI_CLUSTER_SUMMARY))

    await act(async () => { result.current.refresh() })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    expect(result.current.permissions).toEqual(MULTI_CLUSTER_SUMMARY)
  })
})

describe('useCanI', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns allowed=true when backend is unavailable', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    const { result } = renderHook(() => useCanI())
    let response = { allowed: false }
    await act(async () => {
      response = await result.current.checkPermission({
        cluster: 'test',
        verb: 'get',
        resource: 'pods',
      })
    })
    expect(response.allowed).toBe(true)
  })

  it('reset clears result and error', () => {
    const { result } = renderHook(() => useCanI())
    act(() => { result.current.reset() })
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('starts with checking=false', () => {
    const { result } = renderHook(() => useCanI())
    expect(result.current.checking).toBe(false)
  })

  it('sends POST to /api/rbac/can-i with correct body and returns result', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
    localStorage.setItem(MOCKED_TOKEN_KEY, 'real-token')

    const canIResponse = { allowed: true, reason: 'RBAC: allowed by ClusterRoleBinding' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(canIResponse))

    const { result } = renderHook(() => useCanI())
    let response = { allowed: false, reason: '' }
    await act(async () => {
      response = await result.current.checkPermission({
        cluster: 'prod',
        verb: 'create',
        resource: 'deployments',
        namespace: 'default',
        group: 'apps',
      })
    })

    expect(response.allowed).toBe(true)
    expect(response.reason).toBe('RBAC: allowed by ClusterRoleBinding')
    expect(result.current.result).toEqual(canIResponse)
    expect(result.current.checking).toBe(false)

    // Verify the request was sent correctly
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/rbac/can-i')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body as string)
    expect(body.cluster).toBe('prod')
    expect(body.verb).toBe('create')
    expect(body.resource).toBe('deployments')
    expect(body.namespace).toBe('default')
    expect(body.group).toBe('apps')
  })

  it('returns allowed=false on non-OK response (fail-closed security)', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
    localStorage.setItem(MOCKED_TOKEN_KEY, 'real-token')
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchError(403))

    const { result } = renderHook(() => useCanI())
    let response = { allowed: true }
    await act(async () => {
      response = await result.current.checkPermission({
        cluster: 'test',
        verb: 'delete',
        resource: 'pods',
      })
    })

    // SECURITY: Non-OK responses fail-closed (deny permission)
    expect(response.allowed).toBe(false)
    expect(result.current.checking).toBe(false)
  })

  it('returns allowed=false on network error (fail-closed security)', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
    localStorage.setItem(MOCKED_TOKEN_KEY, 'real-token')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'))

    const { result } = renderHook(() => useCanI())
    let response = { allowed: true }
    await act(async () => {
      response = await result.current.checkPermission({
        cluster: 'test',
        verb: 'get',
        resource: 'secrets',
      })
    })

    // SECURITY: Network errors fail-closed (deny permission)
    expect(response.allowed).toBe(false)
    expect(result.current.checking).toBe(false)
  })

  it('returns denied permission from API correctly', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
    localStorage.setItem(MOCKED_TOKEN_KEY, 'real-token')

    const deniedResponse = { allowed: false, reason: 'RBAC: access denied' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(deniedResponse))

    const { result } = renderHook(() => useCanI())
    let response = { allowed: true, reason: '' }
    await act(async () => {
      response = await result.current.checkPermission({
        cluster: 'prod',
        verb: 'delete',
        resource: 'namespaces',
      })
    })

    expect(response.allowed).toBe(false)
    expect(response.reason).toBe('RBAC: access denied')
    expect(result.current.result).toEqual(deniedResponse)
  })
})

describe('clearPermissionsCache', () => {
  beforeEach(() => {
    localStorage.clear()
    clearPermissionsCache()
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a callable function', () => {
    expect(() => clearPermissionsCache()).not.toThrow()
  })

  it('forces a fresh fetch after cache is cleared', async () => {
    setRealToken()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(ADMIN_ONLY_SUMMARY))

    // First render populates cache
    const { result, unmount } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.permissions).not.toBeNull())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    unmount()

    // Clear the cache
    clearPermissionsCache()
    fetchSpy.mockClear()

    // Second render should fetch again since cache was cleared
    const { result: result2 } = renderHook(() => usePermissions())
    await waitFor(() => expect(result2.current.loading).toBe(false))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
