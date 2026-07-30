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

vi.mock('./useCachedData/demoData', () => ({
    getDemoCiliumStatus: () => ({
        status: 'Healthy',
        nodes: [{ name: 'node-1', status: 'Healthy', version: '1.14.4' }],
        networkPolicies: 42,
        endpoints: 156,
        hubble: { enabled: true, flowsPerSecond: 1250, metrics: { forwarded: 1245000, dropped: 1500 } },
    }),
}))

import { useCachedCiliumStatus } from './useCachedCiliumStatus'

const BASE_RESULT = {
    data: { status: 'Healthy', nodes: [], networkPolicies: 10, endpoints: 50, hubble: { enabled: true, flowsPerSecond: 100, metrics: { forwarded: 100, dropped: 0 } } },
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

describe('useCachedCiliumStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_RESULT)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.data.status).toBe('Healthy')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_RESULT, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_RESULT, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
