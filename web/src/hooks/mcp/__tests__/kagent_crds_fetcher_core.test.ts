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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
        } catch (reason: unknown) {
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
})
