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

// useCachedRook imports createCachedHook from '../lib/cache' (above mock covers it)
vi.mock('../lib/demo/rook', () => ({
    ROOK_DEMO_DATA: {
        health: 'degraded',
        clusters: [],
        summary: { totalClusters: 0, healthyClusters: 0, degradedClusters: 0, totalOsdUp: 0, totalOsdTotal: 0, totalCapacityBytes: 0, totalUsedBytes: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({
    authFetch: vi.fn(),
}))

import { useCachedRook } from './useCachedRook'

const BASE_ROOK = {
    data: { health: 'healthy' as const, clusters: [], summary: { totalClusters: 1, healthyClusters: 1, degradedClusters: 0, totalOsdUp: 3, totalOsdTotal: 3, totalCapacityBytes: 1000, totalUsedBytes: 200 }, lastCheckTime: '2026-01-01T00:00:00Z' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedRook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_ROOK)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_ROOK, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_ROOK, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
