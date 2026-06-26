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

import { useCachedAttestation } from './useCachedAttestation'

const BASE_ATTEST = {
    data: { clusters: [], overallScore: 0, lastCheckTime: '2026-01-01T00:00:00Z' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 999999999,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedAttestation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_ATTEST)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedAttestation())
        expect(result.current.data.clusters).toEqual([])
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isFailed).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_ATTEST, isDemoFallback: true, isFailed: true, consecutiveFailures: 2 })
        const { result } = renderHook(() => useCachedAttestation())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.consecutiveFailures).toBe(2)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_ATTEST, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedAttestation())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })

    it('exposes score weight constants', async () => {
        const mod = await import('./useCachedAttestation')
        expect(mod.WEIGHT_IMAGE_PROVENANCE).toBe(30)
        expect(mod.WEIGHT_WORKLOAD_IDENTITY).toBe(25)
        expect(mod.WEIGHT_POLICY_COMPLIANCE).toBe(25)
        expect(mod.WEIGHT_PRIVILEGE_POSTURE).toBe(20)
    })

    it('exposes score threshold constants', async () => {
        const mod = await import('./useCachedAttestation')
        expect(mod.SCORE_THRESHOLD_HIGH).toBe(80)
        expect(mod.SCORE_THRESHOLD_MEDIUM).toBe(60)
    })
})
