import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/cache')>()
    return {
        ...actual,
        useCache: (args: unknown) => mockUseCache(args),
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

import { useCachedCiliumStatus } from '../useCachedCiliumStatus'

describe('useCachedCiliumStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
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
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.data.status).toBe('Healthy')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when useCache reports demo fallback', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
            clearAndRefetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: false,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
            clearAndRefetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isLoading).toBe(true)
    })

    it('isDemoFallback is false during loading even when demo data exists', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
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
        const { result } = renderHook(() => useCachedCiliumStatus())
        // Factory applies isDemoFallback && !isLoading
        expect(result.current.isDemoFallback).toBe(false)
    })
})
