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
  useHPAs,
  useAllPods,
  usePods,
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
  mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useHPAs – extended coverage
// ===========================================================================

describe('useHPAs (extended)', () => {
  it('forwards namespace param via API', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ hpas: [] }) })

    renderHook(() => useHPAs('c1', 'web'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalled())
    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).toContain('namespace=web')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockAgentFetch.mockRejectedValue(new Error('hpa-fail'))

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
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useAllPods(undefined, 'ml'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.pods.every(p => p.namespace === 'ml')).toBe(true)
  })

  it('bypasses demo mode when forceLive=true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)
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
    mockUseDemoMode.mockReturnValue(true)

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
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ logs: 'data' }) })

    renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(mockAgentFetch).toHaveBeenCalled())
    const url = mockAgentFetch.mock.calls[0][0] as string
    expect(url).toContain('tail=100')
  })

  it('refetch replaces existing logs', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ logs: 'initial logs' }) })

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))
    await waitFor(() => expect(result.current.logs).toBe('initial logs'))

    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ logs: 'updated logs' }) })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.logs).toBe('updated logs'))
  })

  it('handles empty logs response', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ logs: '' }) })

    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.logs).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('clears error on successful refetch after failure', async () => {
    mockAgentFetch.mockRejectedValue(new Error('failed'))
    const { result } = renderHook(() => usePodLogs('c1', 'default', 'pod-1'))
    await waitFor(() => expect(result.current.error).toBe('failed'))

    mockAgentFetch.mockResolvedValue({ ok: true, json: async () => ({ logs: 'recovered' }) })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.logs).toBe('recovered')
  })
})

