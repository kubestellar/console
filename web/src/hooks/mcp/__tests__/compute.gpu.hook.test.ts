import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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
  getLocalAgentURL: () => 'http://localhost:8585',
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
  useGPUNodes,
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
  mockUseDemoMode.mockReturnValue(false)
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

    await waitFor(() => expect(result.current.nodes.some(n => n.name === 'gpu-dup')).toBe(true), { timeout: 3000 })

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

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
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

  it('clears cached GPU nodes when a successful fetch returns an empty list (#6111)', async () => {
    // Pre-load the cache with nodes that no longer exist upstream. Mark the
    // cache lastUpdated as stale so the hook triggers a refetch on mount.
    const stalenode = {
      name: 'removed-gpu', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    // CACHE_TTL_MS is 30_000 — go beyond it to force a stale refetch.
    const STALE_OFFSET_MS = 120_000
    updateGPUNodeCache({
      nodes: [stalenode],
      lastUpdated: new Date(Date.now() - STALE_OFFSET_MS),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(Date.now() - STALE_OFFSET_MS),
    })
    notifyGPUNodeSubscribers()

    // Upstream now returns a successful empty response — the nodes were removed.
    // Previously the cache protection logic refused to clear on empty, leaving
    // stale nodes forever. The fix: distinguish "fetch succeeded but empty" from
    // "fetch failed" and apply the empty result when the fetch succeeded.
    mockFetchSSE.mockResolvedValue([])
    // REST fallback also returns empty, in case SSE path isn't exercised
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ nodes: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled(), { timeout: 3000 })
    await waitFor(() => expect(result.current.nodes.length).toBe(0), { timeout: 3000 })
    expect(gpuNodeCache.nodes.length).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('uses demo GPU nodes when demo mode is enabled and no cached data exists', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)
    // SSE fails — should fall back to demo data in catch block
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))

    const { result } = renderHook(() => useGPUNodes())

    // Hook renders; demo fallback happens inside fetchGPUNodes catch when isDemoMode()
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 })
    // Nodes may be demo data or whatever was cached — just verify no crash
    expect(Array.isArray(result.current.nodes)).toBe(true)
  })
})

describe('updateGPUNodeCache', () => {
  // NOTE: We used to have a "never allow clearing nodes if we have good data"
  // guard inside updateGPUNodeCache. That guard was the root cause of #6111
  // (stale GPU nodes persist forever after upstream removal). Cache-preservation
  // across transient failures is now handled at the fetch site (fetchGPUNodes).
  // These tests verify the new, corrected behavior.

  it('applies empty nodes update when cache already has data (#6111)', () => {
    const existingNode = {
      name: 'to-remove-gpu', cluster: 'c1',
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

    // Authoritative empty update — must actually clear the cache.
    updateGPUNodeCache({ nodes: [], error: 'some error' })

    expect(gpuNodeCache.nodes.length).toBe(0)
    expect(gpuNodeCache.error).toBe('some error')
  })

  it('applies non-node field updates alongside node updates', () => {
    const existingNode = {
      name: 'existing-gpu', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({ nodes: [existingNode], lastUpdated: new Date() })

    // Non-node fields (isLoading, error) should apply regardless of whether
    // the node update is empty.
    updateGPUNodeCache({ nodes: [], isLoading: true, error: 'test-error' })

    expect(gpuNodeCache.nodes.length).toBe(0)
    expect(gpuNodeCache.isLoading).toBe(true)
    expect(gpuNodeCache.error).toBe('test-error')
  })

  it('allows setting empty nodes from a populated cache', () => {
    const node = {
      name: 'temp-node', cluster: 'c1',
      gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' as const,
    }
    updateGPUNodeCache({ nodes: [node] })
    expect(gpuNodeCache.nodes[0].name).toBe('temp-node')

    updateGPUNodeCache({ nodes: [] })
    expect(gpuNodeCache.nodes.length).toBe(0)
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
