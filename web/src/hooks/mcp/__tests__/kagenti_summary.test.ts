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

// ===========================================================================
// Error handling — auth failures, network errors, malformed responses (#11383)
// ===========================================================================

describe('useKagentiSummary — error propagation', () => {
  it('propagates auth error from agents hook', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: false, isRefreshing: false,
        error: callCount === 1 ? 'Authentication failed (401) for /kagenti/agents' : null,
        refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: callCount === 1 ? 3 : 0,
        isFailed: callCount === 1,
        lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.error).toContain('Authentication failed (401)')
  })

  it('propagates network error from agents hook', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: false, isRefreshing: false,
        error: callCount === 1 ? 'Kagenti agent not connected' : null,
        refetch: vi.fn(),
        isDemoData: false, isDemoFallback: false,
        consecutiveFailures: callCount === 1 ? 3 : 0,
        isFailed: callCount === 1,
        lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.error).toContain('Kagenti agent not connected')
  })
})
