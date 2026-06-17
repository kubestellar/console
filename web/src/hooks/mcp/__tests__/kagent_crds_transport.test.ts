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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
