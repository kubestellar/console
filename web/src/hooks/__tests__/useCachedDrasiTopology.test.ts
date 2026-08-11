/**
 * Tests for useCachedDrasiTopology hook.
 *
 * Verifies the hook is correctly wired via createCachedHook factory
 * and returns the expected shape, including the isDemoData alias.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DrasiTopologyData } from '../../lib/demo/drasiTopology'

const INITIAL_DATA: DrasiTopologyData = {
  nodes: [],
  edges: [],
  totalSources: 0,
  totalQueries: 0,
  totalReactions: 0,
  connectedPairs: 0,
  orphanedNodes: 0,
}

const mockUseCache = vi.fn()

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook:
    (_config: { key: string; initialData: unknown; fetcher: () => Promise<unknown> }) =>
    () =>
      mockUseCache(_config),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../../lib/demo/drasiTopology', () => ({
  generateDrasiTopology: vi.fn(),
}))

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
  data: INITIAL_DATA,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
  ...overrides,
})

import { useCachedDrasiTopology } from '../useCachedDrasiTopology'

describe('useCachedDrasiTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(makeCacheResult())
  })

  it('returns the expected hook result shape', () => {
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns topology data and isDemoData=false when not in demo mode', () => {
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.data.nodes).toHaveLength(0)
    expect(result.current.data.edges).toHaveLength(0)
    expect(result.current.isDemoData).toBe(false)
  })

  it('sets isDemoData=true when isDemoFallback is set', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.isDemoData).toBe(true)
  })

  it('is not loading when data is available', () => {
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('handles loading state correctly', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }),
    )
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.isLoading).toBe(true)
  })

  it('reflects topology counts when data is populated', () => {
    const topology: DrasiTopologyData = {
      nodes: [
        { id: 'src-1', name: 'orders-db', type: 'source', status: 'ready', kind: 'PostgreSQL' },
        { id: 'qry-1', name: 'active-orders', type: 'query', status: 'ready', kind: 'ContinuousQuery' },
        { id: 'rxn-1', name: 'notify', type: 'reaction', status: 'ready', kind: 'Reaction' },
      ],
      edges: [
        { from: 'src-1', to: 'qry-1' },
        { from: 'qry-1', to: 'rxn-1' },
      ],
      totalSources: 1,
      totalQueries: 1,
      totalReactions: 1,
      connectedPairs: 2,
      orphanedNodes: 0,
    }
    mockUseCache.mockReturnValue(makeCacheResult({ data: topology }))
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.data.nodes).toHaveLength(3)
    expect(result.current.data.edges).toHaveLength(2)
    expect(result.current.data.totalSources).toBe(1)
    expect(result.current.data.connectedPairs).toBe(2)
    expect(result.current.data.orphanedNodes).toBe(0)
  })
})
