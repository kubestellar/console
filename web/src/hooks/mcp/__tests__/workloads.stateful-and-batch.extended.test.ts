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
  mockAgentFetch,
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
  mockAgentFetch: vi.fn(),
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
  getLocalAgentURL: () => 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
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
  useStatefulSets,
  useDaemonSets,
  useCronJobs,
  useJobs,
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
  mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useStatefulSets – extended coverage
// ===========================================================================

describe('useStatefulSets (extended)', () => {
  it('forwards namespace param via API call', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ statefulsets: [] }) })

    renderHook(() => useStatefulSets('c1', 'databases'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalled())
    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).toContain('namespace=databases')
  })

  it('sets isFailed after repeated failures', async () => {
    mockAgentFetch.mockRejectedValue(new Error('timeout'))

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
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ daemonsets: [] }) })

    renderHook(() => useDaemonSets('c1', 'monitoring'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalled())
    const url = mockAgentFetch.mock.calls[0][0] as string
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
    mockAgentFetch.mockRejectedValue(new Error('fail'))

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
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ cronjobs: [] }) })

    renderHook(() => useCronJobs('c1', 'ops'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalled())
    const url = mockAgentFetch.mock.calls[0][0] as string
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
    mockAgentFetch.mockRejectedValue(new Error('cj-fail'))

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

