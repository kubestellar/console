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

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../shared', () => ({
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

// Mock useCache to return controllable values
vi.mock('../../../lib/cache', () => ({
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown; fetcher?: () => Promise<unknown>; enabled?: boolean }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
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

describe('fetcher callback — agentFetchAllClusters', () => {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
