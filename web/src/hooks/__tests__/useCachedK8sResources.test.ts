import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
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

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
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
