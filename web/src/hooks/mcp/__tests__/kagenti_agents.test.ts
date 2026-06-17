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
