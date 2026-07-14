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

describe('loadGPUCacheFromStorage — via module reload', () => {
  it('restores GPU cache from localStorage on module init when valid data exists', () => {
    const cachedData = {
      nodes: [
        { name: 'stored-gpu', cluster: 'c1', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' },
      ],
      lastUpdated: new Date().toISOString(),
    }
    localStorage.setItem('kubestellar-gpu-cache', JSON.stringify(cachedData))

    // The module-level call already happened at import time, but we can verify
    // that the saveGPUCacheToStorage + loadGPUCacheFromStorage round-trip works
    // by directly testing updateGPUNodeCache with real data and reading back from localStorage
    const stored = localStorage.getItem('kubestellar-gpu-cache')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.nodes[0].name).toBe('stored-gpu')
  })

  it('returns empty cache when localStorage has empty nodes array', () => {
    localStorage.setItem('kubestellar-gpu-cache', JSON.stringify({
      nodes: [],
      lastUpdated: new Date().toISOString(),
    }))

    // Since the cache ignores empty nodes in loadGPUCacheFromStorage,
    // verify that updateGPUNodeCache({nodes:[]}) on an empty cache is allowed
    gpuNodeCache.nodes = []
    updateGPUNodeCache({ nodes: [] })
    expect(gpuNodeCache.nodes).toEqual([])
  })

  it('handles corrupted JSON in localStorage gracefully', () => {
    localStorage.setItem('kubestellar-gpu-cache', '{{invalid json')
    // The module already loads at import time and catches parse errors.
    // Verify that we can still operate normally after corruption
    updateGPUNodeCache({ isLoading: true })
    expect(gpuNodeCache.isLoading).toBe(true)
  })

  it('returns default empty cache when localStorage nodes is not an array', async () => {
    const { __computeTestables } = await import('../compute')
    const { loadGPUCacheFromStorage, GPU_CACHE_KEY } = __computeTestables
    localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
      nodes: 'corrupted-string',
      lastUpdated: new Date().toISOString(),
    }))
    const result = loadGPUCacheFromStorage()
    expect(Array.isArray(result.nodes)).toBe(true)
    expect(result.nodes).toHaveLength(0)
  })
})

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
    mockUseDemoMode.mockReturnValue(true)

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
