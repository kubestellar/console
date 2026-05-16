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

vi.mock('../lib/demo/vitess', () => ({
    VITESS_DEMO_DATA: {
        health: 'degraded',
        keyspaces: [],
        tablets: [],
        summary: { totalKeyspaces: 0, totalShards: 0, totalTablets: 0, primaryTablets: 0, replicaTablets: 0, rdonlyTablets: 0, servingTablets: 0, maxReplicationLagSeconds: 0 },
        vitessVersion: 'unknown',
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedVitess } from './useCachedVitess'

const BASE_VITESS = {
    data: {
        health: 'healthy' as const,
        keyspaces: [],
        tablets: [],
        summary: {
            totalKeyspaces: 2,
            totalShards: 4,
            totalTablets: 12,
            primaryTablets: 4,
            replicaTablets: 8,
            rdonlyTablets: 0,
            servingTablets: 12,
            maxReplicationLagSeconds: 0,
        },
        vitessVersion: 'v19.0.4',
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 500000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedVitess', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_VITESS)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedVitess())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.vitessVersion).toBe('v19.0.4')
        expect(result.current.data.summary.totalKeyspaces).toBe(2)
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_VITESS, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedVitess())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_VITESS, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedVitess())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })

    it('exposes lastRefresh value', () => {
        const { result } = renderHook(() => useCachedVitess())
        expect(result.current.lastRefresh).toBe(500000000)
    })
})
