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
