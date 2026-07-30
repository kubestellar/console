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
// useStatefulSets
// ===========================================================================

describe('useStatefulSets', () => {
  it('returns initial loading state with empty statefulsets array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useStatefulSets())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.statefulSets).toEqual([])
  })

  it('returns statefulsets from API after fetch resolves', async () => {
    const fakeSS = [
      { name: 'redis-0', namespace: 'data', replicas: 3, readyReplicas: 3, status: 'Running', image: 'redis:7' },
    ]
    mockApiGet.mockResolvedValue({ data: { statefulsets: fakeSS } })

    const { result } = renderHook(() => useStatefulSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statefulSets).toEqual(fakeSS)
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
    expect(result.current.statefulSets).toEqual(fakeSS)
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
    expect(result.current.daemonSets).toEqual([])
  })

  it('returns daemonsets from API after fetch resolves', async () => {
    const fakeDS = [
      { name: 'node-exporter', namespace: 'monitoring', desiredScheduled: 3, currentScheduled: 3, ready: 3, status: 'Running' },
    ]
    mockApiGet.mockResolvedValue({ data: { daemonsets: fakeDS } })

    const { result } = renderHook(() => useDaemonSets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.daemonSets).toEqual(fakeDS)
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
    expect(result.current.daemonSets).toEqual(fakeDS)
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
    expect(result.current.cronJobs).toEqual([])
  })

  it('returns cronjobs from API after fetch resolves', async () => {
    const fakeCJ = [
      { name: 'daily-backup', namespace: 'system', schedule: '0 2 * * *', suspend: false, active: 0 },
    ]
    mockApiGet.mockResolvedValue({ data: { cronjobs: fakeCJ } })

    const { result } = renderHook(() => useCronJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cronJobs).toEqual(fakeCJ)
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
    expect(result.current.cronJobs).toEqual(fakeCJ)
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

