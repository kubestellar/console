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
})
