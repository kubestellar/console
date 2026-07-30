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
    mockUseDemoMode.mockReturnValue(true)

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
    expect(result.current.replicaSets).toEqual([])
  })

  it('returns replicasets from API after fetch resolves', async () => {
    const fakeRS = [
      { name: 'web-rs-abc', namespace: 'prod', replicas: 3, readyReplicas: 3, ownerName: 'web', ownerKind: 'Deployment' },
    ]
    mockApiGet.mockResolvedValue({ data: { replicasets: fakeRS } })

    const { result } = renderHook(() => useReplicaSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.replicaSets).toEqual(fakeRS)
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
    expect(result.current.replicaSets).toEqual(fakeRS)
    expect(result.current.error).toBeNull()
  })

  it('handles API failure with error message', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useReplicaSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error')
  })
})

