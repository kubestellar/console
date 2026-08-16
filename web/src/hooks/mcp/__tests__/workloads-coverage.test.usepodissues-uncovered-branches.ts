/* Split from workloads-coverage.test.ts for focused test modules. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — mirrors workloads.test.ts setup
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
    clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
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
  getEffectiveInterval: (ms: number) => ms,
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await mockApiGet(...args)
    return { ok: true, status: 200, json: async () => result?.data ?? result }
  }),
  fetchWithRetry: (url: string, opts: Record<string, unknown> = {}) => {
    const { timeoutMs, maxRetries, initialBackoffMs, ...rest } = opts
    void timeoutMs; void maxRetries; void initialBackoffMs
    return globalThis.fetch(url, rest)
  },
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000, LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585' }
})

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

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
import { __resetInfrastructureCaches } from '../workloadQueries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uniqueCounter = 0
function uniqueCluster(prefix = 'cov') {
  return `${prefix}-${++uniqueCounter}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  __resetInfrastructureCaches()
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
// loadPodsCacheFromStorage / savePodsCacheToStorage — localStorage edge cases
// ===========================================================================

describe('usePodIssues — uncovered branches', () => {
  it('passes namespace to kubectl proxy when both cluster and namespace specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockKubectlProxy.getPodIssues.mockResolvedValue([])

    renderHook(() => usePodIssues('c1', 'kube-system'))

    await waitFor(() => expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('c1', 'kube-system'))
  })

  it('handles non-Error thrown values from SSE with generic message', async () => {
    mockFetchSSE.mockRejectedValue('not-an-error')

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Generic fallback or null depending on cache
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('kubectl proxy success resets consecutive failures', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const proxyIssues = [
      { name: 'issue', namespace: 'ns', cluster: 'c1', status: 'CrashLoopBackOff', restarts: 5, issues: ['crash'] },
    ]
    mockKubectlProxy.getPodIssues.mockResolvedValue(proxyIssues)

    const { result } = renderHook(() => usePodIssues('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.issues).toEqual(proxyIssues)
  })

  it('silent kubectl proxy success clears isRefreshing without delay', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockKubectlProxy.getPodIssues.mockResolvedValue([])

    const { result } = renderHook(() => usePodIssues('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('SSE progressive update via onClusterData accumulates issues', async () => {
    const issue1 = { name: 'i1', namespace: 'ns', cluster: 'c1', status: 'CrashLoopBackOff', restarts: 5, issues: ['crash'] }
    const issue2 = { name: 'i2', namespace: 'ns', cluster: 'c2', status: 'Pending', restarts: 0, issues: ['unschedulable'] }

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [issue1])
      opts.onClusterData('c2', [issue2])
      return [issue1, issue2]
    })

    const { result } = renderHook(() => usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues.length).toBe(2)
  })
})
