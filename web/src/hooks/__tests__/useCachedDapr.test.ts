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

import { useCachedDapr } from '../useCachedDapr'

describe('useCachedDapr', () => {
    const defaultData = {
        health: 'not-installed',
        controlPlane: [],
        components: [],
        apps: { total: 0, namespaces: 0 },
        buildingBlocks: { stateStores: 0, pubsubs: 0, bindings: 0 },
        summary: { totalControlPlanePods: 0, runningControlPlanePods: 0, totalComponents: 0, totalDaprApps: 0 },
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
        const { result } = renderHook(() => useCachedDapr())
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
        const { result } = renderHook(() => useCachedDapr())
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
        const { result } = renderHook(() => useCachedDapr())
        expect(result.current.isLoading).toBe(true)
    })

    it('passes correct cache key to useCache', () => {
        renderHook(() => useCachedDapr())
        expect(mockUseCache).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'dapr-status' })
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
        const { result } = renderHook(() => useCachedDapr())
        expect(result.current.isDemoData).toBe(false)
    })

    it('exposes showSkeleton and showEmptyState from useCardLoadingState', () => {
        const { result } = renderHook(() => useCachedDapr())
        expect(result.current.showSkeleton).toBe(false)
        expect(result.current.showEmptyState).toBe(false)
    })

    it('sets error true when isFailed and no data', () => {
        mockUseCache.mockReturnValue({
            data: { ...defaultData, health: 'healthy', controlPlane: [], components: [] },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: true,
            consecutiveFailures: 3,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedDapr())
        expect(result.current.isFailed).toBe(true)
    })
})
