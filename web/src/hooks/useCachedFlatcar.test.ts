import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockHookResult = vi.fn()

vi.mock('../lib/cache/createCardCachedHook', () => ({
    createCardCachedHook: (_config: Record<string, unknown>) => {
        return () => mockHookResult()
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedFlatcar } from './useCachedFlatcar'

const BASE = {
    data: {
        health: 'healthy' as const,
        nodes: [],
        stats: { totalNodes: 4, upToDateNodes: 4, updateAvailableNodes: 0, rebootRequiredNodes: 0, channelsInUse: [] },
        summary: { latestStableVersion: '3975.2.2', latestBetaVersion: '4012.0.0', totalClusters: 1, stats: { totalNodes: 4, upToDateNodes: 4, updateAvailableNodes: 0, rebootRequiredNodes: 0, channelsInUse: [] } },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 700000000,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
}

describe('useCachedFlatcar', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHookResult.mockReturnValue(BASE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.isDemoData).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoData when cache reports demo fallback', () => {
        mockHookResult.mockReturnValue({ ...BASE, isDemoData: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('shows skeleton during loading', () => {
        mockHookResult.mockReturnValue({ ...BASE, isLoading: true, showSkeleton: true })
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.showSkeleton).toBe(true)
    })

    it('surfaces error state', () => {
        mockHookResult.mockReturnValue({ ...BASE, isFailed: true, error: true })
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.error).toBe(true)
    })
})
