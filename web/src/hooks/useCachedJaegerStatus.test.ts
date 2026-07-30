import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../lib/cache', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/cache')>()
    return {
        ...actual,
        useCache: (options: unknown) => mockUseCache(options),
        createCachedHook: (config: Record<string, unknown>) => {
            return () => {
                const result = mockUseCache(config)
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

// Mock demo data for the jaeger status hook
vi.mock('./useCachedData/demoData', () => ({
    getDemoJaegerStatus: () => ({
        status: 'Healthy',
        version: 'demo-1.0',
        collectors: { count: 1, status: 'Healthy', items: [] },
        query: { status: 'Healthy' },
        metrics: {
            servicesCount: 0,
            tracesLastHour: 0,
            dependenciesCount: 0,
            avgLatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            spansDroppedLastHour: 0,
            avgQueueLength: 0,
        },
    }),
}))

import { useCachedJaegerStatus } from './useCachedJaegerStatus'

describe('useCachedJaegerStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: '1.57.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
            clearAndRefetch: vi.fn(),
        })
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.data.version).toBe('1.57.0')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when useCache reports demo fallback', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: 'demo-1.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: true,
            consecutiveFailures: 1,
            lastRefresh: null,
            refetch: vi.fn(),
            clearAndRefetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({
            data: null,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
            clearAndRefetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        // Factory applies isDemoFallback && !isLoading
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
