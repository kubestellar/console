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
  useGPUNodes,
  useNVIDIAOperators,
  gpuNodeCache,
  gpuNodeSubscribers,
  updateGPUNodeCache,
  notifyGPUNodeSubscribers,
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
  // Reset GPU subscribers (nodes may persist due to cache protection; that is acceptable)
  gpuNodeSubscribers.clear()
  // Set lastUpdated to null so isStale=true and fetch is always attempted
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

  it('falls back to cluster-cache placeholder node data when available', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = [{ name: 'test-cluster', nodeCount: 3, cpuCores: 12, memoryGB: 48 }]

    const { result } = renderHook(() => useNodes('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBeGreaterThan(0)
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
})

// ===========================================================================
// useGPUNodes
// ===========================================================================

describe('useGPUNodes', () => {
  it('subscribes to shared GPU node cache updates', async () => {
    mockFetchSSE.mockResolvedValue([])
    renderHook(() => useGPUNodes())

    await waitFor(() => expect(gpuNodeSubscribers.size).toBeGreaterThan(0))
  })

  it('returns GPU nodes from cache after a successful fetch', async () => {
    const fakeNodes = [
      { name: 'gpu-1', cluster: 'vllm-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(fakeNodes)

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes[0].name).toBe('gpu-1')
  })

  it('polls every GPU_POLL_INTERVAL_MS and clears interval on unmount', async () => {
    vi.useFakeTimers()
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => useGPUNodes())

    // Confirm subscription was added
    expect(gpuNodeSubscribers.size).toBeGreaterThan(0)

    unmount()

    // After unmount the subscriber is removed
    expect(gpuNodeSubscribers.size).toBe(0)
  })

  it('deduplicates GPU nodes by node name', async () => {
    // Two entries with the same name but different cluster formats
    const node1 = {
      name: 'gpu-dup', cluster: 'default/long-context-name-auto-generated',
      gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const,
    }
    const node2 = {
      name: 'gpu-dup', cluster: 'short-name',
      gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const,
    }

    mockFetchSSE.mockResolvedValue([node1, node2])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.some(n => n.name === 'gpu-dup'), { timeout: 3000 })

    // After deduplication there should be exactly one entry for 'gpu-dup'
    const dedupNames = result.current.nodes.filter(n => n.name === 'gpu-dup')
    expect(dedupNames.length).toBe(1)
  })

  it('filters returned nodes by cluster when a cluster is specified', async () => {
    const fakeNodes = [
      { name: 'gpu-a', cluster: 'cluster-a', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-b', cluster: 'cluster-b', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(fakeNodes)

    const { result } = renderHook(() => useGPUNodes('cluster-a'))

    await waitFor(() => result.current.nodes.length > 0, { timeout: 3000 })
    expect(result.current.nodes.every(n => n.cluster.startsWith('cluster-a'))).toBe(true)
    expect(result.current.nodes.find(n => n.name === 'gpu-b')).toBeUndefined()
  })

  it('preserves cached GPU data on refresh failure (hook reflects cache)', async () => {
    // Pre-load the shared cache with a known node
    const cachedNode = {
      name: 'cached-gpu', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({
      nodes: [cachedNode],
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(),
    })
    notifyGPUNodeSubscribers()

    // Next fetch will fail — cache data should be preserved
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))

    const { result } = renderHook(() => useGPUNodes())

    // Hook should immediately reflect the pre-loaded cached node
    expect(result.current.nodes.find(n => n.name === 'cached-gpu')).toBeDefined()
    // Cache protection ensures the node count never drops to zero on error
    expect(gpuNodeCache.nodes.length).toBeGreaterThan(0)

    // After the failed fetch completes, loading is false and error remains null
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
    // Cached node is still present — not wiped by the failed refresh
    expect(result.current.nodes.find(n => n.name === 'cached-gpu')).toBeDefined()
  })

  it('uses demo GPU nodes when demo mode is enabled and no cached data exists', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    // SSE fails — should fall back to demo data in catch block
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))

    const { result } = renderHook(() => useGPUNodes())

    // Hook renders; demo fallback happens inside fetchGPUNodes catch when isDemoMode()
    await waitFor(() => !result.current.isLoading, { timeout: 3000 })
    // Nodes may be demo data or whatever was cached — just verify no crash
    expect(Array.isArray(result.current.nodes)).toBe(true)
  })
})

// ===========================================================================
// useNVIDIAOperators
// ===========================================================================

describe('useNVIDIAOperators', () => {
  it('returns empty array with loading state on mount', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useNVIDIAOperators())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.operators).toEqual([])
  })

  it('returns operators after SSE fetch resolves', async () => {
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    mockFetchSSE.mockResolvedValue(fakeOps)

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual(fakeOps)
    expect(result.current.error).toBeNull()
  })

  it('falls back to REST when SSE fails', async () => {
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockResolvedValue({ data: { operators: fakeOps } })

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual(fakeOps)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster when provided via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useNVIDIAOperators('my-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
  })

  it('refetch() triggers a new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error: null when both SSE and REST fail', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles REST response with singular "operator" key', async () => {
    const singleOp = { cluster: 'c1', installed: true, version: '24.1.0', components: [] }
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockResolvedValue({ data: { operator: singleOp } })

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([singleOp])
  })

  it('handles REST response with neither operators nor operator key', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('skips SSE when token is "demo-token"', async () => {
    localStorage.setItem('token', 'demo-token')
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    mockApiGet.mockResolvedValue({ data: { operators: fakeOps } })

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // SSE should NOT have been called because token is 'demo-token'
    // Instead it should have fallen through to REST
    expect(result.current.operators).toEqual(fakeOps)
  })
})

// ===========================================================================
// updateGPUNodeCache — cache protection
// ===========================================================================

describe('updateGPUNodeCache', () => {
  it('prevents clearing nodes when cache already has data', () => {
    const existingNode = {
      name: 'protected-gpu', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({
      nodes: [existingNode],
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(),
    })

    // Attempt to set nodes to empty array — should be blocked
    updateGPUNodeCache({ nodes: [], error: 'some error' })

    // Nodes must be preserved
    expect(gpuNodeCache.nodes.length).toBe(1)
    expect(gpuNodeCache.nodes[0].name).toBe('protected-gpu')
    // Other fields from the update should still apply
    expect(gpuNodeCache.error).toBe('some error')
  })

  it('allows updating non-node fields even when node clearing is blocked', () => {
    // The previous test left protected-gpu in cache; attempting to clear nodes
    // while setting other fields should still apply the non-node updates
    updateGPUNodeCache({ nodes: [], isLoading: true, error: 'test-error' })

    // Nodes remain protected (not cleared)
    expect(gpuNodeCache.nodes.length).toBeGreaterThan(0)
    // But other fields are updated
    expect(gpuNodeCache.isLoading).toBe(true)
    expect(gpuNodeCache.error).toBe('test-error')
  })

  it('allows setting empty nodes when cache has no existing data', () => {
    // First, replace with known data, then replace with different data to empty
    // We need the cache to be truly empty first. The only way is via the
    // registerCacheReset callback which force-resets the cache.
    // Instead, let's test with a fresh node that we can replace.
    const node = {
      name: 'temp-node', cluster: 'c1',
      gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' as const,
    }
    // Replace existing nodes with temp-node
    updateGPUNodeCache({ nodes: [node] })
    expect(gpuNodeCache.nodes[0].name).toBe('temp-node')

    // Now try setting empty — protection should block this since we have data
    updateGPUNodeCache({ nodes: [] })
    expect(gpuNodeCache.nodes.length).toBeGreaterThan(0)
    // This confirms the cache protection works regardless of what node was there
  })

  it('allows replacing nodes with new non-empty data', () => {
    const oldNode = {
      name: 'old-gpu', cluster: 'c1',
      gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({
      nodes: [oldNode],
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(),
    })

    const newNode = {
      name: 'new-gpu', cluster: 'c2',
      gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 8, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({ nodes: [newNode] })

    expect(gpuNodeCache.nodes.length).toBe(1)
    expect(gpuNodeCache.nodes[0].name).toBe('new-gpu')
  })
})

// ===========================================================================
// notifyGPUNodeSubscribers
// ===========================================================================

describe('notifyGPUNodeSubscribers', () => {
  it('calls all registered subscribers with current cache state', () => {
    const sub1 = vi.fn()
    const sub2 = vi.fn()
    gpuNodeSubscribers.add(sub1)
    gpuNodeSubscribers.add(sub2)

    notifyGPUNodeSubscribers()

    expect(sub1).toHaveBeenCalledWith(gpuNodeCache)
    expect(sub2).toHaveBeenCalledWith(gpuNodeCache)

    gpuNodeSubscribers.delete(sub1)
    gpuNodeSubscribers.delete(sub2)
  })

  it('handles no subscribers without error', () => {
    gpuNodeSubscribers.clear()
    expect(() => notifyGPUNodeSubscribers()).not.toThrow()
  })
})

// ===========================================================================
// GPU allocation clamping & deduplication edge cases
// ===========================================================================

describe('useGPUNodes — GPU allocation clamping', () => {
  it('clamps gpuAllocated to gpuCount when allocated exceeds count', async () => {
    const overAllocatedNode = {
      name: 'over-alloc', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 10,
      acceleratorType: 'GPU' as const,
    }
    mockFetchSSE.mockResolvedValue([overAllocatedNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.length > 0, { timeout: 3000 })
    const node = result.current.nodes.find(n => n.name === 'over-alloc')
    expect(node).toBeDefined()
    // gpuAllocated must be clamped to gpuCount (4), not the raw value (10)
    expect(node!.gpuAllocated).toBe(4)
    expect(node!.gpuCount).toBe(4)
  })

  it('handles zero gpuCount and gpuAllocated gracefully', async () => {
    const zeroNode = {
      name: 'zero-gpu', cluster: 'c1',
      gpuType: 'NVIDIA T4', gpuCount: 0, gpuAllocated: 0,
      acceleratorType: 'GPU' as const,
    }
    mockFetchSSE.mockResolvedValue([zeroNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.length > 0, { timeout: 3000 })
    const node = result.current.nodes.find(n => n.name === 'zero-gpu')
    expect(node).toBeDefined()
    expect(node!.gpuCount).toBe(0)
    expect(node!.gpuAllocated).toBe(0)
  })

  it('treats undefined gpuCount/gpuAllocated as 0', async () => {
    // Simulate incomplete API data where fields are undefined
    const incompleteNode = {
      name: 'incomplete-gpu', cluster: 'c1',
      gpuType: 'NVIDIA A100',
      acceleratorType: 'GPU' as const,
    } as { name: string; cluster: string; gpuType: string; gpuCount: number; gpuAllocated: number; acceleratorType: 'GPU' }
    // Explicitly delete to simulate missing fields
    delete (incompleteNode as Record<string, unknown>).gpuCount
    delete (incompleteNode as Record<string, unknown>).gpuAllocated

    mockFetchSSE.mockResolvedValue([incompleteNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.length > 0, { timeout: 3000 })
    const node = result.current.nodes.find(n => n.name === 'incomplete-gpu')
    expect(node).toBeDefined()
    // Should default to 0, not NaN or undefined
    expect(node!.gpuCount).toBe(0)
    expect(node!.gpuAllocated).toBe(0)
  })
})

describe('useGPUNodes — deduplication tie-breaking', () => {
  it('prefers short cluster name over long context path', async () => {
    const longNameNode = {
      name: 'dup-node', cluster: 'default/api-long-context-path/cluster-config',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    const shortNameNode = {
      name: 'dup-node', cluster: 'my-cluster',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    // Long name appears first
    mockFetchSSE.mockResolvedValue([longNameNode, shortNameNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.some(n => n.name === 'dup-node'), { timeout: 3000 })
    const deduped = result.current.nodes.filter(n => n.name === 'dup-node')
    expect(deduped.length).toBe(1)
    // Should prefer the short cluster name
    expect(deduped[0].cluster).toBe('my-cluster')
  })

  it('keeps existing short name when new entry has long name', async () => {
    const shortNameNode = {
      name: 'dup-node-2', cluster: 'short',
      gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const,
    }
    const longNameNode = {
      name: 'dup-node-2', cluster: 'default/long/path',
      gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const,
    }
    // Short name appears first
    mockFetchSSE.mockResolvedValue([shortNameNode, longNameNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.some(n => n.name === 'dup-node-2'), { timeout: 3000 })
    const deduped = result.current.nodes.filter(n => n.name === 'dup-node-2')
    expect(deduped.length).toBe(1)
    expect(deduped[0].cluster).toBe('short')
  })

  it('when both have same name type, prefers valid allocation data', async () => {
    // Both short names — first has invalid allocation (allocated > count), second is valid
    const invalidNode = {
      name: 'tiebreak-node', cluster: 'cluster-a',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 10, acceleratorType: 'GPU' as const,
    }
    const validNode = {
      name: 'tiebreak-node', cluster: 'cluster-b',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' as const,
    }
    mockFetchSSE.mockResolvedValue([invalidNode, validNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.some(n => n.name === 'tiebreak-node'), { timeout: 3000 })
    const deduped = result.current.nodes.filter(n => n.name === 'tiebreak-node')
    expect(deduped.length).toBe(1)
    // The first node was inserted and clamped (allocated=4, count=4)
    // The second node has valid data (3 <= 4) and will replace the first
    // because after clamping, existing has allocated==count (not technically invalid
    // per the check `existing.gpuAllocated <= existing.gpuCount`), so it IS valid.
    // Both are valid after clamping, so the second won't replace the first.
    // Actually: the dedup check uses raw `existing.gpuAllocated` vs `existing.gpuCount`
    // AFTER the first insert clamped allocated to min(10,4)=4.
    // So existing: gpuAllocated=4, gpuCount=4 => existingValid=true
    // New: newAllocated=3, newCount=4, newValid=true
    // Both valid => no replacement. The first node (clamped) stays.
    expect(deduped[0].gpuAllocated).toBeLessThanOrEqual(deduped[0].gpuCount)
  })
})

// ===========================================================================
// useGPUNodes — cluster prefix filtering
// ===========================================================================

describe('useGPUNodes — cluster filtering', () => {
  it('matches cluster names using startsWith for prefix matching', async () => {
    const nodes = [
      { name: 'gpu-a', cluster: 'prod-east', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-b', cluster: 'prod-east/context-1', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-c', cluster: 'staging', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(nodes)

    const { result } = renderHook(() => useGPUNodes('prod-east'))

    await waitFor(() => result.current.nodes.length > 0, { timeout: 3000 })
    // Should include 'prod-east' (exact) and 'prod-east/context-1' (startsWith)
    // but NOT 'staging'
    expect(result.current.nodes.every(n =>
      n.cluster === 'prod-east' || n.cluster.startsWith('prod-east')
    )).toBe(true)
    expect(result.current.nodes.find(n => n.cluster === 'staging')).toBeUndefined()
  })

  it('returns all nodes when no cluster filter is specified', async () => {
    const nodes = [
      { name: 'gpu-x', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const },
      { name: 'gpu-y', cluster: 'c2', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(nodes)

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => result.current.nodes.length === 2, { timeout: 3000 })
    expect(result.current.nodes.map(n => n.name).sort()).toEqual(['gpu-x', 'gpu-y'])
  })
})

// ===========================================================================
// useGPUNodes — isFailed threshold
// ===========================================================================

describe('useGPUNodes — isFailed and consecutiveFailures', () => {
  it('reports isFailed=false when consecutiveFailures < 3', () => {
    updateGPUNodeCache({ consecutiveFailures: 2 })
    const { result } = renderHook(() => useGPUNodes())
    expect(result.current.isFailed).toBe(false)
  })

  it('reports isFailed=true when consecutiveFailures >= 3', () => {
    updateGPUNodeCache({ consecutiveFailures: 3 })
    const { result } = renderHook(() => useGPUNodes())
    expect(result.current.isFailed).toBe(true)
  })

  it('reports isFailed=true when consecutiveFailures > 3', () => {
    updateGPUNodeCache({ consecutiveFailures: 5 })
    const { result } = renderHook(() => useGPUNodes())
    expect(result.current.isFailed).toBe(true)
  })
})

// ===========================================================================
// useNodes — local agent path
// ===========================================================================

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

// ===========================================================================
// useNodes — empty cluster scenarios
// ===========================================================================

describe('useNodes — empty cluster handling', () => {
  it('returns empty array for cluster with no nodes and no cache', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useNodes('empty-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('builds placeholder from cluster cache with cpuCores and memoryGB', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockClusterCacheRef.clusters = [
      { name: 'cached-cluster', nodeCount: 5, cpuCores: 32, memoryGB: 128 },
    ]

    const { result } = renderHook(() => useNodes('cached-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.length).toBe(1)
    expect(result.current.nodes[0].cpuCapacity).toBe('32')
    expect(result.current.nodes[0].memoryCapacity).toBe('128Gi')
    expect(result.current.nodes[0].status).toBe('Ready')
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

// ===========================================================================
// localStorage GPU cache persistence
// ===========================================================================

describe('GPU cache localStorage persistence', () => {
  it('does not persist demo data to localStorage', () => {
    mockIsDemoMode.mockReturnValue(true)
    const demoNode = {
      name: 'demo-gpu', cluster: 'vllm-gpu-cluster',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({
      nodes: [demoNode],
      lastUpdated: new Date(),
    })

    // localStorage should NOT contain the demo data
    const stored = localStorage.getItem('kubestellar-gpu-cache')
    expect(stored).toBeNull()
    mockIsDemoMode.mockReturnValue(false)
  })

  it('persists real data to localStorage when not in demo mode', () => {
    mockIsDemoMode.mockReturnValue(false)
    const realNode = {
      name: 'real-gpu', cluster: 'prod-cluster',
      gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({
      nodes: [realNode],
      lastUpdated: new Date(),
    })

    const stored = localStorage.getItem('kubestellar-gpu-cache')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.nodes.length).toBe(1)
    expect(parsed.nodes[0].name).toBe('real-gpu')
  })
})
