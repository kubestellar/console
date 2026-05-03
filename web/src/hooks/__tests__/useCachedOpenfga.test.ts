import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
    useCache: (args: any) => mockUseCache(args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
    useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
    isDemoModeForced: () => false,
    canToggleDemoMode: () => true,
    isNetlifyDeployment: () => false,
    isDemoToken: () => false,
    hasRealToken: () => true,
    setDemoToken: vi.fn(),
    getDemoMode: () => false,
    setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
    useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
    useCardDemoState: vi.fn(),
}))

import { useCachedOpenfga } from '../useCachedOpenfga'

describe('useCachedOpenfga', () => {
    const defaultData = {
        health: 'not-installed',
        stores: [],
        models: [],
        stats: {
            totalTuples: 0, totalStores: 0, totalModels: 0,
            serverVersion: 'unknown',
            rps: { check: 0, expand: 0, listObjects: 0 },
            latency: { p50: 0, p95: 0, p99: 0 },
        },
        summary: { endpoint: '', totalTuples: 0, totalStores: 0, totalModels: 0, serverVersion: 'unknown' },
        lastCheckTime: '2024-01-01T00:00:00.000Z',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
        })
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedOpenfga())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when isDemoFallback is true and not loading', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedOpenfga())
        expect(result.current.isDemoData).toBe(true)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedOpenfga())
        expect(result.current.isLoading).toBe(true)
    })

    it('passes correct cache key to useCache', () => {
        renderHook(() => useCachedOpenfga())
        expect(mockUseCache).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'openfga-status' })
        )
    })

    it('isDemoData is false during loading even when isDemoFallback is true', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: true,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedOpenfga())
        expect(result.current.isDemoData).toBe(false)
    })

    it('exposes showSkeleton and showEmptyState', () => {
        const { result } = renderHook(() => useCachedOpenfga())
        expect(result.current.showSkeleton).toBe(false)
        expect(result.current.showEmptyState).toBe(false)
    })
})
