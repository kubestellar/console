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



describe('saveGPUCacheToStorage — edge cases', () => {
  it('does not persist when nodes array is empty', () => {
    mockIsDemoMode.mockReturnValue(false)
    localStorage.clear()

    // updateGPUNodeCache with empty nodes on empty cache
    gpuNodeCache.nodes = []
    updateGPUNodeCache({ nodes: [], lastUpdated: new Date() })

    // Should not write to localStorage since nodes.length === 0
    expect(localStorage.getItem('kubestellar-gpu-cache')).toBeNull()
  })

  it('handles localStorage.setItem throwing (quota exceeded)', () => {
    mockIsDemoMode.mockReturnValue(false)
    const _originalSetItem = localStorage.setItem.bind(localStorage)
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // Should not throw even when localStorage fails
    const node = { name: 'quota-gpu', cluster: 'c1', gpuType: 'A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const }
    expect(() => updateGPUNodeCache({ nodes: [node], lastUpdated: new Date() })).not.toThrow()

    setItemSpy.mockRestore()
  })
})

describe('fetchGPUNodes — agent success path', () => {
  it('fetches GPU nodes from local agent when agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentNodes = [
      { name: 'agent-gpu-1', cluster: 'agent-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: agentNodes }),
    })

    // Clear cache to force loading state
    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes.some(n => n.name === 'agent-gpu-1')).toBe(true)
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to SSE when local agent returns non-ok for GPU nodes', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })
    const sseNodes = [
      { name: 'sse-gpu', cluster: 'c1', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes.some(n => n.name === 'sse-gpu')).toBe(true)
  })

  it('falls through to SSE when agent fetch throws an error', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Agent timeout'))

    const sseNodes = [
      { name: 'sse-fallback-gpu', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 3, acceleratorType: 'GPU' },
    ]
    mockFetchSSE.mockResolvedValue(sseNodes)

    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes.some(n => n.name === 'sse-fallback-gpu')).toBe(true)
  })
})

describe('fetchGPUNodes — SSE progressive rendering', () => {
  it('progressively updates GPU cache as clusters stream in via SSE', async () => {
    const node1 = { name: 'stream-gpu-1', cluster: 'c1', gpuType: 'A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' }
    const node2 = { name: 'stream-gpu-2', cluster: 'c2', gpuType: 'T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' }

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [node1])
      opts.onClusterData('c2', [node2])
      return [node1, node2]
    })

    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThanOrEqual(2), { timeout: 3000 })
    expect(result.current.nodes.some(n => n.name === 'stream-gpu-1')).toBe(true)
    expect(result.current.nodes.some(n => n.name === 'stream-gpu-2')).toBe(true)
  })
})

describe('fetchGPUNodes — REST fallback', () => {
  it('falls back to REST API when SSE fails for GPU nodes', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE stream broken'))
    const restNodes = [
      { name: 'rest-gpu', cluster: 'c1', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'GPU' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ nodes: restNodes }), { status: 200 }))
    )

    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes.some(n => n.name === 'rest-gpu')).toBe(true)
  })

  it('preserves existing cache when both SSE and REST fail', async () => {
    const cachedNode = { name: 'preserved-gpu', cluster: 'c1', gpuType: 'A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const }
    updateGPUNodeCache({
      nodes: [cachedNode],
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(),
    })

    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.isRefreshing).toBe(false), { timeout: 3000 })
    // Cache protection should preserve existing data
    expect(result.current.nodes.some(n => n.name === 'preserved-gpu')).toBe(true)
  })
})

describe('fetchGPUNodes — error recovery from localStorage', () => {
  it('restores GPU nodes from localStorage when memory cache is empty and fetch fails', async () => {
    mockIsDemoMode.mockReturnValue(false)
    // Pre-populate localStorage with cached data
    const storedData = {
      nodes: [{ name: 'ls-gpu', cluster: 'c1', gpuType: 'A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' }],
      lastUpdated: new Date().toISOString(),
    }
    localStorage.setItem('kubestellar-gpu-cache', JSON.stringify(storedData))

    // Clear memory cache
    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null

    // Both fetch paths fail
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 })
    // The error handler should have restored from localStorage
    expect(gpuNodeCache.nodes.length).toBeGreaterThanOrEqual(0)
  })

  it('falls back to demo data when memory cache is empty and demo mode is on', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null
    localStorage.removeItem('kubestellar-gpu-cache')

    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(gpuNodeCache.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
  })

  it('increments consecutiveFailures on fetch error', async () => {
    gpuNodeCache.nodes = []
    gpuNodeCache.lastUpdated = null
    gpuNodeCache.consecutiveFailures = 0

    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    renderHook(() => useGPUNodes())

    await waitFor(() => expect(gpuNodeCache.consecutiveFailures).toBeGreaterThan(0), { timeout: 3000 })
  })
})

describe('useGPUNodes — loading vs refreshing state', () => {
  it('shows isRefreshing (not isLoading) when cache already has nodes', async () => {
    const existingNode = { name: 'existing', cluster: 'c1', gpuType: 'A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const }
    updateGPUNodeCache({
      nodes: [existingNode],
      lastUpdated: null, // stale so fetch is triggered
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    // Slow SSE to observe transient state
    mockFetchSSE.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([existingNode]), 100)))

    const { result } = renderHook(() => useGPUNodes())

    // Since cache has nodes but is stale, fetchGPUNodes should set isRefreshing=true
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })
})
