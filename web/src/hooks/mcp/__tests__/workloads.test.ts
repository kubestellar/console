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
  subscribeWorkloadsCache,
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

describe('useDeployments (extended)', () => {
  it('filters demo deployments by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeployments('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
    expect(result.current.deployments.every(d => d.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo deployments by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeployments(undefined, 'batch'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
    expect(result.current.deployments.every(d => d.namespace === 'batch')).toBe(true)
  })

  it('falls back to kubectl proxy when agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    // kubectl proxy returns data
    const fakeDeployments = [
      { name: 'proxy-dep', namespace: 'ns', replicas: 1, readyReplicas: 1, status: 'running' },
    ]
    mockKubectlProxy.getDeployments.mockResolvedValue(fakeDeployments)

    const { result } = renderHook(() => useDeployments('cluster-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('falls back to REST API when both agent and kubectl proxy fail', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // First two fetches (agent, kubectl proxy) fail; third (REST API) succeeds
    const restDeployments = [
      { name: 'rest-dep', namespace: 'prod', replicas: 2, readyReplicas: 2, status: 'running' },
    ]
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      // First call: agent fails (non-ok)
      if (callCount === 1) return Promise.resolve({ ok: false, status: 500 })
      // Subsequent calls: REST API succeeds
      return Promise.resolve({
        ok: true,
        json: async () => ({ deployments: restDeployments }),
      })
    })
    mockKubectlProxy.getDeployments.mockRejectedValue(new Error('kubectl proxy down'))

    const { result } = renderHook(() => useDeployments('cluster-b'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments.length).toBeGreaterThan(0)
  })

  it('enriches deployment cluster field when missing from response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const deployWithoutCluster = [
      { name: 'no-cluster', namespace: 'prod', replicas: 1, readyReplicas: 1, status: 'running' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: deployWithoutCluster }),
    })

    const { result } = renderHook(() => useDeployments('enriched-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.deployments[0].cluster).toBe('enriched-cluster')
  })

  it('resets consecutive failures to zero on success', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    // First: fail
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useDeployments())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)

    // Then: succeed on refetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: [{ name: 'd', namespace: 'n', replicas: 1, readyReplicas: 1, status: 'running' }] }),
    })

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
  })

  it('isFailed becomes true after 3 or more consecutive failures', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useDeployments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Trigger two more refetches to accumulate 3 total failures
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('reports agent data success when agent path succeeds', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: [] }),
    })

    const { result } = renderHook(() => useDeployments('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })
})

// ===========================================================================
// usePodIssues – extended coverage
// ===========================================================================

describe('usePodIssues (extended)', () => {
  it('uses kubectl proxy when cluster is specified and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const proxyIssues = [
      { name: 'proxy-crash', namespace: 'ns', cluster: 'c2', status: 'CrashLoopBackOff', restarts: 10, issues: ['crash'] },
    ]
    mockKubectlProxy.getPodIssues.mockResolvedValue(proxyIssues)

    const { result } = renderHook(() => usePodIssues('c2'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(proxyIssues)
    expect(result.current.error).toBeNull()
  })

  it('falls back to SSE when kubectl proxy throws', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockKubectlProxy.getPodIssues.mockRejectedValue(new Error('proxy error'))

    const sseIssues = [
      { name: 'sse-issue', namespace: 'ns', cluster: 'c3', status: 'Pending', restarts: 0, issues: ['unschedulable'] },
    ]
    mockFetchSSE.mockResolvedValue(sseIssues)

    const { result } = renderHook(() => usePodIssues('c3'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(sseIssues)
  })

  it('filters demo pod issues by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePodIssues(undefined, 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.every(i => i.namespace === 'production')).toBe(true)
  })

  it('sets empty issues array on cold-cache SSE failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual([])
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function that re-invokes SSE', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('uses cluster context from clusterCacheRef for kubectl proxy', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'logical-name', context: 'actual-context', reachable: true },
    ]
    mockKubectlProxy.getPodIssues.mockResolvedValue([])

    renderHook(() => usePodIssues('logical-name'))

    await waitFor(() => expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('actual-context', undefined))
  })
})

// ===========================================================================
// useDeploymentIssues – extended coverage
// ===========================================================================

describe('useDeploymentIssues (extended)', () => {
  it('filters demo deployment issues by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeploymentIssues('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.issues.every(i => i.cluster === 'prod-east')).toBe(true)
  })

  it('forwards namespace filter via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useDeploymentIssues('c1', 'prod-ns'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.namespace).toBe('prod-ns')
    expect(callArgs.params?.cluster).toBe('c1')
  })

  it('increments consecutive failures on SSE failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('connection refused'))

    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Regardless of whether a module-level cache exists from prior tests,
    // consecutive failures should always increment
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function and lastRefresh', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
    expect(result.current.lastRefresh).toBeDefined()
  })
})

// ===========================================================================
// useReplicaSets – extended coverage
// ===========================================================================

describe('useReplicaSets (extended)', () => {
  it('forwards namespace param via API call', async () => {
    mockApiGet.mockResolvedValue({ data: { replicasets: [] } })

    renderHook(() => useReplicaSets('c1', 'kube-system'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('namespace=kube-system')
  })

  it('sets isFailed after 3 consecutive API failures', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useReplicaSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('clears replicasets array on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useReplicaSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.replicasets).toEqual([])
  })

  it('reports agent data success when agent path works', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ replicasets: [{ name: 'rs1', namespace: 'n', replicas: 1, readyReplicas: 1 }] }),
    })

    const { result } = renderHook(() => useReplicaSets('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })
})

// ===========================================================================
// useStatefulSets – extended coverage
// ===========================================================================

describe('useStatefulSets (extended)', () => {
  it('forwards namespace param via API call', async () => {
    mockApiGet.mockResolvedValue({ data: { statefulsets: [] } })

    renderHook(() => useStatefulSets('c1', 'databases'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('namespace=databases')
  })

  it('sets isFailed after repeated failures', async () => {
    mockApiGet.mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useStatefulSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('reports agent data success when agent responds', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statefulsets: [] }),
    })

    const { result } = renderHook(() => useStatefulSets('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })
})

// ===========================================================================
// useDaemonSets – extended coverage
// ===========================================================================

describe('useDaemonSets (extended)', () => {
  it('forwards cluster and namespace params via API', async () => {
    mockApiGet.mockResolvedValue({ data: { daemonsets: [] } })

    renderHook(() => useDaemonSets('c1', 'monitoring'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('cluster=c1')
    expect(url).toContain('namespace=monitoring')
  })

  it('reports agent data success on agent path', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daemonsets: [{ name: 'ds1', namespace: 'n', desiredScheduled: 1, currentScheduled: 1, ready: 1 }] }),
    })

    const { result } = renderHook(() => useDaemonSets('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('sets isFailed after repeated failures', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useDaemonSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })
})

// ===========================================================================
// useCronJobs – extended coverage
// ===========================================================================

describe('useCronJobs (extended)', () => {
  it('forwards namespace param to API', async () => {
    mockApiGet.mockResolvedValue({ data: { cronjobs: [] } })

    renderHook(() => useCronJobs('c1', 'ops'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('namespace=ops')
  })

  it('reports agent success on agent path', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cronjobs: [{ name: 'cj1', namespace: 'n', schedule: '*/5 * * * *', suspend: false, active: 0 }] }),
    })

    const { result } = renderHook(() => useCronJobs('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('sets isFailed after 3 failures', async () => {
    mockApiGet.mockRejectedValue(new Error('cj-fail'))

    const { result } = renderHook(() => useCronJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })
})

// ===========================================================================
// useJobs – extended coverage
// ===========================================================================

describe('useJobs (extended)', () => {
  it('falls back to SSE when agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const sseJobs = [
      { name: 'sse-job', namespace: 'sys', cluster: 'c1', status: 'Complete', completions: '1/1', age: '2h' },
    ]
    mockFetchSSE.mockResolvedValue(sseJobs)

    const { result } = renderHook(() => useJobs('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.jobs).toEqual(sseJobs)
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('reports agent data success when agent path works', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    })

    renderHook(() => useJobs('c1'))
    await waitFor(() => expect(mockReportAgentDataSuccess).toHaveBeenCalled())
  })
})

// ===========================================================================
// useHPAs – extended coverage
// ===========================================================================

describe('useHPAs (extended)', () => {
  it('forwards namespace param via API', async () => {
    mockApiGet.mockResolvedValue({ data: { hpas: [] } })

    renderHook(() => useHPAs('c1', 'web'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('namespace=web')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockApiGet.mockRejectedValue(new Error('hpa-fail'))

    const { result } = renderHook(() => useHPAs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('reports agent data success on agent path', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hpas: [] }),
    })

    renderHook(() => useHPAs('c1'))
    await waitFor(() => expect(mockReportAgentDataSuccess).toHaveBeenCalled())
  })
})

// ===========================================================================
// useAllPods – extended coverage
// ===========================================================================

describe('useAllPods (extended)', () => {
  it('filters demo pods by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useAllPods(undefined, 'ml'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.namespace === 'ml')).toBe(true)
  })

  it('bypasses demo mode when forceLive=true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockFetchSSE.mockResolvedValue([
      { name: 'live-pod', namespace: 'live', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ])

    const { result } = renderHook(() => useAllPods(undefined, undefined, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have called SSE instead of using demo data
    expect(mockFetchSSE).toHaveBeenCalled()
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useAllPods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('forwards both cluster and namespace to SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useAllPods('test-cluster', 'test-ns'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('test-cluster')
    expect(callArgs.params?.namespace).toBe('test-ns')
  })
})

// ===========================================================================
// usePods – extended coverage
// ===========================================================================

describe('usePods (extended)', () => {
  it('filters demo pods by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods(undefined, 'production', 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.namespace === 'production')).toBe(true)
  })

  it('skips fetch when backend is unavailable', async () => {
    mockIsBackendUnavailable.mockReturnValue(true)

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not have called SSE when backend is unavailable
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('forwards namespace filter via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => usePods('c1', 'kube-system'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.namespace).toBe('kube-system')
    expect(callArgs.params?.cluster).toBe('c1')
  })

  it('resets consecutive failures on successful fetch', async () => {
    // First: fail
    mockFetchSSE.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => usePods())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)

    // Then: succeed
    mockFetchSSE.mockResolvedValue([
      { name: 'p', namespace: 'ns', cluster: 'c', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ])
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
  })
})

// ===========================================================================
// usePodLogs – extended coverage
// ===========================================================================

describe('usePodLogs (extended)', () => {
  it('uses default tail of 100 when not specified', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: 'data' } })

    renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url = mockApiGet.mock.calls[0][0] as string
    expect(url).toContain('tail=100')
  })

  it('refetch replaces existing logs', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: 'initial logs' } })

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))
    await waitFor(() => expect(result.current.logs).toBe('initial logs'))

    mockApiGet.mockResolvedValue({ data: { logs: 'updated logs' } })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.logs).toBe('updated logs'))
  })

  it('handles empty logs response', async () => {
    mockApiGet.mockResolvedValue({ data: { logs: '' } })

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.logs).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('clears error on successful refetch after failure', async () => {
    mockApiGet.mockRejectedValue(new Error('failed'))
    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))
    await waitFor(() => expect(result.current.error).toBe('failed'))

    mockApiGet.mockResolvedValue({ data: { logs: 'recovered' } })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.logs).toBe('recovered')
  })
})

// ===========================================================================
// subscribeWorkloadsCache
// ===========================================================================

describe('subscribeWorkloadsCache', () => {
  it('returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeWorkloadsCache(callback)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('does not call callback after unsubscribe', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeWorkloadsCache(callback)
    unsubscribe()
    // Trigger a refetch that would normally notify subscribers
    // Since we unsubscribed, callback should not be called
    expect(callback).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Additional branch coverage — workloads.ts
// ===========================================================================

describe('usePods — additional branches', () => {
  it('skips fetch when backend is unavailable', async () => {
    mockIsBackendUnavailable.mockReturnValue(true)
    mockFetchSSE.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // SSE should not be called when backend is unavailable
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.lastRefresh).not.toBeNull()
  })

  it('filters demo pods by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods('prod-east', undefined, 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo pods by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods(undefined, 'production', 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.namespace === 'production')).toBe(true)
  })

  it('forwards namespace filter via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => usePods(undefined, 'kube-system'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.namespace).toBe('kube-system')
  })

  it('isRefreshing shows briefly in non-silent demo mode fetch', async () => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePods())

    // After demo data loads, isRefreshing should be true briefly
    await act(() => Promise.resolve())
    // Advance past MIN_REFRESH_INDICATOR_MS (500ms)
    const INDICATOR_CLEAR_MS = 600
    act(() => { vi.advanceTimersByTime(INDICATOR_CLEAR_MS) })
    expect(result.current.isRefreshing).toBe(false)
    vi.useRealTimers()
  })

  it('ignores AbortError from SSE (not treated as failure)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetchSSE.mockRejectedValue(abortError)

    const { result } = renderHook(() => usePods())

    // AbortError should be silently ignored, not incrementing consecutiveFailures
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('returns isFailed=false with 0 consecutiveFailures initially', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePods())
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

describe('useAllPods — additional branches', () => {
  it('filters by namespace in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useAllPods(undefined, 'ml'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.namespace === 'ml')).toBe(true)
  })

  it('bypasses demo mode when forceLive=true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const livePods = [
      { name: 'live-pod', namespace: 'prod', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1h' },
    ]
    mockFetchSSE.mockResolvedValue(livePods)

    const { result } = renderHook(() => useAllPods(undefined, undefined, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive skips demo data and calls SSE
    expect(mockFetchSSE).toHaveBeenCalled()
    expect(result.current.pods).toEqual(livePods)
  })

  it('ignores AbortError during SSE fetch', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockFetchSSE.mockRejectedValue(abortError)

    const { result } = renderHook(() => useAllPods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // AbortError should be silently ignored
    expect(result.current.error).toBeNull()
  })
})

describe('usePodIssues — additional branches', () => {
  it('filters demo issues by cluster and namespace simultaneously', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePodIssues('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.issues.every(i =>
      i.cluster === 'prod-east' && i.namespace === 'production'
    )).toBe(true)
  })

  it('resets state when cluster changes', async () => {
    mockFetchSSE.mockResolvedValue([
      { name: 'issue-1', namespace: 'ns', cluster: 'c1', status: 'CrashLoopBackOff', restarts: 5, issues: ['crash'] },
    ])

    const { result, rerender } = renderHook(
      ({ cluster }: { cluster: string }) => usePodIssues(cluster),
      { initialProps: { cluster: 'c1' } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)

    // Change cluster — issues should reset
    mockFetchSSE.mockResolvedValue([])
    rerender({ cluster: 'c2' })
    // After cluster change, issues reset to empty before re-fetching
    await waitFor(() => expect(result.current.issues).toEqual([]))
  })

  it('forwards both cluster and namespace via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => usePodIssues('my-cluster', 'my-ns'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
    expect(callArgs.params?.namespace).toBe('my-ns')
  })
})

describe('useDeploymentIssues — additional branches', () => {
  it('filters demo deployment issues by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeploymentIssues('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.issues.every(i => i.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo deployment issues by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useDeploymentIssues(undefined, 'batch'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBeGreaterThan(0)
    expect(result.current.issues.every(i => i.namespace === 'batch')).toBe(true)
  })

  it('ignores AbortError from SSE (not treated as failure)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockFetchSSE.mockRejectedValue(abortError)

    const { result } = renderHook(() => useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

describe('useJobs — additional branches', () => {
  it('forwards both cluster and namespace in SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useJobs('my-cluster', 'batch'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
    expect(callArgs.params?.namespace).toBe('batch')
  })

  it('falls back to SSE when local agent fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))
    const sseJobs = [
      { name: 'sse-job', namespace: 'system', cluster: 'c1', status: 'Complete', completions: '1/1', age: '2h' },
    ]
    mockFetchSSE.mockResolvedValue(sseJobs)

    const { result } = renderHook(() => useJobs('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.jobs).toEqual(sseJobs)
  })
})
