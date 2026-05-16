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

vi.mock('../lib/demo/otel', () => ({
    OTEL_DEMO_DATA: {
        health: 'healthy',
        collectors: [],
        summary: {
            totalCollectors: 0, runningCollectors: 0, degradedCollectors: 0,
            totalPipelines: 0, healthyPipelines: 0,
            uniqueReceivers: [], uniqueExporters: [],
            totalSpansAccepted: 0, totalSpansDropped: 0,
            totalMetricsAccepted: 0, totalMetricsDropped: 0,
            totalLogsAccepted: 0, totalLogsDropped: 0,
            totalExportErrors: 0,
        },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedOtel } from './useCachedOtel'

const BASE_OTEL = {
    data: {
        health: 'healthy' as const,
        collectors: [],
        summary: {
            totalCollectors: 2,
            runningCollectors: 2,
            degradedCollectors: 0,
            totalPipelines: 4,
            healthyPipelines: 4,
            uniqueReceivers: ['otlp', 'prometheus'],
            uniqueExporters: ['otlphttp/tempo', 'prometheusremotewrite/mimir'],
            totalSpansAccepted: 50000,
            totalSpansDropped: 5,
            totalMetricsAccepted: 200000,
            totalMetricsDropped: 0,
            totalLogsAccepted: 80000,
            totalLogsDropped: 2,
            totalExportErrors: 1,
        },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 300000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedOtel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_OTEL)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedOtel())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.totalCollectors).toBe(2)
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_OTEL, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedOtel())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_OTEL, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedOtel())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })

    it('exposes isRefreshing state', () => {
        mockUseCache.mockReturnValue({ ...BASE_OTEL, isRefreshing: true })
        const { result } = renderHook(() => useCachedOtel())
        expect(result.current.isRefreshing).toBe(true)
    })
})
