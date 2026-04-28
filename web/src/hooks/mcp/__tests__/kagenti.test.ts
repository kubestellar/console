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
  LOCAL_AGENT_URL: 'http://localhost:8585',
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

describe('useKagentiAgents', () => {
  it('passes correct key and initial data to useCache', () => {
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

    renderHook(() => useKagentiAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-agents:all:all',
        category: 'clusters',
        initialData: [],
        demoWhenEmpty: true,
      })
    )
  })

  it('returns data from useCache', () => {
    const fakeAgents = [
      { name: 'code-review-agent', namespace: 'kagenti-system', status: 'Running', replicas: 2, readyReplicas: 2, framework: 'langgraph', protocol: 'a2a', image: 'ghcr.io/kagenti/code-review:v0.3.1', cluster: 'prod-east', createdAt: '2025-01-15T10:00:00Z' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeAgents,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiAgents())

    expect(result.current.data).toEqual(fakeAgents)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('passes cluster and namespace options correctly', () => {
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

    renderHook(() => useKagentiAgents({ cluster: 'prod-east', namespace: 'kagenti-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-agents:prod-east:kagenti-system',
      })
    )
  })
})

// ===========================================================================
// useKagentiBuilds
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

describe('useKagentiSummary', () => {
  it('returns null summary when all sub-hooks are loading', () => {
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

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.summary).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('computes summary from sub-hook data', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      // Return different data for agents, builds, cards, tools
      if (callCount === 1) {
        // agents
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'prod', framework: 'langgraph' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'prod', framework: 'crewai' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      if (callCount === 2) {
        // builds
        return {
          data: [{ name: 'b1', status: 'Building' }],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      if (callCount === 3) {
        // cards
        return {
          data: [
            { name: 'c1', identityBinding: 'strict' },
            { name: 'c2', identityBinding: 'none' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      // tools
      return {
        data: [{ name: 't1' }, { name: 't2' }, { name: 't3' }],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.summary).toBeDefined()
    expect(result.current.summary!.agentCount).toBe(2)
    expect(result.current.summary!.readyAgents).toBe(2)
    expect(result.current.summary!.buildCount).toBe(1)
    expect(result.current.summary!.activeBuilds).toBe(1)
    expect(result.current.summary!.toolCount).toBe(3)
    expect(result.current.summary!.cardCount).toBe(2)
    expect(result.current.summary!.spiffeBound).toBe(1)
    expect(result.current.summary!.spiffeTotal).toBe(2)
  })

  it('provides refetch function that calls all sub-hook refetches', async () => {
    const mockRefetch = vi.fn().mockResolvedValue(undefined)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mockRefetch,
      isDemoData: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns isDemoData true when any sub-hook is demo', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      const isDemo = callCount === 2 // builds are demo
      return {
        data: callCount === 1 ? [{ name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c', framework: 'f' }] : [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: isDemo, isDemoFallback: isDemo,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.isDemoData).toBe(true)
  })

  it('returns error from agents sub-hook', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: false, isRefreshing: false,
        error: callCount === 1 ? 'Agent error' : null,
        refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.error).toBe('Agent error')
  })

  it('computes correct framework breakdown', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'langgraph' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'langgraph' },
            { name: 'a3', status: 'Running', readyReplicas: 1, cluster: 'c2', framework: 'crewai' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, isDemoFallback: false,
          consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.frameworks).toEqual({ langgraph: 2, crewai: 1 })
  })

  it('computes cluster breakdown correctly', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'prod', framework: 'f' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'prod', framework: 'f' },
            { name: 'a3', status: 'Running', readyReplicas: 0, cluster: 'staging', framework: 'f' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, isDemoFallback: false,
          consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.clusterBreakdown).toEqual(
      expect.arrayContaining([
        { cluster: 'prod', agents: 2 },
        { cluster: 'staging', agents: 1 },
      ]),
    )
    // readyAgents should only count Running + readyReplicas > 0
    expect(result.current.summary?.readyAgents).toBe(2)
  })

  it('counts spiffeBound correctly (excludes none identity)', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 3) {
        return {
          data: [
            { name: 'c1', identityBinding: 'strict' },
            { name: 'c2', identityBinding: 'permissive' },
            { name: 'c3', identityBinding: 'none' },
            { name: 'c4', identityBinding: 'strict' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, isDemoFallback: false,
          consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: callCount === 1
          ? [{ name: 'a', status: 'Running', readyReplicas: 1, cluster: 'c', framework: 'f' }]
          : [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.spiffeBound).toBe(3) // strict + permissive + strict
    expect(result.current.summary?.spiffeTotal).toBe(4)
  })
})

// ===========================================================================
// useKagentiAgents - additional edge cases
// ===========================================================================

describe('useKagentiAgents - edge cases', () => {
  it('sets enabled false when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('sets enabled true when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('provides non-empty demoData', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())
    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useKagentiTools - additional edge cases
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
    // agentFetch now throws on non-ok response; when all clusters fail,
    // agentFetchAllClusters re-throws with an aggregate error
    await expect(capturedFetcher!()).rejects.toThrow('All kagenti fetches failed')

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
    // agentFetch now throws on network error; when all clusters fail,
    // agentFetchAllClusters re-throws with an aggregate error
    await expect(capturedFetcher!()).rejects.toThrow('All kagenti fetches failed')

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

describe('useKagentiSummary — edge cases', () => {
  it('returns null summary when all data arrays are empty and still loading', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary).toBeNull()
  })

  it('returns non-null summary when data arrays are empty but not loading', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
      isDemoFallback: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary!.agentCount).toBe(0)
    expect(result.current.summary!.buildCount).toBe(0)
    expect(result.current.summary!.toolCount).toBe(0)
    expect(result.current.summary!.cardCount).toBe(0)
  })

  it('handles agents with Pending status (not ready)', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 2, cluster: 'c1', framework: 'langgraph' },
            { name: 'a2', status: 'Pending', readyReplicas: 0, cluster: 'c1', framework: 'langgraph' },
            { name: 'a3', status: 'Running', readyReplicas: 0, cluster: 'c2', framework: 'crewai' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, isDemoFallback: false,
          consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary!.agentCount).toBe(3)
    // Only a1 is Running AND has readyReplicas > 0
    expect(result.current.summary!.readyAgents).toBe(1)
  })

  it('calls all sub-hook refetches when refetch is invoked', async () => {
    const refetchFns = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      const idx = callCount++
      return {
        data: idx === 0
          ? [{ name: 'a', status: 'Running', readyReplicas: 1, cluster: 'c', framework: 'f' }]
          : [],
        isLoading: false, isRefreshing: false, error: null,
        refetch: refetchFns[idx % 4],
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    await result.current.refetch()

    for (const fn of refetchFns) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })

  it('handles frameworks with duplicate keys across agents', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'ag2' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'ag2' },
            { name: 'a3', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'ag2' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, isDemoFallback: false,
          consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary!.frameworks).toEqual({ ag2: 3 })
  })
})
