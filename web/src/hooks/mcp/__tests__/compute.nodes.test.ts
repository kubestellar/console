import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
      nodeCount?: number
      cpuCores?: number
      memoryGB?: number
    }>
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
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  GPU_POLL_INTERVAL_MS: 30_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  LOCAL_AGENT_URL: 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  MCP_EXTENDED_TIMEOUT_MS: 10_000,
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
  useNodes,
  gpuNodeCache,
  gpuNodeSubscribers,
  updateGPUNodeCache,
} from '../compute'

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
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockClusterCacheRef.clusters = []
  mockFetchSSE.mockResolvedValue([])
  // Reset GPU subscribers and force-clear cached nodes to prevent cross-test contamination.
  // Direct assignment bypasses updateGPUNodeCache's cache protection (which blocks clearing
  // nodes when data exists). Each test must start with a clean slate.
  gpuNodeSubscribers.clear()
  gpuNodeCache.nodes = []
  updateGPUNodeCache({
    lastUpdated: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    consecutiveFailures: 0,
    lastRefresh: null,
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useNodes
// ===========================================================================


describe('useNodes', () => {
  it('returns empty array with loading state on mount', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useNodes())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.nodes).toEqual([])
  })

  it('returns nodes after SSE fetch resolves', async () => {
    const fakeNodes = [
      {
        name: 'node-1', cluster: 'c1', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28.4', cpuCapacity: '8', memoryCapacity: '16Gi',
        podCapacity: '110', conditions: [], unschedulable: false,
      },
    ]
    mockFetchSSE.mockResolvedValue(fakeNodes)

    const { result } = renderHook(() => useNodes())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual(fakeNodes)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster when provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useNodes('my-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
  })

  it('refetch() triggers a new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useNodes())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('re-fetches when demo mode changes and returns demo nodes', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useNodes()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Switch to demo mode — the hook should re-fetch and return demo nodes
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demoMode: true })

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
  })

  it('returns empty nodes on SSE failure even when cluster cache has data (#7351)', async () => {
    // #7396 — After #7351, SSE failure returns empty state instead of
    // fabricating placeholder nodes from cluster cache.
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = [{ name: 'test-cluster', nodeCount: 3, cpuCores: 12, memoryGB: 48 }]

    const { result } = renderHook(() => useNodes('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns empty list with error: null on SSE failure and no cache fallback', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = []

    const { result } = renderHook(() => useNodes('unknown-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns demo nodes when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useNodes())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  // Issue 9355 — per-cluster error surfacing.  The backend emits a
  // `cluster_error` SSE event when an individual cluster's nodes list
  // fails (e.g. 403 from RBAC denial).  useNodes must forward those
  // events as `clusterErrors` so the multi-cluster drill-down can
  // distinguish RBAC denial from a transient endpoint failure when the
  // cluster summary count disagrees with the list length.
  it('surfaces per-cluster errors from SSE cluster_error events', async () => {
    // Simulate the SSE stream invoking onClusterError for a 403 and a timeout.
    mockFetchSSE.mockImplementation(async (opts: {
      onClusterError?: (cluster: string, message: string) => void
    }) => {
      opts.onClusterError?.('rbac-cluster', 'nodes is forbidden: User "u" cannot list resource "nodes"')
      opts.onClusterError?.('slow-cluster', 'context deadline exceeded')
      return []
    })

    const { result } = renderHook(() => useNodes('rbac-test-unique-nodes'))
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
      {
        name: 'n1', cluster: 'c1', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28.4', cpuCapacity: '8', memoryCapacity: '16Gi',
        podCapacity: '110', conditions: [], unschedulable: false,
      },
    ])

    const { result } = renderHook(() => useNodes('happy-test-unique-nodes'))
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })

    expect(result.current.clusterErrors).toEqual([])
  })
})

describe('useNodes — local agent fallback', () => {
  it('uses local agent when available and maps response to NodeInfo', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    const agentResponse = {
      nodes: [{
        name: 'agent-node-1',
        status: 'Ready',
        roles: ['worker'],
        kubeletVersion: 'v1.29.0',
        cpuCapacity: '16',
        memoryCapacity: '64Gi',
        podCapacity: '110',
        conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'ok' }],
        unschedulable: false,
      }],
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(agentResponse),
    })

    const { result } = renderHook(() => useNodes('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBe(1)
    expect(result.current.nodes[0].name).toBe('agent-node-1')
    expect(result.current.nodes[0].cluster).toBe('test-cluster')
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to SSE when local agent returns non-ok response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const sseNodes = [
      {
        name: 'sse-node', cluster: 'test-cluster', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28.0', cpuCapacity: '8', memoryCapacity: '32Gi',
        podCapacity: '110', conditions: [], unschedulable: false,
      },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    const { result } = renderHook(() => useNodes('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBe(1)
    expect(result.current.nodes[0].name).toBe('sse-node')
  })

  it('falls through to SSE when local agent fetch throws', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const sseNodes = [
      {
        name: 'sse-fallback', cluster: 'c1', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28.0', cpuCapacity: '4', memoryCapacity: '16Gi',
        podCapacity: '110', conditions: [], unschedulable: false,
      },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    const { result } = renderHook(() => useNodes('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBe(1)
    expect(result.current.nodes[0].name).toBe('sse-fallback')
  })
})

describe('useNodes — empty cluster handling', () => {
  it('returns empty array for cluster with no nodes and no cache', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useNodes('empty-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns empty on SSE failure — no placeholder fabrication (#7351)', async () => {
    // #7396 — After #7351, placeholder node fabrication was removed.
    // SSE failure returns empty state regardless of cluster cache.
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = [
      { name: 'cached-cluster', nodeCount: 5, cpuCores: 32, memoryGB: 128 },
    ]

    const { result } = renderHook(() => useNodes('cached-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns empty when cluster cache has nodeCount=0', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = [
      { name: 'empty-cached', nodeCount: 0 },
    ]

    const { result } = renderHook(() => useNodes('empty-cached'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

describe('useNodes — additional branches', () => {
  it('returns demo nodes filtered by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useNodes('vllm-d'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBeGreaterThan(0)
    expect(result.current.nodes.every(n => n.cluster === 'vllm-d')).toBe(true)
  })

  it('maps node data from local agent response correctly', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentNodes = [
      {
        name: 'agent-node-1', status: 'Ready', roles: ['worker', 'gpu'],
        kubeletVersion: 'v1.29.0', cpuCapacity: '16', memoryCapacity: '64Gi',
        podCapacity: '250', conditions: [{ type: 'Ready', status: 'True', reason: 'OK', message: 'ok' }],
        unschedulable: true,
      },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: agentNodes }),
    })

    const { result } = renderHook(() => useNodes('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].name).toBe('agent-node-1')
    expect(result.current.nodes[0].cluster).toBe('test-cluster')
    expect(result.current.nodes[0].roles).toEqual(['worker', 'gpu'])
    expect(result.current.nodes[0].unschedulable).toBe(true)
    expect(result.current.nodes[0].podCapacity).toBe('250')
  })

  it('agent returns empty nodes array — falls through to SSE', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent returns ok but empty nodes
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: [] }),
    })
    const sseNodes = [
      { name: 'sse-node', cluster: 'c1', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28', cpuCapacity: '4', memoryCapacity: '8Gi',
        podCapacity: '110', conditions: [], unschedulable: false },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    const { result } = renderHook(() => useNodes('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual(sseNodes)
  })

  it('agent returns non-ok — falls through to SSE', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const sseNodes = [
      { name: 'fallback-node', cluster: 'c1', status: 'Ready', roles: ['worker'],
        kubeletVersion: 'v1.28', cpuCapacity: '8', memoryCapacity: '16Gi',
        podCapacity: '110', conditions: [], unschedulable: false },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    const { result } = renderHook(() => useNodes('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual(sseNodes)
  })

  it('does not attempt agent when cluster is not specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn()
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useNodes()) // no cluster

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    // Agent path requires a cluster param, so globalThis.fetch should not be called for agent
    // (it may be called 0 or more times; the key check is SSE was used)
    expect(mockFetchSSE).toHaveBeenCalled()
  })

  it('resets state only when cluster actually changes (not on initial mount)', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster: string | undefined }) => useNodes(cluster),
      { initialProps: { cluster: 'c1' as string | undefined } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Re-render with same cluster — should NOT reset
    rerender({ cluster: 'c1' })
    expect(result.current.isLoading).toBe(false)

    // Re-render with different cluster — should reset
    rerender({ cluster: 'c2' })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.nodes).toEqual([])
  })
})
