import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockKubectlProxy,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockKubectlProxy: {
    getNamespaces: vi.fn(),
  },
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
      namespaces?: string[]
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

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  LOCAL_AGENT_URL: 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useNamespaces, useNamespaceStats } from '../namespaces'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useNamespaces
// ===========================================================================

describe('useNamespaces', () => {
  it('returns empty namespaces when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaces())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toEqual([])
  })

  it('returns demo namespaces when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces.length).toBeGreaterThan(0)
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.error).toBeNull()
  })

  it('fetches namespaces from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ name: 'default' }, { name: 'kube-system' }, { name: 'monitoring' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.namespaces).toContain('monitoring')
  })

  // #3945 regression: agent tier must also merge with cluster cache so
  // namespaces discovered via health-check fallbacks (pods/events/deploys)
  // still appear when the agent returns an incomplete list (e.g. user
  // lacks cluster-wide `list namespaces` RBAC on some cluster).
  it('merges cluster cache namespaces with local agent response (#3945)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['cache-only-ns', 'fma-mspreitz'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'agent-seen-ns' }] }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Union of agent response and cached namespaces
    expect(result.current.namespaces).toContain('agent-seen-ns')
    expect(result.current.namespaces).toContain('cache-only-ns')
    expect(result.current.namespaces).toContain('fma-mspreitz')
  })

  // #3945 regression: kubectl proxy tier must also merge with cluster cache.
  it('merges cluster cache namespaces with kubectl proxy response (#3945)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent fails → tier 2 (kubectl proxy) runs
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['fma-mspreitz'] },
    ]
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
    expect(result.current.namespaces).toContain('fma-mspreitz')
  })

  it('falls back to REST API when agent fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('monitoring')
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('falls back to default namespaces when all methods fail', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaces('unreachable-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Falls back to ['default', 'kube-system'] as minimal fallback
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
  })

  it('skips demo mode when forceLive is true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockResolvedValue({ data: { pods: [{ name: 'p', namespace: 'live-ns', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] } })

    const { result } = renderHook(() => useNamespaces('my-cluster', true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive bypasses demo mode; should use real API
    expect(result.current.namespaces).toContain('live-ns')
  })

  // --- New regression-preventing tests ---

  it('demo namespaces include the full set of 10 synthetic namespaces', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const EXPECTED_DEMO_NS_COUNT = 10
    expect(result.current.namespaces.length).toBe(EXPECTED_DEMO_NS_COUNT)
    // Spot-check several expected namespaces
    expect(result.current.namespaces).toContain('monitoring')
    expect(result.current.namespaces).toContain('production')
    expect(result.current.namespaces).toContain('staging')
    expect(result.current.namespaces).toContain('kube-public')
  })

  it('agent response handles Name (capital N) field variant', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ Name: 'cap-ns-1' }, { Name: 'cap-ns-2' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('cap-ns-1')
    expect(result.current.namespaces).toContain('cap-ns-2')
  })

  it('agent response filters out entries with no name', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ name: 'valid-ns' }, { other: 'no-name-field' }, { name: '' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('valid-ns')
    // Empty string and entries without name/Name should be filtered out
    expect(result.current.namespaces).not.toContain('')
  })

  it('reports agent data success after successful agent fetch', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'ns1' }] }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls back to kubectl proxy when agent returns non-ok response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    // kubectl proxy succeeds
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1', 'proxy-ns-2'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
    expect(result.current.namespaces).toContain('proxy-ns-2')
  })

  it('falls back to kubectl proxy when agent returns empty namespaces', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [] }),
    })
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
  })

  it('uses cluster context from cache when calling kubectl proxy', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    // Set up cache with a context alias
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'my-context-alias' },
    ]
    mockKubectlProxy.getNamespaces.mockResolvedValue(['from-proxy'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // kubectl proxy should be called with the context from cache
    expect(mockKubectlProxy.getNamespaces).toHaveBeenCalledWith('my-context-alias')
  })

  it('uses cluster name as context when cache has no entry', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    mockClusterCacheRef.clusters = [] // no cache entry
    mockKubectlProxy.getNamespaces.mockResolvedValue(['from-proxy'])

    const { result } = renderHook(() => useNamespaces('raw-cluster-name'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should fall back to using cluster name directly as context
    expect(mockKubectlProxy.getNamespaces).toHaveBeenCalledWith('raw-cluster-name')
  })

  it('merges cached namespaces with pod-based namespaces from REST API', async () => {
    mockIsAgentUnavailable.mockReturnValue(true) // skip agent and proxy
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['cached-ns-1', 'cached-ns-2'] },
    ]
    const fakePods = [
      { name: 'pod-1', namespace: 'cached-ns-1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'new-ns-from-pods', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should contain both cached and pod-sourced namespaces (deduplicated)
    expect(result.current.namespaces).toContain('cached-ns-1')
    expect(result.current.namespaces).toContain('cached-ns-2')
    expect(result.current.namespaces).toContain('new-ns-from-pods')
  })

  it('returns sorted namespaces from REST API fallback', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'zebra', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'alpha', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'middle', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const sorted = [...result.current.namespaces].sort()
    expect(result.current.namespaces).toEqual(sorted)
  })

  it('uses cached namespaces immediately on cluster change (non-demo)', async () => {
    // Start in non-demo with a cluster that has cached namespaces
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [
      { name: 'new-cluster', namespaces: ['cache-hit-ns'] },
    ]
    // Pod API returns data slowly (never resolves for this test)
    mockApiGet
      .mockResolvedValueOnce({ data: { pods: [{ name: 'p', namespace: 'old-ns', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] } })
      .mockReturnValue(new Promise(() => {})) // second call never resolves

    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useNamespaces(cluster),
      { initialProps: { cluster: 'old-cluster' } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Change cluster — the useEffect sets cached namespaces synchronously
    rerender({ cluster: 'new-cluster' })
    // The cached namespaces should appear immediately via the cluster-change effect
    await waitFor(() => expect(result.current.namespaces).toContain('cache-hit-ns'))
  })

  it('deduplicates namespaces from pods (no duplicates)', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const defaultCount = result.current.namespaces.filter(ns => ns === 'default').length
    expect(defaultCount).toBe(1)
  })

  it('handles pod API returning empty pods array', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // No pods and no cache => falls back to ['default', 'kube-system']
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
  })

  it('refetch triggers a new fetch cycle', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockResolvedValue({ data: { pods: [{ name: 'p', namespace: 'ns1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('encodes cluster name in agent URL', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'ns1' }] }),
    })
    globalThis.fetch = fetchMock

    renderHook(() => useNamespaces('cluster with spaces'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const urlArg = fetchMock.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=cluster%20with%20spaces')
  })

  it('survives pod API failure while still using cached namespaces', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', namespaces: ['cached-only'] },
    ]
    // Pod API fails
    mockApiGet.mockRejectedValue(new Error('Pod API down'))

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still have the cached namespace even though pod API failed
    // (the outer try/catch catches the pod API error and falls through)
    expect(result.current.namespaces.length).toBeGreaterThanOrEqual(1)
  })
})

// ===========================================================================
// useNamespaceStats
// ===========================================================================

describe('useNamespaceStats', () => {
  it('returns empty stats when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaceStats())

    expect(result.current.stats).toEqual([])
  })

  it('returns namespace stats from API after fetch resolves', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'production', status: 'Pending', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'pod-4', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '7d' },
      { name: 'pod-5', namespace: 'monitoring', status: 'Failed', ready: '0/1', restarts: 5, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBe(2)

    const prodStats = result.current.stats.find(s => s.name === 'production')
    expect(prodStats).toBeDefined()
    expect(prodStats!.podCount).toBe(3)
    expect(prodStats!.runningPods).toBe(2)
    expect(prodStats!.pendingPods).toBe(1)

    const monStats = result.current.stats.find(s => s.name === 'monitoring')
    expect(monStats).toBeDefined()
    expect(monStats!.podCount).toBe(2)
    expect(monStats!.failedPods).toBe(1)
  })

  it('sorts stats by pod count descending', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'small', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-4', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats[0].name).toBe('large')
    expect(result.current.stats[1].name).toBe('small')
  })

  it('falls back to demo stats on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression-preventing tests ---

  it('counts CrashLoopBackOff pods as failed', async () => {
    const fakePods = [
      { name: 'crash-pod', namespace: 'ns1', status: 'CrashLoopBackOff', ready: '0/1', restarts: 42, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.failedPods).toBe(1)
    expect(ns1!.runningPods).toBe(0)
    expect(ns1!.pendingPods).toBe(0)
  })

  it('counts Error pods as failed', async () => {
    const fakePods = [
      { name: 'err-pod', namespace: 'ns1', status: 'Error', ready: '0/1', restarts: 0, age: '1h' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.failedPods).toBe(1)
  })

  it('assigns pods with no namespace to "default"', async () => {
    const fakePods = [
      { name: 'orphan-pod', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const defaultStats = result.current.stats.find(s => s.name === 'default')
    expect(defaultStats).toBeDefined()
    expect(defaultStats!.podCount).toBe(1)
  })

  it('handles unknown pod status (neither Running, Pending, nor Failed variants)', async () => {
    const fakePods = [
      { name: 'term-pod', namespace: 'ns1', status: 'Terminating', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'succ-pod', namespace: 'ns1', status: 'Succeeded', ready: '0/1', restarts: 0, age: '2h' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.podCount).toBe(2)
    // Neither Running, Pending, nor in the Failed group
    expect(ns1!.runningPods).toBe(0)
    expect(ns1!.pendingPods).toBe(0)
    expect(ns1!.failedPods).toBe(0)
  })

  it('handles empty pods array without error', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles null pods field gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: null } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('demo fallback stats have consistent structure', async () => {
    mockApiGet.mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const stat of result.current.stats) {
      expect(stat.name).toBeTruthy()
      expect(typeof stat.podCount).toBe('number')
      expect(typeof stat.runningPods).toBe('number')
      expect(typeof stat.pendingPods).toBe('number')
      expect(typeof stat.failedPods).toBe('number')
      // podCount should equal sum of sub-counts plus "other" status pods
      expect(stat.podCount).toBeGreaterThanOrEqual(
        stat.runningPods + stat.pendingPods + stat.failedPods,
      )
    }
  })

  it('demo fallback stats are sorted by pod count descending', async () => {
    mockApiGet.mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (let i = 1; i < result.current.stats.length; i++) {
      expect(result.current.stats[i].podCount).toBeLessThanOrEqual(
        result.current.stats[i - 1].podCount,
      )
    }
  })

  it('refetch triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('encodes cluster name in API URL', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    renderHook(() => useNamespaceStats('cluster/with-special'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster%2Fwith-special')
  })

  it('fetches with limit=1000 query parameter', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('limit=1000')
  })

  it('correctly aggregates mixed statuses across multiple namespaces', async () => {
    const fakePods = [
      { name: 'p1', namespace: 'alpha', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'p2', namespace: 'alpha', status: 'Pending', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'p3', namespace: 'alpha', status: 'Failed', ready: '0/1', restarts: 0, age: '1h' },
      { name: 'p4', namespace: 'beta', status: 'Running', ready: '1/1', restarts: 0, age: '2d' },
      { name: 'p5', namespace: 'beta', status: 'CrashLoopBackOff', ready: '0/1', restarts: 99, age: '3h' },
      { name: 'p6', namespace: 'gamma', status: 'Error', ready: '0/1', restarts: 0, age: '30m' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const EXPECTED_NS_COUNT = 3
    expect(result.current.stats.length).toBe(EXPECTED_NS_COUNT)

    const alpha = result.current.stats.find(s => s.name === 'alpha')!
    expect(alpha.podCount).toBe(3)
    expect(alpha.runningPods).toBe(1)
    expect(alpha.pendingPods).toBe(1)
    expect(alpha.failedPods).toBe(1)

    const beta = result.current.stats.find(s => s.name === 'beta')!
    expect(beta.podCount).toBe(2)
    expect(beta.runningPods).toBe(1)
    expect(beta.failedPods).toBe(1) // CrashLoopBackOff counts as failed

    const gamma = result.current.stats.find(s => s.name === 'gamma')!
    expect(gamma.podCount).toBe(1)
    expect(gamma.failedPods).toBe(1) // Error counts as failed
  })
})
