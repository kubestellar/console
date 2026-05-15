import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockClusterCacheRef, mockAuthFetch } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean; namespaces?: string[] }> },
  mockAuthFetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
    createCachedHook: vi.fn(),
  fetchAPI: vi.fn(),
  fetchFromAllClusters: vi.fn(),
  fetchViaSSE: vi.fn(),
  getToken: vi.fn(() => null),
}))

vi.mock('../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => ({
  ...(await importOriginal() as Record<string, unknown>),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  MCP_HOOK_TIMEOUT_MS: 5000,
}))

vi.mock('../useCachedData/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoPVCs: () => [],
  getDemoNamespaces: () => [],
  getDemoJobs: () => [],
  getDemoHPAs: () => [],
  getDemoConfigMaps: () => [],
  getDemoSecrets: () => [],
  getDemoServiceAccounts: () => [],
  getDemoReplicaSets: () => [],
  getDemoStatefulSets: () => [],
  getDemoDaemonSets: () => [],
  getDemoCronJobs: () => [],
  getDemoIngresses: () => [],
  getDemoNetworkPolicies: () => [],
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
}))

import {
  useCachedPVCs,
  useCachedNamespaces,
  useCachedJobs,
  useCachedHPAs,
  useCachedConfigMaps,
  useCachedSecrets,
  useCachedServiceAccounts,
  useCachedReplicaSets,
  useCachedStatefulSets,
  useCachedDaemonSets,
  useCachedCronJobs,
  useCachedIngresses,
  useCachedNetworkPolicies,
} from '../useCachedK8sResources'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCache(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClusterCacheRef.clusters = []
  mockUseCache.mockReturnValue(defaultCache())
})

// ---------------------------------------------------------------------------
// Each hook: test the alias field + cache key
// ---------------------------------------------------------------------------

describe('useCachedPVCs', () => {
  it('exposes pvcs field', () => {
    const { result } = renderHook(() => useCachedPVCs())
    expect(result.current).toHaveProperty('pvcs')
    expect(Array.isArray(result.current.pvcs)).toBe(true)
  })
  it('includes cluster in key', () => {
    renderHook(() => useCachedPVCs('c1'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('c1')
  })
})

describe('useCachedNamespaces', () => {
  it('exposes namespaces field', () => {
    const { result } = renderHook(() => useCachedNamespaces())
    expect(result.current).toHaveProperty('namespaces')
  })

  it('marks offline clusters as failed without leaving loading state active', () => {
    mockClusterCacheRef.clusters = [{ name: 'offline-cluster', reachable: false }]

    const { result } = renderHook(() => useCachedNamespaces('offline-cluster'))

    expect(result.current.namespaces).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(true)
    expect(result.current.error).toBe('Cluster is offline')
  })

  it('uses the cached cluster context when fetching namespaces', async () => {
    mockClusterCacheRef.clusters = [{ name: 'friendly-cluster', context: 'real-context' }]
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'team-a' }],
    })

    renderHook(() => useCachedNamespaces('friendly-cluster'))
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<string[]> }

    await expect(config.fetcher()).resolves.toEqual(['team-a'])
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/namespaces?cluster=real-context',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })
})

describe('useCachedJobs', () => {
  it('exposes jobs field', () => {
    const { result } = renderHook(() => useCachedJobs())
    expect(result.current).toHaveProperty('jobs')
  })
  it('includes cluster in key', () => {
    renderHook(() => useCachedJobs('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })
})

describe('useCachedHPAs', () => {
  it('exposes hpas field', () => {
    const { result } = renderHook(() => useCachedHPAs())
    expect(result.current).toHaveProperty('hpas')
  })
})

describe('useCachedConfigMaps', () => {
  it('exposes configmaps field', () => {
    const { result } = renderHook(() => useCachedConfigMaps())
    expect(result.current).toHaveProperty('configmaps')
  })
})

describe('useCachedSecrets', () => {
  it('exposes secrets field', () => {
    const { result } = renderHook(() => useCachedSecrets())
    expect(result.current).toHaveProperty('secrets')
  })
})

describe('useCachedServiceAccounts', () => {
  it('exposes serviceAccounts field', () => {
    const { result } = renderHook(() => useCachedServiceAccounts())
    expect(result.current).toHaveProperty('serviceAccounts')
  })
})

describe('useCachedReplicaSets', () => {
  it('exposes replicasets field', () => {
    const { result } = renderHook(() => useCachedReplicaSets())
    expect(result.current).toHaveProperty('replicasets')
  })
})

describe('useCachedStatefulSets', () => {
  it('exposes statefulsets field', () => {
    const { result } = renderHook(() => useCachedStatefulSets())
    expect(result.current).toHaveProperty('statefulsets')
  })
})

describe('useCachedDaemonSets', () => {
  it('exposes daemonsets field', () => {
    const { result } = renderHook(() => useCachedDaemonSets())
    expect(result.current).toHaveProperty('daemonsets')
  })
})

describe('useCachedCronJobs', () => {
  it('exposes cronjobs field', () => {
    const { result } = renderHook(() => useCachedCronJobs())
    expect(result.current).toHaveProperty('cronjobs')
  })
})

describe('useCachedIngresses', () => {
  it('exposes ingresses field', () => {
    const { result } = renderHook(() => useCachedIngresses())
    expect(result.current).toHaveProperty('ingresses')
  })
})

describe('useCachedNetworkPolicies', () => {
  it('exposes networkpolicies field', () => {
    const { result } = renderHook(() => useCachedNetworkPolicies())
    expect(result.current).toHaveProperty('networkpolicies')
  })
  it('includes cluster in key', () => {
    renderHook(() => useCachedNetworkPolicies('staging'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('staging')
  })
})
