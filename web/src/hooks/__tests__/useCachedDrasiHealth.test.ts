/**
 * Tests for useCachedDrasiHealth hook.
 *
 * Verifies the hook is correctly wired via createCachedHook factory
 * and returns the expected shape, including the isDemoData alias.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DrasiHealthSummary } from '../../lib/demo/drasiHealth'

const INITIAL_DATA: DrasiHealthSummary = {
  overallHealth: 'healthy',
  pipelines: [],
  totalSources: 0,
  healthySources: 0,
  totalQueries: 0,
  healthyQueries: 0,
  totalReactions: 0,
  healthyReactions: 0,
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

vi.mock('../../lib/demo/drasiHealth', () => ({
  generateDrasiHealthSummary: vi.fn(),
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

import { useCachedDrasiHealth } from '../useCachedDrasiHealth'

describe('useCachedDrasiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(makeCacheResult())
  })

  it('returns the expected hook result shape', () => {
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns live data and isDemoData=false when not in demo mode', () => {
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.data.overallHealth).toBe('healthy')
    expect(result.current.isDemoData).toBe(false)
  })

  it('sets isDemoData=true when isDemoFallback is set', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.isDemoData).toBe(true)
  })

  it('is not loading when data is available', () => {
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('handles loading state correctly', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }),
    )
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.isLoading).toBe(true)
  })

  it('reflects pipeline summary fields in data', () => {
    const rich: DrasiHealthSummary = {
      overallHealth: 'degraded',
      pipelines: [],
      totalSources: 3,
      healthySources: 2,
      totalQueries: 5,
      healthyQueries: 4,
      totalReactions: 2,
      healthyReactions: 1,
    }
    mockUseCache.mockReturnValue(makeCacheResult({ data: rich }))
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.data.overallHealth).toBe('degraded')
    expect(result.current.data.totalSources).toBe(3)
    expect(result.current.data.healthySources).toBe(2)
  })
})
