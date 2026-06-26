import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => mockUseCache(args),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

import { useChaosMeshStatus } from '../useChaosMeshStatus'

const refetch = vi.fn(async () => {})

describe('useChaosMeshStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: {
        summary: { totalExperiments: 0, running: 0, finished: 0, failed: 0 },
        experiments: [],
        workflows: [],
        health: 'not-installed',
      },
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  it('uses realtime cache refresh for live chaos state', () => {
    renderHook(() => useChaosMeshStatus())

    expect(mockUseCache).toHaveBeenCalledWith(expect.objectContaining({
      key: 'chaos-mesh-status',
      category: 'realtime',
    }))
  })

  it('exposes cache refetch so the card refresh button triggers a live fetch', () => {
    const { result } = renderHook(() => useChaosMeshStatus())

    expect(result.current.refetch).toBe(refetch)
  })
})
