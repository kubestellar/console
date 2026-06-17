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

describe('useKagentiBuilds', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })

    renderHook(() => useKagentiBuilds())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-builds:all:all',
        category: 'clusters',
        initialData: [],
      })
    )
  })

  it('returns build data from useCache', () => {
    const fakeBuilds = [
      { name: 'code-review-agent-build-7', namespace: 'kagenti-system', status: 'Succeeded', source: 'github.com/org/code-review', pipeline: 'kaniko', mode: 'dockerfile', cluster: 'prod-east', startTime: '2025-01-25T10:00:00Z', completionTime: '2025-01-25T10:05:30Z' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeBuilds,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiBuilds())

    expect(result.current.data).toEqual(fakeBuilds)
    expect(result.current.isLoading).toBe(false)
  })
})

// ===========================================================================
// useKagentiCards
// ===========================================================================

describe('useKagentiCards', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })

    renderHook(() => useKagentiCards())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-cards:all:all',
        category: 'clusters',
      })
    )
  })

  it('returns card data from useCache', () => {
    const fakeCards = [
      { name: 'code-review-agent-card', namespace: 'kagenti-system', agentName: 'code-review-agent', skills: ['code-review'], capabilities: ['streaming'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'prod-east' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeCards,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiCards())

    expect(result.current.data).toEqual(fakeCards)
  })
})

// ===========================================================================
// useKagentiTools
// ===========================================================================

describe('useKagentiTools', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })

    renderHook(() => useKagentiTools())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-tools:all:all',
        category: 'clusters',
      })
    )
  })

  it('returns tool data from useCache', () => {
    const fakeTools = [
      { name: 'kubectl-tool', namespace: 'kagenti-system', toolPrefix: 'kubectl', targetRef: 'kubectl-gateway', hasCredential: true, cluster: 'prod-east' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeTools,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiTools())

    expect(result.current.data).toEqual(fakeTools)
  })
})

// ===========================================================================
// useKagentiSummary
// ===========================================================================

describe('useKagentiTools - edge cases', () => {
  it('passes namespace filter correctly', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiTools({ namespace: 'kagenti-system' }))
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-tools:all:kagenti-system',
      }),
    )
  })

  it('provides demo tools data', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiTools())
    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// Additional coverage tests — targeting uncovered branches and functions
// ===========================================================================

// ---------------------------------------------------------------------------
// Fetcher callbacks — test the actual fetcher logic passed to useCache
// These exercise agentFetch, agentFetchAllClusters, and error paths
// ---------------------------------------------------------------------------

describe('useKagentiBuilds — fetcher callback', () => {
  it('fetcher returns builds from agent', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'c1', context: 'c1-ctx', reachable: true },
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
      ok: true,
      json: async () => ({ builds: [{ name: 'build-1', status: 'Succeeded' }] }),
    })

    renderHook(() => useKagentiBuilds())
    const result = await capturedFetcher!()
    expect(result).toEqual([expect.objectContaining({ name: 'build-1', cluster: 'c1' })])

    globalThis.fetch = originalFetch
  })
})

describe('useKagentiCards — fetcher callback', () => {
  it('fetcher returns cards from agent', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'c1', context: 'c1-ctx', reachable: true },
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
      ok: true,
      json: async () => ({ cards: [{ name: 'card-1', identityBinding: 'strict' }] }),
    })

    renderHook(() => useKagentiCards())
    const result = await capturedFetcher!()
    expect(result).toEqual([expect.objectContaining({ name: 'card-1', cluster: 'c1' })])

    globalThis.fetch = originalFetch
  })
})

describe('useKagentiTools — fetcher callback', () => {
  it('fetcher returns tools from agent', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'c1', context: 'c1-ctx', reachable: true },
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
      ok: true,
      json: async () => ({ tools: [{ name: 'tool-1', toolPrefix: 'kubectl' }] }),
    })

    renderHook(() => useKagentiTools())
    const result = await capturedFetcher!()
    expect(result).toEqual([expect.objectContaining({ name: 'tool-1', cluster: 'c1' })])

    globalThis.fetch = originalFetch
  })
})

describe('useKagentiBuilds — error handling', () => {
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

    renderHook(() => useKagentiBuilds())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/Authentication failed \(401\)/)

    globalThis.fetch = originalFetch
  })

  it('fetcher throws on network TypeError', async () => {
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
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource'))

    renderHook(() => useKagentiBuilds())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/not connected|NetworkError/i)

    globalThis.fetch = originalFetch
  })
})

describe('useKagentiTools — error handling', () => {
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

    renderHook(() => useKagentiTools())
    expect(capturedFetcher).not.toBeNull()

    await expect(capturedFetcher!()).rejects.toThrow(/Authentication failed \(403\)/)

    globalThis.fetch = originalFetch
  })
})
