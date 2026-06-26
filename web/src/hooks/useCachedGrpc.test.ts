import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockHookResult = vi.fn()

vi.mock('../lib/cache/createCardCachedHook', () => ({
    createCardCachedHook: (_config: Record<string, unknown>) => {
        return () => mockHookResult()
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedGrpc } from './useCachedGrpc'

const BASE = {
    data: {
        health: 'healthy' as const,
        services: [],
        stats: { totalServices: 3, servicesUp: 3, servicesDown: 0, totalRPCsPerSec: 1200, totalErrorRatePercent: 0.2 },
        summary: { totalServices: 3, servicesUp: 3, servicesDown: 0, totalRPCsPerSec: 1200, totalErrorRatePercent: 0.2 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 800000000,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
}

describe('useCachedGrpc', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHookResult.mockReturnValue(BASE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.isDemoData).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoData when cache reports demo fallback', () => {
        mockHookResult.mockReturnValue({ ...BASE, isDemoData: true, isFailed: true, consecutiveFailures: 2 })
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.consecutiveFailures).toBe(2)
    })

    it('shows skeleton during loading', () => {
        mockHookResult.mockReturnValue({ ...BASE, isLoading: true, showSkeleton: true })
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.showSkeleton).toBe(true)
    })

    it('shows empty state when no data', () => {
        mockHookResult.mockReturnValue({ ...BASE, showEmptyState: true })
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.showEmptyState).toBe(true)
    })
})
