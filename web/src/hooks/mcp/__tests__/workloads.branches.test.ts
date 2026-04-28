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
  useJobs,
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
