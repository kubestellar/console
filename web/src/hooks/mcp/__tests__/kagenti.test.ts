/**
 * Tests for kagenti.ts
 *
 * Covers the hooks for fetching Kagenti resources (agents, builds, cards, tools, summary).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockUseCache,
  mockClusterCacheRef,
  mockDeduplicateClustersByServer,
  mockGetLocalAgentURL,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => false),
  mockReportAgentDataSuccess: vi.fn(),
  mockUseCache: vi.fn(),
  mockClusterCacheRef: { clusters: [] },
  mockDeduplicateClustersByServer: vi.fn((clusters) => clusters),
  mockGetLocalAgentURL: vi.fn(() => 'http://localhost:8585'),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  getLocalAgentURL: () => mockGetLocalAgentURL(),
  agentFetch: vi.fn(),
}))

vi.mock('../dedup', () => ({
  deduplicateClustersByServer: (clusters: unknown[]) => mockDeduplicateClustersByServer(clusters),
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useKagentiAgents,
  useKagentiBuilds,
  useKagentiCards,
  useKagentiTools,
  useKagentiSummary,
  type KagentiAgent,
  type KagentiBuild,
  type KagentiCard,
  type KagentiTool,
  type KagentiSummary,
} from '../kagenti'

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(false)
  mockClusterCacheRef.clusters = []
  mockDeduplicateClustersByServer.mockImplementation((clusters) => clusters)
  
  // Default mock implementation for useCache
  mockUseCache.mockReturnValue({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    error: null,
  })
})

// ---------------------------------------------------------------------------
// useKagentiAgents
// ---------------------------------------------------------------------------

describe('useKagentiAgents', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentiAgents())
    
    expect(mockUseCache).toHaveBeenCalled()
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-agents:all:all')
  })

  it('calls useCache with cluster-specific key', () => {
    renderHook(() => useKagentiAgents({ cluster: 'prod-east' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-agents:prod-east:all')
  })

  it('calls useCache with namespace-specific key', () => {
    renderHook(() => useKagentiAgents({ namespace: 'kagenti-system' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-agents:all:kagenti-system')
  })

  it('calls useCache with cluster and namespace key', () => {
    renderHook(() => useKagentiAgents({ cluster: 'staging', namespace: 'kagenti-ops' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-agents:staging:kagenti-ops')
  })

  it('sets category to clusters', () => {
    renderHook(() => useKagentiAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.category).toBe('clusters')
  })

  it('provides empty array as initial data', () => {
    renderHook(() => useKagentiAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.initialData)).toBe(true)
    expect(call.initialData).toHaveLength(0)
  })

  it('provides demo data', () => {
    renderHook(() => useKagentiAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('enables demo fallback when empty', () => {
    renderHook(() => useKagentiAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoWhenEmpty).toBe(true)
  })

  it('is disabled when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    renderHook(() => useKagentiAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.enabled).toBe(false)
  })

  it('returns data from useCache', () => {
    const mockAgents: KagentiAgent[] = [
      { name: 'test-agent', namespace: 'default', status: 'Running', replicas: 1, readyReplicas: 1, framework: 'langgraph', protocol: 'a2a', image: 'test:latest', cluster: 'prod', createdAt: '2025-01-01T00:00:00Z' },
    ]
    mockUseCache.mockReturnValue({
      data: mockAgents,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })

    const { result } = renderHook(() => useKagentiAgents())
    expect(result.current.data).toEqual(mockAgents)
  })
})

// ---------------------------------------------------------------------------
// useKagentiBuilds
// ---------------------------------------------------------------------------

describe('useKagentiBuilds', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentiBuilds())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-builds:all:all')
  })

  it('calls useCache with cluster-specific key', () => {
    renderHook(() => useKagentiBuilds({ cluster: 'prod-west' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-builds:prod-west:all')
  })

  it('provides demo data with builds', () => {
    renderHook(() => useKagentiBuilds())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one build has required fields
    const build = call.demoData[0]
    expect(typeof build.name).toBe('string')
    expect(typeof build.status).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockBuilds: KagentiBuild[] = [
      { name: 'test-build-1', namespace: 'default', status: 'Succeeded', source: 'github.com/org/repo', pipeline: 'kaniko', mode: 'dockerfile', cluster: 'prod', startTime: '2025-01-01T00:00:00Z', completionTime: '2025-01-01T00:05:00Z' },
    ]
    mockUseCache.mockReturnValue({
      data: mockBuilds,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })

    const { result } = renderHook(() => useKagentiBuilds())
    expect(result.current.data).toEqual(mockBuilds)
  })
})

// ---------------------------------------------------------------------------
// useKagentiCards
// ---------------------------------------------------------------------------

describe('useKagentiCards', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentiCards())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-cards:all:all')
  })

  it('calls useCache with namespace-specific key', () => {
    renderHook(() => useKagentiCards({ namespace: 'kagenti-system' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-cards:all:kagenti-system')
  })

  it('provides demo data with cards', () => {
    renderHook(() => useKagentiCards())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one card has required fields
    const card = call.demoData[0]
    expect(typeof card.name).toBe('string')
    expect(typeof card.agentName).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockCards: KagentiCard[] = [
      { name: 'test-card', namespace: 'default', agentName: 'test-agent', skills: ['skill1'], capabilities: ['streaming'], syncPeriod: '30s', identityBinding: 'strict', cluster: 'prod' },
    ]
    mockUseCache.mockReturnValue({
      data: mockCards,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })

    const { result } = renderHook(() => useKagentiCards())
    expect(result.current.data).toEqual(mockCards)
  })
})

// ---------------------------------------------------------------------------
// useKagentiTools
// ---------------------------------------------------------------------------

describe('useKagentiTools', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentiTools())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagenti-tools:all:all')
  })

  it('provides demo data with tools', () => {
    renderHook(() => useKagentiTools())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one tool has required fields
    const tool = call.demoData[0]
    expect(typeof tool.name).toBe('string')
    expect(typeof tool.toolPrefix).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockTools: KagentiTool[] = [
      { name: 'kubectl-tool', namespace: 'default', toolPrefix: 'kubectl', targetRef: 'kubectl-gateway', hasCredential: true, cluster: 'prod' },
    ]
    mockUseCache.mockReturnValue({
      data: mockTools,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })

    const { result } = renderHook(() => useKagentiTools())
    expect(result.current.data).toEqual(mockTools)
  })

  it('sets category to clusters for all hooks', () => {
    renderHook(() => useKagentiAgents())
    renderHook(() => useKagentiBuilds())
    renderHook(() => useKagentiCards())
    renderHook(() => useKagentiTools())
    
    for (let i = 0; i < 4; i++) {
      const call = mockUseCache.mock.calls[i][0]
      expect(call.category).toBe('clusters')
    }
  })
})

// ---------------------------------------------------------------------------
// useKagentiSummary
// ---------------------------------------------------------------------------

describe('useKagentiSummary', () => {
  beforeEach(() => {
    // Mock all sub-hooks to return specific data for summary tests
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      if (callCount === 1) { // agents
        return {
          data: [
            { name: 'agent1', status: 'Running', readyReplicas: 1, framework: 'langgraph', cluster: 'prod' },
            { name: 'agent2', status: 'Running', readyReplicas: 1, framework: 'crewai', cluster: 'prod' },
            { name: 'agent3', status: 'Pending', readyReplicas: 0, framework: 'langgraph', cluster: 'staging' },
          ],
          isLoading: false,
          isDemoFallback: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      if (callCount === 2) { // builds
        return {
          data: [
            { status: 'Succeeded' },
            { status: 'Building' },
            { status: 'Failed' },
          ],
          isLoading: false,
          isDemoFallback: false,
          refetch: vi.fn(),
        }
      }
      if (callCount === 3) { // cards
        return {
          data: [
            { identityBinding: 'strict' },
            { identityBinding: 'permissive' },
            { identityBinding: 'none' },
            { identityBinding: '' }, // Empty should NOT count as SPIFFE-bound
          ],
          isLoading: false,
          isDemoFallback: false,
          refetch: vi.fn(),
        }
      }
      // tools
      return {
        data: [{ name: 'tool1' }, { name: 'tool2' }],
        isLoading: false,
        isDemoFallback: false,
        refetch: vi.fn(),
      }
    })
  })

  it('returns null summary when loading', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true,
      isDemoFallback: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary).toBeNull()
  })

  it('aggregates agent count correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.agentCount).toBe(3)
  })

  it('counts ready agents correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.readyAgents).toBe(2) // Only Running with readyReplicas > 0
  })

  it('aggregates build count correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.buildCount).toBe(3)
  })

  it('counts active builds correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.activeBuilds).toBe(1) // Only Building
  })

  it('aggregates tool count correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.toolCount).toBe(2)
  })

  it('aggregates card count correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.cardCount).toBe(4)
  })

  it('counts SPIFFE-bound cards correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    // Only strict and permissive count, NOT none or empty string
    expect(result.current.summary?.spiffeBound).toBe(2)
    expect(result.current.summary?.spiffeTotal).toBe(4)
  })

  it('aggregates frameworks correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.frameworks).toEqual({
      langgraph: 2,
      crewai: 1,
    })
  })

  it('aggregates cluster breakdown correctly', () => {
    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.summary?.clusterBreakdown).toEqual([
      { cluster: 'prod', agents: 2 },
      { cluster: 'staging', agents: 1 },
    ])
  })

  it('returns combined loading state', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: callCount === 1, // First call (agents) is loading
        isDemoFallback: false,
        error: null,
        refetch: vi.fn(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.isLoading).toBe(true)
  })

  it('returns demo data flag when any sub-hook uses demo data', () => {
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      return {
        data: [],
        isLoading: false,
        isDemoFallback: callCount === 2, // builds using demo data
        error: null,
        refetch: vi.fn(),
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    expect(result.current.isDemoData).toBe(true)
  })

  it('provides refetch function that calls all sub-hooks', async () => {
    const mockRefetch1 = vi.fn()
    const mockRefetch2 = vi.fn()
    const mockRefetch3 = vi.fn()
    const mockRefetch4 = vi.fn()
    
    let callCount = 0
    mockUseCache.mockImplementation(() => {
      callCount++
      const refetches = [mockRefetch1, mockRefetch2, mockRefetch3, mockRefetch4]
      return {
        data: [],
        isLoading: false,
        isDemoFallback: false,
        error: null,
        refetch: refetches[callCount - 1],
      }
    })

    const { result } = renderHook(() => useKagentiSummary())
    await result.current.refetch()
    
    expect(mockRefetch1).toHaveBeenCalled()
    expect(mockRefetch2).toHaveBeenCalled()
    expect(mockRefetch3).toHaveBeenCalled()
    expect(mockRefetch4).toHaveBeenCalled()
  })
})
