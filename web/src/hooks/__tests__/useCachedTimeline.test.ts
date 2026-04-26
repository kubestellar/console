import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
  useCache: (args: unknown) => mockUseCache(args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../components/cards/change_timeline/demoData', () => ({
  getDemoTimelineEvents: () => [
    { id: 'demo-1', type: 'deploy', cluster: 'demo-cluster', timestamp: '2024-01-01T00:00:00Z' },
  ],
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

import { useCachedTimeline } from '../useCachedTimeline'

describe('useCachedTimeline', () => {
  const defaultCacheReturn = {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockUseCache.mockReturnValue({ ...defaultCacheReturn })
  })

  it('returns data from cache when not in demo mode', () => {
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.data).toEqual([])
    expect(result.current.isDemoData).toBe(false)
  })

  it('passes cache key with default range', () => {
    renderHook(() => useCachedTimeline())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining('change_timeline_events_'),
      }),
    )
  })

  it('uses custom rangeMs in cache key', () => {
    const CUSTOM_RANGE = 7200000
    renderHook(() => useCachedTimeline(CUSTOM_RANGE))
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `change_timeline_events_${CUSTOM_RANGE}`,
      }),
    )
  })

  it('returns demo data in demo mode', () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.data.length).toBeGreaterThan(0)
  })

  it('isDemoData is false during loading even when isDemoFallback is true', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.isDemoData).toBe(false)
  })

  it('isDemoData is true when isDemoFallback and not loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.isDemoData).toBe(true)
  })

  it('respects isLoading state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.isLoading).toBe(true)
  })

  it('exposes failure state', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      isFailed: true,
      consecutiveFailures: 5,
    })
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(5)
  })

  it('provides refetch function', () => {
    const mockRefetch = vi.fn()
    mockUseCache.mockReturnValue({
      ...defaultCacheReturn,
      refetch: mockRefetch,
    })
    const { result } = renderHook(() => useCachedTimeline())
    expect(result.current.refetch).toBe(mockRefetch)
  })
})
