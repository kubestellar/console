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

vi.mock('./useCachedThanosStatus', async (importOriginal) => {
    // getDemoThanosStatus is defined inline in the hook file — no separate mock module.
    return importOriginal()
})

import { useCachedThanosStatus } from './useCachedThanosStatus'

const BASE_THANOS = {
    data: {
        targets: [],
        storeGateways: [],
        queryHealth: 'healthy' as const,
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 111111111,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedThanosStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_THANOS)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedThanosStatus())
        expect(result.current.data.queryHealth).toBe('healthy')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_THANOS, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedThanosStatus())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_THANOS, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedThanosStatus())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
