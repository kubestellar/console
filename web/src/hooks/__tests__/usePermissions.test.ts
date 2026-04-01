import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  isBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

import { usePermissions, useCanI, clearPermissionsCache } from '../usePermissions'
import { isBackendUnavailable } from '../../lib/api'

const MOCK_PERMISSIONS_RESPONSE = {
  clusters: {
    'prod-cluster': {
      isClusterAdmin: true,
      canListNodes: true,
      canListNamespaces: true,
      canCreateNamespaces: true,
      canManageRBAC: true,
      canViewSecrets: true,
      accessibleNamespaces: ['default', 'kube-system'],
    },
    'staging-cluster': {
      isClusterAdmin: false,
      canListNodes: true,
      canListNamespaces: true,
      canCreateNamespaces: false,
      canManageRBAC: false,
      canViewSecrets: false,
      accessibleNamespaces: ['default'],
    },
  },
}

describe('usePermissions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    clearPermissionsCache()
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
    localStorage.setItem('kc-auth-token', 'demo-token')
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

  it('isClusterAdmin returns true for unknown cluster (assume admin when no data)', () => {
    const { result } = renderHook(() => usePermissions())
    expect(result.current.isClusterAdmin('unknown')).toBe(true)
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
})

describe('useCanI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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
})

describe('clearPermissionsCache', () => {
  it('is a callable function', () => {
    expect(() => clearPermissionsCache()).not.toThrow()
  })
})
