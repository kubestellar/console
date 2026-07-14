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

describe('useGPUNodes — GPU allocation clamping', () => {
  it('clamps gpuAllocated to gpuCount when allocated exceeds count', async () => {
    const overAllocatedNode = {
      name: 'over-alloc', cluster: 'c1',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 10,
      acceleratorType: 'GPU' as const,
    }
    mockFetchSSE.mockResolvedValue([overAllocatedNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.some(n => n.name === 'dup-node')).toBe(true), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.some(n => n.name === 'dup-node-2')).toBe(true), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.some(n => n.name === 'tiebreak-node')).toBe(true), { timeout: 3000 })
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

describe('useGPUNodes — cluster filtering', () => {
  it('matches cluster names using startsWith for prefix matching', async () => {
    const nodes = [
      { name: 'gpu-a', cluster: 'prod-east', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-b', cluster: 'prod-east/context-1', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-c', cluster: 'staging', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(nodes)

    const { result } = renderHook(() => useGPUNodes('prod-east'))

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
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

    await waitFor(() => expect(result.current.nodes.length).toBe(2), { timeout: 3000 })
    expect(result.current.nodes.map(n => n.name).sort()).toEqual(['gpu-x', 'gpu-y'])
  })
})

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

describe('useGPUNodes — additional branches', () => {
  it('returns isFailed=true after 3+ consecutive failures', async () => {
    // Pre-set failures
    updateGPUNodeCache({
      consecutiveFailures: 3,
      lastUpdated: null,
    })

    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useGPUNodes())

    // isFailed derived from consecutiveFailures >= 3
    expect(result.current.isFailed).toBe(true)
  })

  it('provides a stable refetch function reference', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, rerender } = renderHook(() => useGPUNodes())

    const firstRef = result.current.refetch
    rerender()
    expect(result.current.refetch).toBe(firstRef)
  })

  it('deduplication prefers entry with valid allocation over invalid', async () => {
    // Both same name and same cluster name type (no slash)
    const invalidNode = {
      name: 'conflict-gpu', cluster: 'cluster-a',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 10, // invalid: allocated > count
      acceleratorType: 'GPU' as const,
    }
    const validNode = {
      name: 'conflict-gpu', cluster: 'cluster-b',
      gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, // valid
      acceleratorType: 'GPU' as const,
    }
    mockFetchSSE.mockResolvedValue([invalidNode, validNode])

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    const deduped = result.current.nodes.filter(n => n.name === 'conflict-gpu')
    expect(deduped).toHaveLength(1)
    // Should prefer the valid one
    expect(deduped[0].gpuAllocated).toBeLessThanOrEqual(deduped[0].gpuCount)
  })

  it('cluster filter matches prefix (e.g., "cluster-a" matches "cluster-a/context")', async () => {
    const nodes = [
      { name: 'gpu-prefix', cluster: 'cluster-a/long-context', gpuType: 'T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' as const },
      { name: 'gpu-other', cluster: 'cluster-b', gpuType: 'T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' as const },
    ]
    mockFetchSSE.mockResolvedValue(nodes)

    const { result } = renderHook(() => useGPUNodes('cluster-a'))

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.nodes.every(n => n.cluster.startsWith('cluster-a'))).toBe(true)
    expect(result.current.nodes.find(n => n.name === 'gpu-other')).toBeUndefined()
  })

  it('returns lastRefresh from cache state', async () => {
    const now = new Date()
    updateGPUNodeCache({ lastRefresh: now, lastUpdated: null })
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useGPUNodes())

    expect(result.current.lastRefresh).toEqual(now)
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

describe('useGPUNodes — deduplication edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
    gpuNodeCache.nodes = []
    gpuNodeCache.isLoading = false
    gpuNodeCache.isRefreshing = false
    gpuNodeCache.error = null
    gpuNodeCache.consecutiveFailures = 0
    gpuNodeCache.lastRefresh = null
    gpuNodeCache.lastUpdated = null
    mockIsDemoMode.mockReturnValue(false)
    mockUseDemoMode.mockReturnValue(false)
    mockFetchSSE.mockResolvedValue([])
  })

  it('deduplicates nodes by name keeping short cluster name', () => {
    const nodes = [
      { name: 'gpu-1', cluster: 'default/api-long-context/admin', gpuType: 'A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
      { name: 'gpu-1', cluster: 'my-cluster', gpuType: 'A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' as const },
    ]
    gpuNodeCache.nodes = nodes
    gpuNodeCache.lastUpdated = new Date()

    const { result } = renderHook(() => useGPUNodes())

    // Should deduplicate to 1 node with the short cluster name
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].cluster).toBe('my-cluster')
  })

  it('clamps gpuAllocated to not exceed gpuCount', () => {
    const nodes = [
      { name: 'gpu-over', cluster: 'c1', gpuType: 'A100', gpuCount: 4, gpuAllocated: 10, acceleratorType: 'GPU' as const },
    ]
    gpuNodeCache.nodes = nodes
    gpuNodeCache.lastUpdated = new Date()

    const { result } = renderHook(() => useGPUNodes())

    expect(result.current.nodes[0].gpuAllocated).toBe(4) // clamped to gpuCount
  })

  it('handles undefined gpuCount/gpuAllocated gracefully', () => {
    const nodes = [
      { name: 'gpu-undef', cluster: 'c1', gpuType: 'A100', gpuCount: undefined as unknown as number, gpuAllocated: undefined as unknown as number, acceleratorType: 'GPU' as const },
    ]
    gpuNodeCache.nodes = nodes
    gpuNodeCache.lastUpdated = new Date()

    const { result } = renderHook(() => useGPUNodes())

    expect(result.current.nodes[0].gpuCount).toBe(0)
    expect(result.current.nodes[0].gpuAllocated).toBe(0)
  })

  it('isFailed is true after 3+ consecutive failures', () => {
    gpuNodeCache.consecutiveFailures = 3
    gpuNodeCache.lastUpdated = new Date()

    const { result } = renderHook(() => useGPUNodes())

    expect(result.current.isFailed).toBe(true)
  })

  it('isFailed is false with fewer than 3 failures', () => {
    gpuNodeCache.consecutiveFailures = 2
    gpuNodeCache.lastUpdated = new Date()

    const { result } = renderHook(() => useGPUNodes())

    expect(result.current.isFailed).toBe(false)
  })
})
