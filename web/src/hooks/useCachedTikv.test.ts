import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../lib/cache', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/cache')>()
    return {
        ...actual,
        useCache: (options: unknown) => mockUseCache(options),
        createCachedHook: (_config: Record<string, unknown>) => {
            return () => {
                const result = mockUseCache(_config)
                return {
                    data: result.data,
                    isLoading: result.isLoading,
                    isRefreshing: result.isRefreshing,
                    isDemoFallback: result.isDemoFallback && !result.isLoading,
                    error: result.error,
                    isFailed: result.isFailed,
                    consecutiveFailures: result.consecutiveFailures,
                    lastRefresh: result.lastRefresh,
                    refetch: result.refetch,
                }
            }
        },
    }
})

vi.mock('../lib/demo/tikv', () => ({
    TIKV_DEMO_DATA: {
        health: 'degraded',
        stores: [],
        summary: { totalStores: 0, upStores: 0, downStores: 0, totalRegions: 0, totalLeaders: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedTikv } from './useCachedTikv'

const BASE_TIKV = {
    data: {
        health: 'healthy' as const,
        stores: [],
        summary: {
            totalStores: 3,
            upStores: 3,
            downStores: 0,
            totalRegions: 96,
            totalLeaders: 96,
        },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 400000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedTikv', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_TIKV)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.totalStores).toBe(3)
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_TIKV, isDemoFallback: true, isFailed: true, consecutiveFailures: 2 })
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.consecutiveFailures).toBe(2)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_TIKV, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })

    it('exposes error state', () => {
        const err = new Error('fetch failed')
        mockUseCache.mockReturnValue({ ...BASE_TIKV, error: err, isFailed: true })
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.error).toBe(err)
        expect(result.current.isFailed).toBe(true)
    })
})
