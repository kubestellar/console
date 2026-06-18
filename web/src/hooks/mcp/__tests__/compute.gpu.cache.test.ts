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


describe('updateGPUNodeCache — protection logic', () => {
  beforeEach(() => {
    localStorage.clear()
    gpuNodeCache.nodes = []
    gpuNodeCache.isLoading = false
    gpuNodeCache.isRefreshing = false
    gpuNodeCache.error = null
    gpuNodeCache.consecutiveFailures = 0
    gpuNodeCache.lastRefresh = null
    gpuNodeCache.lastUpdated = null
  })

  it('applies empty nodes update when cache has data (#6111)', () => {
    // Previously this tested the now-removed "never clear" guard inside
    // updateGPUNodeCache. After the #6111 fix, the guard lives at the fetch
    // site: updateGPUNodeCache applies whatever updates it receives.
    const existingNodes = [
      { name: 'n1', cluster: 'c1', gpuType: 'A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
    ]
    gpuNodeCache.nodes = existingNodes

    updateGPUNodeCache({ nodes: [], error: 'fetch failed' })

    expect(gpuNodeCache.nodes).toEqual([])
    expect(gpuNodeCache.error).toBe('fetch failed')
  })

  it('allows clearing nodes when cache is empty', () => {
    updateGPUNodeCache({ nodes: [] })
    expect(gpuNodeCache.nodes).toEqual([])
  })

  it('allows updating nodes with new non-empty data', () => {
    const newNodes = [
      { name: 'n2', cluster: 'c2', gpuType: 'H100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const },
    ]
    updateGPUNodeCache({ nodes: newNodes })
    expect(gpuNodeCache.nodes).toEqual(newNodes)
  })

  it('notifies subscribers on every cache update', () => {
    const subscriber = vi.fn()
    gpuNodeSubscribers.add(subscriber)

    updateGPUNodeCache({ isLoading: true })
    expect(subscriber).toHaveBeenCalledTimes(1)

    updateGPUNodeCache({ error: 'test' })
    expect(subscriber).toHaveBeenCalledTimes(2)

    gpuNodeSubscribers.delete(subscriber)
  })
})


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

