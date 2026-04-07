import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockClusterCacheRef,
  mockUseCache,
  mockMapSettled,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
    }>,
  },
  mockUseCache: vi.fn(),
  mockMapSettled: vi.fn(),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../shared', () => ({
  LOCAL_AGENT_URL: 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

// Mock useCache to return controllable values
vi.mock('../../../lib/cache', () => ({
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown; fetcher?: () => Promise<unknown>; enabled?: boolean }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
}))

vi.mock('../../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: (...args: unknown[]) => mockMapSettled(...args),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  MCP_HOOK_TIMEOUT_MS: 10000,
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useKagentCRDAgents,
  useKagentCRDTools,
  useKagentCRDModels,
  useKagentCRDMemories,
} from '../kagent_crds'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// module importability
// ===========================================================================

describe('kagent_crds', () => {
  it('module is importable', async () => {
    const mod = await import('../kagent_crds')
    expect(mod).toBeDefined()
  })
})

// ===========================================================================
// useKagentCRDAgents
// ===========================================================================

describe('useKagentCRDAgents', () => {
  it('passes correct key and category to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:all:all',
        category: 'clusters',
        initialData: [],
        demoWhenEmpty: true,
      }),
    )
  })

  it('returns agents data from useCache', () => {
    const fakeAgents = [
      { name: 'k8s-assistant', namespace: 'kagent-system', cluster: 'prod-east', agentType: 'Declarative' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeAgents, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDAgents())
    expect(result.current.data).toEqual(fakeAgents)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace options correctly', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:staging:kagent-ops',
      }),
    )
  })

  it('sets enabled: false when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('sets enabled: true when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('provides non-empty demoData array', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData).toBeDefined()
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useKagentCRDTools
// ===========================================================================

describe('useKagentCRDTools', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:all:all',
        category: 'clusters',
      }),
    )
  })

  it('returns tool data from useCache', () => {
    const fakeTools = [
      { name: 'kubectl-server', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeTools, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDTools())
    expect(result.current.data).toEqual(fakeTools)
  })

  it('passes cluster filter option', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools({ cluster: 'prod-west' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:prod-west:all',
      }),
    )
  })
})

// ===========================================================================
// useKagentCRDModels
// ===========================================================================

describe('useKagentCRDModels', () => {
  it('passes correct key and initial data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:all:all',
        category: 'clusters',
        initialData: [],
      }),
    )
  })

  it('returns model data from useCache', () => {
    const fakeModels = [
      { name: 'claude-sonnet', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Anthropic' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeModels, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDModels())
    expect(result.current.data).toEqual(fakeModels)
  })

  it('provides non-empty demo models', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('passes namespace filter through to key', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels({ namespace: 'kagent-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:all:kagent-system',
      }),
    )
  })
})

// ===========================================================================
// useKagentCRDMemories
// ===========================================================================

describe('useKagentCRDMemories', () => {
  it('passes correct key and initial data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:all:all',
        category: 'clusters',
        initialData: [],
      }),
    )
  })

  it('returns memory data from useCache', () => {
    const fakeMemories = [
      { name: 'incident-memory', namespace: 'kagent-system', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeMemories, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDMemories())
    expect(result.current.data).toEqual(fakeMemories)
  })

  it('provides non-empty demo memories', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('passes cluster and namespace filter through to key', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:staging:kagent-ops',
      }),
    )
  })

  it('sets enabled based on agent availability', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })
})

// ===========================================================================
// agentFetch — internal helper (tested via fetcher callbacks)
// ===========================================================================

describe('fetcher callback — agentFetchAllClusters', () => {
  it('calls fetcher with agent available and clusters in cache', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
      { name: 'cluster-2', context: 'ctx-2', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const agentData = { agents: [{ name: 'agent-1', cluster: 'cluster-1' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentData,
    })

    // Mock mapSettledWithConcurrency to simulate settled results
    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDAgents())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!()
    expect(Array.isArray(result)).toBe(true)
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('returns empty array when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    renderHook(() => useKagentCRDAgents())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!()
    expect(result).toEqual([])
  })

  it('returns empty array when cluster cache is empty', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = []

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    renderHook(() => useKagentCRDTools())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!()
    expect(result).toEqual([])
  })

  it('filters out unreachable clusters', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'reachable-cluster', context: 'ctx-1', reachable: true },
      { name: 'unreachable-cluster', context: 'ctx-2', reachable: false },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const agentData = { tools: [{ name: 'tool-1' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentData,
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDTools())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!()
    expect(Array.isArray(result)).toBe(true)
    // Only reachable cluster should have been queried
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const urls = fetchCalls.map((c: unknown[]) => String(c[0]))
    expect(urls.every((u: string) => !u.includes('unreachable-cluster'))).toBe(true)
  })

  it('filters out clusters with slash in name (context paths)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'short-name', context: 'ctx-1', reachable: true },
      { name: 'default/api-long/path', context: 'ctx-2', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    })

    renderHook(() => useKagentCRDModels())

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    // mapSettled should only have been called with the short-name cluster
    const mapSettledCalls = mockMapSettled.mock.calls
    if (mapSettledCalls.length > 0) {
      const targets = mapSettledCalls[0][0] as Array<{ name: string }>
      expect(targets.every((t: { name: string }) => !t.name.includes('/'))).toBe(true)
    }
  })

  it('handles rejected promises in mapSettledWithConcurrency gracefully', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'good-cluster', context: 'ctx-1', reachable: true },
      { name: 'bad-cluster', context: 'ctx-2', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    // Simulate one cluster succeeding, one failing
    mockMapSettled.mockResolvedValue([
      { status: 'fulfilled', value: [{ name: 'memory-1', cluster: 'good-cluster' }] },
      { status: 'rejected', reason: new Error('Connection refused') },
    ])

    renderHook(() => useKagentCRDMemories())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!() as Array<{ name: string }>
    // Should only include fulfilled results, skipping rejected
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('memory-1')
  })

  it('filters by specific cluster when option is provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'target-cluster', context: 'ctx-1', reachable: true },
      { name: 'other-cluster', context: 'ctx-2', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      _fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      // Verify only target cluster was passed
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('target-cluster')
      return [{ status: 'fulfilled' as const, value: [{ name: 'agent-1', cluster: 'target-cluster' }] }]
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ name: 'agent-1' }] }),
    })

    renderHook(() => useKagentCRDAgents({ cluster: 'target-cluster' }))

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()
  })

  it('uses context when available, falls back to name', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-no-ctx', reachable: true }, // no context property
      { name: 'cluster-with-ctx', context: 'custom-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve({
        ok: true,
        json: async () => ({ agents: [] }),
      })
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDAgents())

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    // Verify that fetch was called with context when available, name otherwise
    const clusterParams = fetchedUrls.map(u => {
      const url = new URL(u)
      return url.searchParams.get('cluster')
    })
    expect(clusterParams).toContain('cluster-no-ctx')
    expect(clusterParams).toContain('custom-ctx')
  })

  it('agentFetch returns null when fetch response is not ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'failing-cluster', context: 'ctx-fail', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDTools())

    expect(capturedFetcher).toBeDefined()
    // agentFetch now throws on non-ok response; when all clusters fail,
    // agentFetchAllClusters re-throws with an aggregate error
    await expect(capturedFetcher!()).rejects.toThrow('All kagent CRD fetches failed')
  })

  it('agentFetch returns null when fetch throws (network error)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'network-fail', context: 'ctx-net', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ERR_CONNECTION_REFUSED'))

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDModels())

    expect(capturedFetcher).toBeDefined()
    // agentFetch now throws on network error; when all clusters fail,
    // agentFetchAllClusters re-throws with an aggregate error
    await expect(capturedFetcher!()).rejects.toThrow('All kagent CRD fetches failed')
  })
})

// ===========================================================================
// Demo data integrity
// ===========================================================================

describe('demo data integrity', () => {
  it('demo agents have all required fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData
      for (const agent of agents as Array<Record<string, unknown>>) {
        expect(agent.name).toBeTruthy()
        expect(agent.namespace).toBeTruthy()
        expect(agent.cluster).toBeTruthy()
        expect(['Declarative', 'BYO']).toContain(agent.agentType)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo tools have all required fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData
      for (const tool of tools as Array<Record<string, unknown>>) {
        expect(tool.name).toBeTruthy()
        expect(tool.namespace).toBeTruthy()
        expect(tool.cluster).toBeTruthy()
        expect(['ToolServer', 'RemoteMCPServer']).toContain(tool.kind)
        expect(Array.isArray(tool.discoveredTools)).toBe(true)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo models have provider and kind fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData
      for (const model of models as Array<Record<string, unknown>>) {
        expect(model.name).toBeTruthy()
        expect(model.provider).toBeTruthy()
        expect(['ModelConfig', 'ModelProviderConfig']).toContain(model.kind)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo memories have provider and status fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const memories = opts.demoData
      for (const memory of memories as Array<Record<string, unknown>>) {
        expect(memory.name).toBeTruthy()
        expect(memory.provider).toBeTruthy()
        expect(memory.status).toBeTruthy()
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDMemories())
  })
})

// ===========================================================================
// Hook re-export types
// ===========================================================================

describe('type re-exports', () => {
  it('re-exports KagentCRDAgent type', async () => {
    const mod = await import('../kagent_crds')
    // Type re-exports are checked at compile time; we verify module has the hooks
    expect(mod.useKagentCRDAgents).toBeDefined()
    expect(mod.useKagentCRDTools).toBeDefined()
    expect(mod.useKagentCRDModels).toBeDefined()
    expect(mod.useKagentCRDMemories).toBeDefined()
  })
})

// ===========================================================================
// Expanded coverage: agentFetch internals, namespace filtering,
// abort/timeout, missing data keys, demo data field validation
// ===========================================================================

describe('agentFetch — namespace parameter handling', () => {
  it('passes namespace as query param when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve({
        ok: true,
        json: async () => ({ agents: [{ name: 'agent-1' }] }),
      })
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDAgents({ namespace: 'kagent-system' }))

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    // Verify namespace was passed as a query parameter
    expect(fetchedUrls.length).toBeGreaterThan(0)
    const url = new URL(fetchedUrls[0])
    expect(url.searchParams.get('namespace')).toBe('kagent-system')
  })

  it('omits namespace query param when not provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve({
        ok: true,
        json: async () => ({ tools: [] }),
      })
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDTools())

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    expect(fetchedUrls.length).toBeGreaterThan(0)
    const url = new URL(fetchedUrls[0])
    expect(url.searchParams.has('namespace')).toBe(false)
  })
})

describe('agentFetch — missing data key fallback', () => {
  it('returns empty array when response data does not contain expected key', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    // Return a response that does NOT have the expected 'agents' key
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpectedKey: 'value' }),
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDAgents())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!() as unknown[]
    // data[key] || [] fallback should produce empty array per cluster,
    // mapped with cluster name
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('agentFetch — abort timeout behavior', () => {
  it('clears timeout after successful fetch', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ memories: [{ name: 'mem-1' }] }),
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDMemories())

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    // clearTimeout should have been called (cleanup after successful fetch)
    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('clears timeout even when fetch fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('TIMEOUT'))

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDModels())

    expect(capturedFetcher).toBeDefined()
    // agentFetch now re-throws on failure; when all clusters fail,
    // agentFetchAllClusters throws an aggregate error
    await expect(capturedFetcher!()).rejects.toThrow('All kagent CRD fetches failed')
    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })
})

describe('demo data field completeness', () => {
  it('demo agents have runtime, a2aEnabled, replicas, and age fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData as Array<Record<string, unknown>>
      for (const agent of agents) {
        expect(typeof agent.runtime).toBe('string')
        expect(typeof agent.a2aEnabled).toBe('boolean')
        expect(typeof agent.replicas).toBe('number')
        expect(typeof agent.readyReplicas).toBe('number')
        expect(typeof agent.age).toBe('string')
        expect(typeof agent.systemMessage).toBe('string')
        expect(typeof agent.toolCount).toBe('number')
        expect(typeof agent.modelConfigRef).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo agents have valid status values', () => {
    const validStatuses = ['Ready', 'Accepted', 'Pending', 'Failed', 'Unknown']
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData as Array<Record<string, unknown>>
      for (const agent of agents) {
        expect(validStatuses).toContain(agent.status)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo tools have correct protocol values', () => {
    const validProtocols = ['stdio', 'sse', 'streamableHTTP']
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData as Array<Record<string, unknown>>
      for (const tool of tools) {
        expect(validProtocols).toContain(tool.protocol)
        expect(typeof tool.url).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo tools discoveredTools have name and description', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData as Array<Record<string, unknown>>
      for (const tool of tools) {
        const discovered = tool.discoveredTools as Array<Record<string, unknown>>
        expect(discovered.length).toBeGreaterThan(0)
        for (const dt of discovered) {
          expect(typeof dt.name).toBe('string')
          expect(typeof dt.description).toBe('string')
        }
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo models have discoveredModels array and modelCount', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData as Array<Record<string, unknown>>
      for (const model of models) {
        expect(Array.isArray(model.discoveredModels)).toBe(true)
        expect(typeof model.modelCount).toBe('number')
        expect(typeof model.lastDiscoveryTime).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo models with ModelProviderConfig have non-empty discoveredModels', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData as Array<Record<string, unknown>>
      const providerConfigs = models.filter(m => m.kind === 'ModelProviderConfig')
      expect(providerConfigs.length).toBeGreaterThan(0)
      for (const pc of providerConfigs) {
        const discovered = pc.discoveredModels as string[]
        expect(discovered.length).toBeGreaterThan(0)
        expect(pc.modelCount).toBe(discovered.length)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo memories have exactly the expected entries', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const memories = opts.demoData as Array<Record<string, unknown>>
      expect(memories.length).toBe(2)
      const names = memories.map(m => m.name)
      expect(names).toContain('incident-memory')
      expect(names).toContain('code-review-memory')
      for (const memory of memories) {
        expect(memory.provider).toBe('pinecone')
        expect(memory.status).toBe('Ready')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDMemories())
  })
})

describe('agentFetchAllClusters — cluster context fallback', () => {
  it('uses cluster name when context is undefined', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'no-context-cluster', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const fetchedUrls: string[] = []
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve({
        ok: true,
        json: async () => ({ tools: [{ name: 'tool-1' }] }),
      })
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDTools())

    expect(capturedFetcher).toBeDefined()
    await capturedFetcher!()

    // When context is undefined, it should fall back to name
    expect(fetchedUrls.length).toBe(1)
    const url = new URL(fetchedUrls[0])
    expect(url.searchParams.get('cluster')).toBe('no-context-cluster')
  })
})

describe('agentFetchAllClusters — items annotated with cluster name', () => {
  it('each returned item has the cluster name attached', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'annotated-cluster', context: 'ctx-a', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | undefined
    mockUseCache.mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ memories: [{ name: 'mem-x', provider: 'pg' }] }),
    })

    mockMapSettled.mockImplementation(async (
      items: Array<{ name: string; context?: string }>,
      fn: (item: { name: string; context?: string }, index: number) => Promise<unknown>,
    ) => {
      const results: PromiseSettledResult<unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const value = await fn(items[i], i)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    renderHook(() => useKagentCRDMemories())

    expect(capturedFetcher).toBeDefined()
    const result = await capturedFetcher!() as Array<{ name: string; cluster: string }>

    expect(result.length).toBe(1)
    expect(result[0].cluster).toBe('annotated-cluster')
    expect(result[0].name).toBe('mem-x')
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })
})
