import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../lib/cache/createCachedHook', () => ({
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
}))

vi.mock('../lib/demo/tuf', () => ({
    TUF_DEMO_DATA: {
        health: 'degraded',
        specVersion: '1.0.32',
        repository: 'tuf-repo.kubestellar.demo',
        roles: [],
        summary: { totalRoles: 0, signedRoles: 0, expiredRoles: 0, expiringSoonRoles: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedTuf } from './useCachedTuf'

const BASE_TUF = {
    data: {
        health: 'healthy' as const,
        specVersion: '1.0.32',
        repository: 'tuf-repo.prod.example.org',
        roles: [],
        summary: { totalRoles: 4, signedRoles: 4, expiredRoles: 0, expiringSoonRoles: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 600000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedTuf', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_TUF)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.repository).toBe('tuf-repo.prod.example.org')
        expect(result.current.data.summary.totalRoles).toBe(4)
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_TUF, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_TUF, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
