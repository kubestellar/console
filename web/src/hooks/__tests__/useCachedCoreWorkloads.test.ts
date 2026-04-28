import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  fetchAPI: vi.fn(),
  fetchFromAllClusters: vi.fn(),
  fetchViaSSE: vi.fn(),
  getToken: vi.fn(() => null),
  AGENT_HTTP_TIMEOUT_MS: 30000,
}))

vi.mock('../../lib/api', () => ({
  isBackendUnavailable: vi.fn(() => false),
  authFetch: vi.fn(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: vi.fn(),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 30000,
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async () => []),
}))

vi.mock('../useCachedData/agentFetchers', () => ({
  fetchPodIssuesViaAgent: vi.fn(async () => []),
  fetchDeploymentsViaAgent: vi.fn(async () => []),
  fetchWorkloadsFromAgent: vi.fn(async () => []),
  getAgentClusters: vi.fn(() => []),
}))

vi.mock('../useCachedData/demoData', () => ({
  getDemoPods: () => [],
  getDemoEvents: () => [],
  getDemoPodIssues: () => [],
  getDemoDeploymentIssues: () => [],
  getDemoDeployments: () => [],
  getDemoServices: () => [],
  getDemoSecurityIssues: () => [],
  getDemoWorkloads: () => [],
}))

vi.mock('../../lib/schemas', () => ({
  SecurityIssuesResponseSchema: {},
  PodsResponseSchema: {},
  EventsResponseSchema: {},
  DeploymentsResponseSchema: {},
}))

vi.mock('../../lib/schemas/validate', () => ({
  validateResponse: vi.fn((_, raw: unknown) => raw),
  validateArrayResponse: vi.fn((_, raw: unknown) => raw),
}))

import {
  useCachedPods,
  useCachedAllPods,
  useCachedEvents,
  useCachedPodIssues,
  useCachedDeploymentIssues,
  useCachedDeployments,
  useCachedServices,
  useCachedSecurityIssues,
  useCachedWorkloads,
} from '../useCachedCoreWorkloads'

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
// useCachedPods
// ---------------------------------------------------------------------------

describe('useCachedPods', () => {
  it('exposes pods alias for data', () => {
    const pods = [{ name: 'pod-1', namespace: 'default', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: pods }))
    const { result } = renderHook(() => useCachedPods())
    expect(result.current.pods).toEqual(pods)
  })

  it('includes cluster and namespace in cache key', () => {
    renderHook(() => useCachedPods('prod', 'kube-system'))
    const key: string = mockUseCache.mock.calls[0][0].key
    expect(key).toContain('prod')
    expect(key).toContain('kube-system')
  })

  it('includes all when no cluster/namespace provided', () => {
    renderHook(() => useCachedPods())
    const key: string = mockUseCache.mock.calls[0][0].key
    expect(key).toContain('all')
  })

  it('forwards isLoading from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isLoading: true }))
    const { result } = renderHook(() => useCachedPods())
    expect(result.current.isLoading).toBe(true)
  })

  it('forwards isDemoFallback from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedPods())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('exposes refetch function', () => {
    const { result } = renderHook(() => useCachedPods())
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// useCachedAllPods
// ---------------------------------------------------------------------------

describe('useCachedAllPods', () => {
  it('exposes pods alias for data', () => {
    const pods = [{ name: 'pod-gpu', namespace: 'gpu', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: pods }))
    const { result } = renderHook(() => useCachedAllPods())
    expect(result.current.pods).toEqual(pods)
  })

  it('includes cluster in key when provided', () => {
    renderHook(() => useCachedAllPods('staging'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('staging')
  })

  it('uses all in key when no cluster', () => {
    renderHook(() => useCachedAllPods())
    expect(mockUseCache.mock.calls[0][0].key).toContain('all')
  })
})

// ---------------------------------------------------------------------------
// useCachedEvents
// ---------------------------------------------------------------------------

describe('useCachedEvents', () => {
  it('exposes events alias for data', () => {
    const events = [{ name: 'evt-1', type: 'Warning', message: 'OOM', cluster: 'c1', namespace: 'default', reason: 'OOMKilled', count: 1 }]
    mockUseCache.mockReturnValue(defaultCache({ data: events }))
    const { result } = renderHook(() => useCachedEvents())
    expect(result.current.events).toEqual(events)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedEvents('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })

  it('exposes standard cache fields', () => {
    const { result } = renderHook(() => useCachedEvents())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('refetch')
  })
})

// ---------------------------------------------------------------------------
// useCachedPodIssues
// ---------------------------------------------------------------------------

describe('useCachedPodIssues', () => {
  it('exposes issues alias for data', () => {
    const issues = [{ podName: 'p1', namespace: 'default', cluster: 'c1', reason: 'CrashLoopBackOff', restarts: 5 }]
    mockUseCache.mockReturnValue(defaultCache({ data: issues }))
    const { result } = renderHook(() => useCachedPodIssues())
    expect(result.current.issues).toEqual(issues)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedPodIssues('c1'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('c1')
  })
})

// ---------------------------------------------------------------------------
// useCachedDeploymentIssues
// ---------------------------------------------------------------------------

describe('useCachedDeploymentIssues', () => {
  it('exposes issues alias for data', () => {
    const issues = [{ name: 'deploy-1', namespace: 'default', cluster: 'c1', replicas: 3, readyReplicas: 1 }]
    mockUseCache.mockReturnValue(defaultCache({ data: issues }))
    const { result } = renderHook(() => useCachedDeploymentIssues())
    expect(result.current.issues).toEqual(issues)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedDeploymentIssues('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })
})

// ---------------------------------------------------------------------------
// useCachedDeployments
// ---------------------------------------------------------------------------

describe('useCachedDeployments', () => {
  it('exposes deployments alias for data', () => {
    const deployments = [{ name: 'api', namespace: 'default', cluster: 'c1', replicas: 2, readyReplicas: 2 }]
    mockUseCache.mockReturnValue(defaultCache({ data: deployments }))
    const { result } = renderHook(() => useCachedDeployments())
    expect(result.current.deployments).toEqual(deployments)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedDeployments('staging'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('staging')
  })

  it('exposes isLoading and isDemoFallback', () => {
    const { result } = renderHook(() => useCachedDeployments())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
  })
})

// ---------------------------------------------------------------------------
// useCachedServices
// ---------------------------------------------------------------------------

describe('useCachedServices', () => {
  it('exposes services alias for data', () => {
    const services = [{ name: 'svc-1', namespace: 'default', cluster: 'c1', type: 'ClusterIP', ports: [] }]
    mockUseCache.mockReturnValue(defaultCache({ data: services }))
    const { result } = renderHook(() => useCachedServices())
    expect(result.current.services).toEqual(services)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedServices('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })
})

// ---------------------------------------------------------------------------
// useCachedSecurityIssues
// ---------------------------------------------------------------------------

describe('useCachedSecurityIssues', () => {
  it('exposes issues alias for data', () => {
    const issues = [{ id: 'CVE-1', severity: 'HIGH', resource: 'pod/foo', cluster: 'c1', namespace: 'default' }]
    mockUseCache.mockReturnValue(defaultCache({ data: issues }))
    const { result } = renderHook(() => useCachedSecurityIssues())
    expect(result.current.issues).toEqual(issues)
  })

  it('includes cluster in cache key', () => {
    renderHook(() => useCachedSecurityIssues('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })
})

// ---------------------------------------------------------------------------
// useCachedWorkloads
// ---------------------------------------------------------------------------

describe('useCachedWorkloads', () => {
  it('exposes workloads alias for data', () => {
    const workloads = [{ name: 'worker', namespace: 'default', cluster: 'c1', kind: 'Deployment', replicas: 1, readyReplicas: 1 }]
    mockUseCache.mockReturnValue(defaultCache({ data: workloads }))
    const { result } = renderHook(() => useCachedWorkloads())
    expect(result.current.workloads).toEqual(workloads)
  })

  it('uses fixed cache key regardless of cluster param', () => {
    renderHook(() => useCachedWorkloads('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toBe('workloads:all:all')
  })

  it('exposes refetch function', () => {
    const { result } = renderHook(() => useCachedWorkloads())
    expect(typeof result.current.refetch).toBe('function')
  })
})
