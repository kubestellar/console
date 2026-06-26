import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockHookResult = vi.fn()

vi.mock('../lib/cache/createCardCachedHook', () => ({
    createCardCachedHook: (_config: Record<string, unknown>) => {
        return () => mockHookResult()
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedStrimzi } from './useCachedStrimzi'

const BASE = {
    data: {
        health: 'healthy' as const,
        clusters: [],
        summary: { totalClusters: 2, healthyClusters: 2, totalBrokers: 6, readyBrokers: 6 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 1100000000,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
}

describe('useCachedStrimzi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHookResult.mockReturnValue(BASE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.totalClusters).toBe(2)
        expect(result.current.isDemoData).toBe(false)
    })

    it('surfaces isDemoData when cache reports demo fallback', () => {
        mockHookResult.mockReturnValue({ ...BASE, isDemoData: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('shows skeleton during loading', () => {
        mockHookResult.mockReturnValue({ ...BASE, isLoading: true, showSkeleton: true })
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.showSkeleton).toBe(true)
    })

    it('exposes lastRefresh value', () => {
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.lastRefresh).toBe(1100000000)
    })
})
