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

vi.mock('../lib/demo/longhorn', () => ({
    LONGHORN_DEMO_DATA: {
        health: 'degraded',
        volumes: [],
        nodes: [],
        summary: { totalVolumes: 0, healthyVolumes: 0, degradedVolumes: 0, faultedVolumes: 0, totalNodes: 0, readyNodes: 0, schedulableNodes: 0, totalCapacityBytes: 0, totalUsedBytes: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedLonghorn } from './useCachedLonghorn'

const BASE_LONGHORN = {
    data: {
        health: 'healthy' as const,
        volumes: [],
        nodes: [],
        summary: {
            totalVolumes: 4,
            healthyVolumes: 4,
            degradedVolumes: 0,
            faultedVolumes: 0,
            totalNodes: 3,
            readyNodes: 3,
            schedulableNodes: 3,
            totalCapacityBytes: 107374182400,
            totalUsedBytes: 21474836480,
        },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 200000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedLonghorn', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_LONGHORN)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedLonghorn())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.totalVolumes).toBe(4)
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_LONGHORN, isDemoFallback: true, isFailed: true, consecutiveFailures: 3 })
        const { result } = renderHook(() => useCachedLonghorn())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.consecutiveFailures).toBe(3)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_LONGHORN, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedLonghorn())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })

    it('exposes isRefreshing state', () => {
        mockUseCache.mockReturnValue({ ...BASE_LONGHORN, isRefreshing: true })
        const { result } = renderHook(() => useCachedLonghorn())
        expect(result.current.isRefreshing).toBe(true)
    })
})
