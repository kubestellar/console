import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    useCache: (args: Record<string, unknown>) => mockUseCache(args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
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
    useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
}))

vi.mock('../../lib/api', () => ({
    authFetch: vi.fn(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
  }
})

vi.mock('../../lib/constants/network', () => ({
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

import { useCachedKeda } from '../useCachedKeda'

describe('useCachedKeda', () => {
    const defaultData = {
        health: 'not-installed',
        operatorPods: { ready: 0, total: 0 },
        scaledObjects: [],
        totalScaledJobs: 0,
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
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
        })
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedKeda())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('returns isDemoFallback from cache result', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedKeda())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: false,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedKeda())
        expect(result.current.loading).toBe(true)
    })

    it('passes correct cache key to useCache', () => {
        renderHook(() => useCachedKeda())
        expect(mockUseCache).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'keda-status' })
        )
    })

    it('forwards error from cache result', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            error: new Error('test'),
            isFailed: true,
            consecutiveFailures: 2,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedKeda())
        expect(result.current.error).toBe(true)
    })
})
