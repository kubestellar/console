import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockClusterCacheRef } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockClusterCacheRef: {
    clusters: [] as Array<{ name: string; context?: string; server?: string; reachable?: boolean }>,
  },
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  fetchAPI: vi.fn(),
  fetchFromAllClusters: vi.fn(),
  fetchViaSSE: vi.fn(),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async () => []),
}))

vi.mock('../../lib/schemas', () => ({
  NodesResponseSchema: {},
}))

vi.mock('../../lib/schemas/validate', () => ({
  validateArrayResponse: vi.fn((_, raw: unknown) => raw),
}))

vi.mock('../useCachedData/demoData', () => ({
  getDemoCachedNodes: () => [{ name: 'demo-node', status: 'Ready', cluster: 'demo' }],
  getDemoCoreDNSStatus: () => [],
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 60000,
}))

import { useCachedNodes, useCachedCoreDNSStatus } from '../useCachedNodes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCache(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClusterCacheRef.clusters = []
  mockUseCache.mockReturnValue(defaultCache())
})

// ---------------------------------------------------------------------------
// useCachedNodes
// ---------------------------------------------------------------------------

describe('useCachedNodes', () => {
  it('returns expected fields', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current).toHaveProperty('nodes')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('nodes aliases data', () => {
    const nodes = [{ name: 'n1', status: 'Ready', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: nodes }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.nodes).toEqual(nodes)
    expect(result.current.data).toEqual(nodes)
  })

  it('passes a cache key based on cluster arg', () => {
    renderHook(() => useCachedNodes('prod'))
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('prod')
  })

  it('passes default key when no cluster given', () => {
    renderHook(() => useCachedNodes())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('all')
  })

  it('exposes isLoading from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isLoading: true }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.isLoading).toBe(true)
  })

  it('exposes isDemoFallback from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('refetch is a function', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(typeof result.current.refetch).toBe('function')
  })

  it('initialData is an empty array (no crash on first render)', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(Array.isArray(result.current.nodes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useCachedCoreDNSStatus
// ---------------------------------------------------------------------------

describe('useCachedCoreDNSStatus', () => {
  it('returns expected fields', () => {
    const { result } = renderHook(() => useCachedCoreDNSStatus())
    expect(result.current).toHaveProperty('clusters')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('refetch')
  })

  it('clusters aliases data', () => {
    const clusterData = [{ cluster: 'c1', pods: [], healthy: true, totalRestarts: 0 }]
    mockUseCache.mockReturnValue(defaultCache({ data: clusterData }))
    const { result } = renderHook(() => useCachedCoreDNSStatus())
    expect(result.current.clusters).toEqual(clusterData)
  })

  it('passes a key containing coredns', () => {
    renderHook(() => useCachedCoreDNSStatus())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('coredns')
  })

  it('passes cluster name in key when cluster provided', () => {
    renderHook(() => useCachedCoreDNSStatus('my-cluster'))
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('my-cluster')
  })
})
