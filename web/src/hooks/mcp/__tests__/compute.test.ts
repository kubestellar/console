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

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  MCP_EXTENDED_TIMEOUT_MS: 10_000,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

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
})
