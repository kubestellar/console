import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook} from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockClusterCacheRef,
  mockUseCache,
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
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useKagentiAgents,
  useKagentiBuilds,
  useKagentiCards,
  useKagentiTools,
  useKagentiSummary,
} from '../kagenti'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================
// useKagentiAgents
// ===========================================================================

describe('useKagentiAgents — fetcher callback', () => {
  it('fetcher calls agent and returns agents with cluster name', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    // Capture the fetcher passed to useCache
    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    // Mock global fetch for the agent endpoint
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ name: 'test-agent', framework: 'langgraph' }] }),
    })

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    const result = await capturedFetcher!()
    expect(result).toEqual([
      expect.objectContaining({ name: 'test-agent', cluster: 'prod' }),
    ])
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })

  it('fetcher returns empty array when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    const result = await capturedFetcher!()
    expect(result).toEqual([])
  })

  it('fetcher returns empty array when no clusters are available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = []

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    renderHook(() => useKagentiAgents())
    const result = await capturedFetcher!()
    expect(result).toEqual([])
  })

  it('fetcher filters clusters containing "/" from the target list', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
      { name: 'hub/remote', context: 'hub-remote-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useKagentiAgents())
    await capturedFetcher!()

    // Only "prod" cluster should be fetched (not "hub/remote")
    const fetchUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string)
    const agentUrls = fetchUrls.filter((u: string) => u.includes('/kagenti/agents'))
    expect(agentUrls.length).toBe(1)
    expect(agentUrls[0]).toContain('cluster=prod-ctx')

    globalThis.fetch = originalFetch
  })

  it('fetcher skips unreachable clusters', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
      { name: 'dead', context: 'dead-ctx', reachable: false },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useKagentiAgents())
    await capturedFetcher!()

    // Only reachable cluster should be fetched
    const fetchUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string)
    const agentUrls = fetchUrls.filter((u: string) => u.includes('/kagenti/agents'))
    expect(agentUrls.length).toBe(1)

    globalThis.fetch = originalFetch
  })

  it('fetcher handles agent returning non-ok response for a cluster', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useKagentiAgents())
    // agentFetch now throws a classified error; when all clusters fail,
    // agentFetchAllClusters re-throws with the classified message
    await expect(capturedFetcher!()).rejects.toThrow(/Agent returned HTTP 500/)

    globalThis.fetch = originalFetch
  })

  it('fetcher handles fetch throwing (network error) for a cluster', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    renderHook(() => useKagentiAgents())
    // agentFetch now throws a classified error; when all clusters fail,
    // agentFetchAllClusters re-throws with the classified message
    await expect(capturedFetcher!()).rejects.toThrow('ECONNREFUSED')

    globalThis.fetch = originalFetch
  })

  it('fetcher uses cluster name when context is undefined', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', reachable: true }, // no context field
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ name: 'a1' }] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useKagentiAgents())
    const result = await capturedFetcher!()

    // Should use cluster name as fallback for context
    const fetchUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(fetchUrls[0]).toContain('cluster=my-cluster')
    expect(result).toEqual([expect.objectContaining({ name: 'a1', cluster: 'my-cluster' })])

    globalThis.fetch = originalFetch
  })

  it('fetcher filters by specific cluster when option is set', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
      { name: 'staging', context: 'staging-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ name: 'a1' }] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useKagentiAgents({ cluster: 'prod' }))
    await capturedFetcher!()

    // Should only fetch from 'prod' cluster, not 'staging'
    const fetchUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string)
    const agentUrls = fetchUrls.filter((u: string) => u.includes('/kagenti/agents'))
    expect(agentUrls.length).toBe(1)
    expect(agentUrls[0]).toContain('cluster=prod-ctx')

    globalThis.fetch = originalFetch
  })
})

describe('useKagentiAgents — error handling', () => {
  it('fetcher throws classified error on 401 Unauthorized', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/Authentication failed \(401\)/)

    globalThis.fetch = originalFetch
  })

  it('fetcher throws classified error on 403 Forbidden', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/Authentication failed \(403\)/)

    globalThis.fetch = originalFetch
  })

  it('fetcher throws classified error on TypeError (network down)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/not connected|Failed to fetch/i)

    globalThis.fetch = originalFetch
  })

  it('fetcher handles 404 Not Found with classified error', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]

    let capturedFetcher: (() => Promise<unknown>) | null = null
    mockUseCache.mockImplementation((opts: { fetcher: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useKagentiAgents())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/not found/i)

    globalThis.fetch = originalFetch
  })
})
