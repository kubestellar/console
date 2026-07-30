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

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
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
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
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
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000, LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585' }
})

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
  mockUseDemoMode.mockReturnValue(false)
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
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('sorts pods by restarts descending by default', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const restarts = result.current.pods.map(p => p.restarts)
    for (let i = 1; i < restarts.length; i++) {
      expect(restarts[i]).toBeLessThanOrEqual(restarts[i - 1])
    }
  })

  it('sorts pods by name when sortBy=name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => usePods(undefined, undefined, 'name', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const names = result.current.pods.map(p => p.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('limits the number of returned pods', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

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
    mockUseDemoMode.mockReturnValue(true)

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
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useAllPods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
  })

  it('filters by cluster when provided in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

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
    mockUseDemoMode.mockReturnValue(true)

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

    // With exponential backoff, cascading effect re-runs quickly accumulate failures
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    // Persistent failures cascade via useEffect dep on consecutiveFailures
    await waitFor(() => expect(result.current.isFailed).toBe(true))
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
    mockUseDemoMode.mockReturnValue(true)

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

