import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockHookResult = vi.fn()

vi.mock('../lib/cache/createCardCachedHook', () => ({
    createCardCachedHook: (_config: Record<string, unknown>) => {
        return () => mockHookResult()
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedKserve } from './useCachedKserve'

const BASE = {
    data: {
        health: 'healthy' as const,
        controllerPods: { desired: 1, ready: 1 },
        services: [],
        summary: { totalServices: 5, readyServices: 5, totalModelsDeployed: 12, totalModelsFailed: 0, frameworksInUse: ['sklearn', 'xgboost'] },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 900000000,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
}

describe('useCachedKserve', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHookResult.mockReturnValue(BASE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedKserve())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.totalServices).toBe(5)
        expect(result.current.isDemoData).toBe(false)
    })

    it('surfaces isDemoData when cache reports demo fallback', () => {
        mockHookResult.mockReturnValue({ ...BASE, isDemoData: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedKserve())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('shows skeleton during loading', () => {
        mockHookResult.mockReturnValue({ ...BASE, isLoading: true, showSkeleton: true })
        const { result } = renderHook(() => useCachedKserve())
        expect(result.current.showSkeleton).toBe(true)
    })

    it('exposes refetch function', () => {
        const { result } = renderHook(() => useCachedKserve())
        expect(typeof result.current.refetch).toBe('function')
    })
})
