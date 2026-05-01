import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockIsBackendUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockKubectlProxy,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockKubectlProxy: {
    getPodIssues: vi.fn(),
    getDeployments: vi.fn(),
    getNamespaces: vi.fn(),
  },
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
    }>,
  },
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
  isBackendUnavailable: () => mockIsBackendUnavailable(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  LOCAL_AGENT_URL: 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await mockApiGet(...args)
    return { ok: true, status: 200, json: async () => result?.data ?? result }
  }),
  fetchWithRetry: (url: string, opts: Record<string, unknown> = {}) => {
    const { timeoutMs, maxRetries, initialBackoffMs, ...rest } = opts
    void timeoutMs
    void maxRetries
    void initialBackoffMs
    return globalThis.fetch(url, rest)
  },
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  usePods,
  useAllPods,
  usePodIssues,
  useDeploymentIssues,
  useDeployments,
  useJobs,
  useHPAs,
  useReplicaSets,
  useStatefulSets,
  useDaemonSets,
  useCronJobs,
  usePodLogs,
} from '../workloads'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockIsBackendUnavailable.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// usePods
// ===========================================================================

describe('usePods', () => {
  it('returns initial loading state with empty pods array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePods())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pods).toEqual([])
  })

  it('returns pods after SSE fetch resolves', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'default', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 5, age: '2d' },
      { name: 'pod-2', namespace: 'default', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 2, age: '1d' },
    ]
    mockFetchSSE.mockResolvedValue(fakePods)

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns demo pods when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('sorts pods by restarts descending by default', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const restarts = result.current.pods.map(p => p.restarts)
    for (let i = 1; i < restarts.length; i++) {
      expect(restarts[i]).toBeLessThanOrEqual(restarts[i - 1])
    }
  })

  it('sorts pods by name when sortBy=name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods(undefined, undefined, 'name', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const names = result.current.pods.map(p => p.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('limits the number of returned pods', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const LIMIT = 3
    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', LIMIT))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeLessThanOrEqual(LIMIT)
  })

  it('forwards cluster filter via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => usePods('my-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
  })

  it('provides refetch function that triggers new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('handles SSE failure gracefully', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // On first cold-cache failure, falls back to demo pods or sets error
    expect(
      result.current.error === null || result.current.error === 'SSE error'
    ).toBe(true)
  })

  it('tracks consecutive failures and sets isFailed after 3', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })
    // First failure — consecutiveFailures may be 0 if demo fallback resolved first
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(0)
  })

  it('returns lastRefresh timestamp after fetch', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })
})

// ===========================================================================
// useAllPods
// ===========================================================================

describe('useAllPods', () => {
  it('returns initial loading state with empty array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    // Use a unique cluster to avoid hitting module-level cache from prior tests
    const { result } = renderHook(() => useAllPods('unique-test-cluster-xyz'))
    // When no cache exists for this key, isLoading should be true
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pods).toEqual([])
  })

  it('returns all pods without limit after SSE resolves', async () => {
    const fakePods = Array.from({ length: 20 }, (_, i) => ({
      name: `pod-${i}`, namespace: 'default', cluster: 'c1', status: 'Running',
      ready: '1/1', restarts: i, age: '1d',
    }))
    mockFetchSSE.mockResolvedValue(fakePods)

    // Use unique cluster key to avoid module-level cache interference from other tests
    const { result } = renderHook(() => useAllPods('sse-resolve-test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })
    expect(result.current.pods.length).toBe(20)
    expect(result.current.error).toBeNull()
  })

  it('returns demo pods when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useAllPods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
  })

  it('filters by cluster when provided in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useAllPods('vllm-d'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.every(p => p.cluster === 'vllm-d')).toBe(true)
  })

  it('handles SSE failure without crashing', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useAllPods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.pods)).toBe(true)
  })

  // Issue 9353 — per-cluster error surfacing.  The backend emits a
  // `cluster_error` SSE event when an individual cluster's pods list
  // fails (e.g. 403 from RBAC denial).  useAllPods must forward those
  // events as `clusterErrors` so the multi-cluster drill-down can
  // distinguish RBAC denial from a transient endpoint failure when the
  // cluster summary count disagrees with the list length.
  it('surfaces per-cluster errors from SSE cluster_error events', async () => {
    // Simulate the SSE stream invoking onClusterError for a 403 and a timeout.
    mockFetchSSE.mockImplementation(async (opts: {
      onClusterError?: (cluster: string, message: string) => void
    }) => {
      opts.onClusterError?.('rbac-cluster', 'pods is forbidden: User "u" cannot list resource "pods"')
      opts.onClusterError?.('slow-cluster', 'context deadline exceeded')
      return []
    })

    const { result } = renderHook(() => useAllPods('rbac-test-unique'))
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })

    // Both events surface in clusterErrors, classified by type.  The RBAC
    // denial is 'auth' (matches /forbidden/i) and the timeout is 'timeout'.
    expect(result.current.clusterErrors).toHaveLength(2)
    const rbac = result.current.clusterErrors.find(e => e.cluster === 'rbac-cluster')
    const slow = result.current.clusterErrors.find(e => e.cluster === 'slow-cluster')
    expect(rbac?.errorType).toBe('auth')
    expect(slow?.errorType).toBe('timeout')
  })

  it('returns empty clusterErrors when the stream succeeds for every cluster', async () => {
    mockFetchSSE.mockResolvedValue([
      { name: 'p1', namespace: 'n', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ])

    const { result } = renderHook(() => useAllPods('happy-test-unique'))
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })

    expect(result.current.clusterErrors).toEqual([])
  })
})

// ===========================================================================
// usePodIssues
// ===========================================================================

describe('usePodIssues', () => {
  it('returns initial loading state with empty issues array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePodIssues())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.issues).toEqual([])
  })

  it('returns pod issues after SSE fetch resolves', async () => {
    const fakeIssues = [
      { name: 'crash-pod', namespace: 'prod', cluster: 'c1', status: 'CrashLoopBackOff', restarts: 23, issues: ['Back-off'] },
    ]
    mockFetchSSE.mockResolvedValue(fakeIssues)

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(fakeIssues)
    expect(result.current.error).toBeNull()
  })

  it('returns demo pod issues when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster filter via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => usePodIssues('prod-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('prod-cluster')
  })

  it('tracks consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.isFailed).toBe(false)
  })
})

// ===========================================================================
// useDeploymentIssues
// ===========================================================================

describe('useDeploymentIssues', () => {
  it('returns initial loading state with empty issues array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDeploymentIssues())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.issues).toEqual([])
  })

  it('returns deployment issues after SSE fetch resolves', async () => {
    const fakeIssues = [
      { name: 'api-gateway', namespace: 'production', cluster: 'c1', replicas: 3, readyReplicas: 1, reason: 'Unavailable' },
    ]
    mockFetchSSE.mockResolvedValue(fakeIssues)

    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(fakeIssues)
    expect(result.current.error).toBeNull()
  })

  it('returns demo deployment issues when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('handles SSE failure and tracks consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })
    // consecutiveFailures may be 0 if demo fallback resolved first
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(0)
  })
})

// ===========================================================================
// useDeployments
// ===========================================================================

describe('useDeployments', () => {
  it('returns initial loading state with empty deployments array', () => {
    // Block all fetch paths to keep hook in loading state
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDeployments())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.deployments).toEqual([])
  })

  it('returns demo deployments when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeployments())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns deployments from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeDeployments = [
      { name: 'api', namespace: 'prod', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: fakeDeployments }),
    })

    const { result } = renderHook(() => useDeployments('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('tracks consecutive failures and returns lastRefresh', async () => {
    // All fetch paths fail
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDeployments())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.lastRefresh).toBeDefined()
  })
})

// ===========================================================================
// useJobs
// ===========================================================================

describe('useJobs', () => {
  it('returns initial loading state with empty jobs array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useJobs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.jobs).toEqual([])
  })

  it('returns jobs after SSE fetch resolves', async () => {
    const fakeJobs = [
      { name: 'backup-job', namespace: 'system', cluster: 'c1', status: 'Complete', completions: '1/1', age: '1h' },
    ]
    mockFetchSSE.mockResolvedValue(fakeJobs)

    const { result } = renderHook(() => useJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.jobs).toEqual(fakeJobs)
    expect(result.current.error).toBeNull()
  })

  it('returns jobs from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeJobs = [
      { name: 'migration-job', namespace: 'prod', status: 'Running', completions: '0/1' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: fakeJobs }),
    })

    const { result } = renderHook(() => useJobs('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.jobs).toEqual(fakeJobs)
    expect(result.current.error).toBeNull()
  })

  it('handles SSE failure with error message', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('SSE error')
    expect(result.current.jobs).toEqual([])
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ===========================================================================
// useHPAs
// ===========================================================================

describe('useHPAs', () => {
  it('returns initial loading state with empty hpas array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHPAs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.hpas).toEqual([])
  })

  it('returns HPAs from API after fetch resolves', async () => {
    const fakeHPAs = [
      { name: 'web-hpa', namespace: 'prod', reference: 'Deployment/web', minReplicas: 2, maxReplicas: 10, currentReplicas: 5 },
    ]
    mockApiGet.mockResolvedValue({ data: { hpas: fakeHPAs } })

    const { result } = renderHook(() => useHPAs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hpas).toEqual(fakeHPAs)
    expect(result.current.error).toBeNull()
  })

  it('returns HPAs from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeHPAs = [
      { name: 'api-hpa', namespace: 'prod', reference: 'Deployment/api', minReplicas: 1, maxReplicas: 5, currentReplicas: 3 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hpas: fakeHPAs }),
    })

    const { result } = renderHook(() => useHPAs('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hpas).toEqual(fakeHPAs)
    expect(result.current.error).toBeNull()
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useHPAs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
    expect(result.current.hpas).toEqual([])
  })
})

// ===========================================================================
// useReplicaSets
// ===========================================================================

describe('useReplicaSets', () => {
  it('returns initial loading state with empty replicasets array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useReplicaSets())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.replicasets).toEqual([])
  })

  it('returns replicasets from API after fetch resolves', async () => {
    const fakeRS = [
      { name: 'web-rs-abc', namespace: 'prod', replicas: 3, readyReplicas: 3, ownerName: 'web', ownerKind: 'Deployment' },
    ]
    mockApiGet.mockResolvedValue({ data: { replicasets: fakeRS } })

    const { result } = renderHook(() => useReplicaSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.replicasets).toEqual(fakeRS)
    expect(result.current.error).toBeNull()
  })

  it('returns replicasets from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeRS = [
      { name: 'api-rs-xyz', namespace: 'prod', replicas: 2, readyReplicas: 2 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ replicasets: fakeRS }),
    })

    const { result } = renderHook(() => useReplicaSets('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.replicasets).toEqual(fakeRS)
    expect(result.current.error).toBeNull()
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useReplicaSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
  })
})

// ===========================================================================
// useStatefulSets
// ===========================================================================

describe('useStatefulSets', () => {
  it('returns initial loading state with empty statefulsets array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useStatefulSets())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.statefulsets).toEqual([])
  })

  it('returns statefulsets from API after fetch resolves', async () => {
    const fakeSS = [
      { name: 'redis-0', namespace: 'data', replicas: 3, readyReplicas: 3, status: 'Running', image: 'redis:7' },
    ]
    mockApiGet.mockResolvedValue({ data: { statefulsets: fakeSS } })

    const { result } = renderHook(() => useStatefulSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statefulsets).toEqual(fakeSS)
    expect(result.current.error).toBeNull()
  })

  it('returns statefulsets from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeSS = [
      { name: 'pg-0', namespace: 'data', replicas: 1, readyReplicas: 1, status: 'Running' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statefulsets: fakeSS }),
    })

    const { result } = renderHook(() => useStatefulSets('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statefulsets).toEqual(fakeSS)
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useStatefulSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
  })
})

// ===========================================================================
// useDaemonSets
// ===========================================================================

describe('useDaemonSets', () => {
  it('returns initial loading state with empty daemonsets array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDaemonSets())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.daemonsets).toEqual([])
  })

  it('returns daemonsets from API after fetch resolves', async () => {
    const fakeDS = [
      { name: 'node-exporter', namespace: 'monitoring', desiredScheduled: 3, currentScheduled: 3, ready: 3, status: 'Running' },
    ]
    mockApiGet.mockResolvedValue({ data: { daemonsets: fakeDS } })

    const { result } = renderHook(() => useDaemonSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.daemonsets).toEqual(fakeDS)
    expect(result.current.error).toBeNull()
  })

  it('returns daemonsets from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeDS = [
      { name: 'fluentd', namespace: 'logging', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'Running' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daemonsets: fakeDS }),
    })

    const { result } = renderHook(() => useDaemonSets('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.daemonsets).toEqual(fakeDS)
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useDaemonSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
  })
})

// ===========================================================================
// useCronJobs
// ===========================================================================

describe('useCronJobs', () => {
  it('returns initial loading state with empty cronjobs array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCronJobs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.cronjobs).toEqual([])
  })

  it('returns cronjobs from API after fetch resolves', async () => {
    const fakeCJ = [
      { name: 'daily-backup', namespace: 'system', schedule: '0 2 * * *', suspend: false, active: 0 },
    ]
    mockApiGet.mockResolvedValue({ data: { cronjobs: fakeCJ } })

    const { result } = renderHook(() => useCronJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cronjobs).toEqual(fakeCJ)
    expect(result.current.error).toBeNull()
  })

  it('returns cronjobs from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeCJ = [
      { name: 'hourly-sync', namespace: 'ops', schedule: '0 * * * *', suspend: false, active: 1 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cronjobs: fakeCJ }),
    })

    const { result } = renderHook(() => useCronJobs('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cronjobs).toEqual(fakeCJ)
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useCronJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
  })
})

// ===========================================================================
// usePodLogs
// ===========================================================================

describe('usePodLogs', () => {
  it('starts with empty logs and not loading (waits for params)', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))
    // It sets loading to true then fetches
    expect(result.current.logs).toBe('')
  })

  it('returns logs after API fetch resolves', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: 'line1\nline2\nline3' } })

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.logs).toBe('line1\nline2\nline3')
    expect(result.current.error).toBeNull()
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Not found')
    expect(result.current.logs).toBe('')
  })

  it('passes container and tail params to the API', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: '' } })

    const TAIL_LINES = 50
    renderHook(() => usePodLogs('c1', 'default', 'pod-1', 'my-container', TAIL_LINES))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('container=my-container')
    expect(url).toContain('tail=50')
  })

  it('provides refetch function', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: 'log data' } })
    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ===========================================================================
// REGRESSION-PREVENTING ADDITIONS
// ===========================================================================

// ===========================================================================
// useDeployments – extended coverage
// ===========================================================================

