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

