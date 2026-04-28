import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
    useCache: (args: any) => mockUseCache(args),
    createCachedHook: (_config: unknown) => () => mockUseCache(_config),
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

import { useCachedSpire } from '../useCachedSpire'

describe('useCachedSpire', () => {
    const defaultData = {
        health: 'not-installed',
        version: 'unknown',
        trustDomain: '',
        serverPods: [],
        agentDaemonSet: null,
        summary: {
            registrationEntries: 0, attestedAgents: 0,
            trustBundleAgeHours: 0, serverReadyReplicas: 0,
            serverDesiredReplicas: 0,
        },
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
        const { result } = renderHook(() => useCachedSpire())
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
        const { result } = renderHook(() => useCachedSpire())
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
        const { result } = renderHook(() => useCachedSpire())
        expect(result.current.isLoading).toBe(true)
    })

    it('passes correct cache key to useCache', () => {
        renderHook(() => useCachedSpire())
        expect(mockUseCache).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'spire-status' })
        )
    })

    it('forwards error from cache result', () => {
        const testError = new Error('test')
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            error: testError,
            isFailed: true,
            consecutiveFailures: 2,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedSpire())
        expect(result.current.error).toBe(testError)
        expect(result.current.isFailed).toBe(true)
    })

    it('passes through isDemoFallback directly from cache', () => {
        mockUseCache.mockReturnValue({
            data: defaultData,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedSpire())
        // createCachedHook applies isDemoFallback && !isLoading guard:
        // when isLoading=true, isDemoFallback must be false (no demo data during load)
        expect(result.current.isDemoFallback).toBe(false)
    })
})
