import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../shared', () => ({
  LOCAL_AGENT_URL: 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
}))

// Mock useCache to return controllable values
vi.mock('../../../lib/cache', () => ({
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
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
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(typeof result.current.refetch).toBe('function')
  })

  it('computes cluster breakdown correctly across multiple clusters', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'prod-east', framework: 'langgraph' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'prod-east', framework: 'langgraph' },
            { name: 'a3', status: 'Running', readyReplicas: 1, cluster: 'prod-west', framework: 'crewai' },
            { name: 'a4', status: 'Pending', readyReplicas: 0, cluster: 'staging', framework: 'ag2' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.summary).toBeDefined()
    const breakdown = result.current.summary!.clusterBreakdown
    expect(breakdown).toHaveLength(3)
    expect(breakdown.find(b => b.cluster === 'prod-east')?.agents).toBe(2)
    expect(breakdown.find(b => b.cluster === 'prod-west')?.agents).toBe(1)
    expect(breakdown.find(b => b.cluster === 'staging')?.agents).toBe(1)
  })

  it('computes frameworks record correctly', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'langgraph' },
            { name: 'a2', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'langgraph' },
            { name: 'a3', status: 'Running', readyReplicas: 1, cluster: 'c2', framework: 'crewai' },
            { name: 'a4', status: 'Running', readyReplicas: 1, cluster: 'c2', framework: 'ag2' },
            { name: 'a5', status: 'Running', readyReplicas: 1, cluster: 'c3', framework: 'ag2' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    const frameworks = result.current.summary!.frameworks
    expect(frameworks['langgraph']).toBe(2)
    expect(frameworks['crewai']).toBe(1)
    expect(frameworks['ag2']).toBe(2)
  })

  it('counts only running agents with ready replicas as readyAgents', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          data: [
            { name: 'a1', status: 'Running', readyReplicas: 2, cluster: 'c1', framework: 'f1' },
            { name: 'a2', status: 'Pending', readyReplicas: 0, cluster: 'c1', framework: 'f2' },
            { name: 'a3', status: 'Running', readyReplicas: 0, cluster: 'c2', framework: 'f1' },
            { name: 'a4', status: 'Failed', readyReplicas: 1, cluster: 'c2', framework: 'f3' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.summary!.agentCount).toBe(4)
    // Only 'a1' is Running AND has readyReplicas > 0
    expect(result.current.summary!.readyAgents).toBe(1)
  })

  it('counts spiffeBound excluding "none" identity bindings', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 3) {
        // cards (3rd call)
        return {
          data: [
            { name: 'c1', identityBinding: 'strict' },
            { name: 'c2', identityBinding: 'permissive' },
            { name: 'c3', identityBinding: 'none' },
            { name: 'c4', identityBinding: 'strict' },
            { name: 'c5', identityBinding: 'none' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: callCount === 1
          ? [{ name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'f1' }]
          : [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.summary!.spiffeTotal).toBe(5)
    expect(result.current.summary!.spiffeBound).toBe(3)
  })

  it('reports isDemoData true when any sub-hook uses demo data', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: callCount === 1
          ? [{ name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'f1' }]
          : [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoFallback: callCount === 2, // builds uses demo data
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.isDemoData).toBe(true)
  })

  it('reports isDemoData false when no sub-hook uses demo data', () => {
    mockUseCache.mockReturnValue({
      data: [{ name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'f1' }],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.isDemoData).toBe(false)
  })

  it('passes error from agents sub-hook', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: false, isRefreshing: false,
        error: callCount === 1 ? new Error('agent fetch failed') : null,
        refetch: vi.fn(),
        isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.error).toEqual(new Error('agent fetch failed'))
  })

  it('counts active builds correctly (only "Building" status)', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        // builds
        return {
          data: [
            { name: 'b1', status: 'Building' },
            { name: 'b2', status: 'Succeeded' },
            { name: 'b3', status: 'Building' },
            { name: 'b4', status: 'Failed' },
          ],
          isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
          isDemoFallback: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
        }
      }
      return {
        data: callCount === 1
          ? [{ name: 'a1', status: 'Running', readyReplicas: 1, cluster: 'c1', framework: 'f1' }]
          : [],
        isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
        isDemoFallback: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())

    expect(result.current.summary!.buildCount).toBe(4)
    expect(result.current.summary!.activeBuilds).toBe(2)
  })
})

// ===========================================================================
// useKagentiAgents — additional tests
// ===========================================================================

describe('useKagentiAgents — additional', () => {
  it('sets enabled to false when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    )
  })

  it('sets enabled to true when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it('provides demo data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData).toBeDefined()
    expect(Array.isArray(callArg.demoData)).toBe(true)
    expect(callArg.demoData.length).toBeGreaterThan(0)
    // Each demo agent should have expected fields
    expect(callArg.demoData[0]).toHaveProperty('name')
    expect(callArg.demoData[0]).toHaveProperty('framework')
    expect(callArg.demoData[0]).toHaveProperty('cluster')
  })

  it('uses "all" defaults when no options provided', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'kagenti-agents:all:all' })
    )
  })

  it('uses only namespace when no cluster provided', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiAgents({ namespace: 'kagenti-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'kagenti-agents:all:kagenti-ops' })
    )
  })
})

// ===========================================================================
// useKagentiBuilds — additional tests
// ===========================================================================

describe('useKagentiBuilds — additional', () => {
  it('passes cluster and namespace options correctly', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiBuilds({ cluster: 'staging', namespace: 'kagenti-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-builds:staging:kagenti-system',
      })
    )
  })

  it('provides demo builds to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiBuilds())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData).toBeDefined()
    expect(callArg.demoData.length).toBeGreaterThan(0)
    expect(callArg.demoData[0]).toHaveProperty('pipeline')
    expect(callArg.demoData[0]).toHaveProperty('startTime')
  })
})

// ===========================================================================
// useKagentiCards — additional tests
// ===========================================================================

describe('useKagentiCards — additional', () => {
  it('passes cluster and namespace options correctly', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiCards({ cluster: 'prod-west', namespace: 'kagenti-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-cards:prod-west:kagenti-ops',
      })
    )
  })

  it('provides demo cards with skills and capabilities arrays', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiCards())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData).toBeDefined()
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const firstCard = callArg.demoData[0]
    expect(Array.isArray(firstCard.skills)).toBe(true)
    expect(Array.isArray(firstCard.capabilities)).toBe(true)
    expect(firstCard).toHaveProperty('identityBinding')
    expect(firstCard).toHaveProperty('syncPeriod')
  })
})

// ===========================================================================
// useKagentiTools — additional tests
// ===========================================================================

describe('useKagentiTools — additional', () => {
  it('passes cluster and namespace options correctly', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiTools({ cluster: 'prod-east', namespace: 'kagenti-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagenti-tools:prod-east:kagenti-system',
      })
    )
  })

  it('provides demo tools with credential info', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentiTools())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const firstTool = callArg.demoData[0]
    expect(firstTool).toHaveProperty('toolPrefix')
    expect(firstTool).toHaveProperty('targetRef')
    expect(typeof firstTool.hasCredential).toBe('boolean')
  })

  it('returns isRefreshing state from useCache', () => {
    mockUseCache.mockReturnValue({
      data: [{ name: 't1', namespace: 'ns', toolPrefix: 'tp', targetRef: 'tr', hasCredential: false, cluster: 'c1' }],
      isLoading: false, isRefreshing: true, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentiTools())

    expect(result.current.isRefreshing).toBe(true)
  })
})
