import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
    useCache: (args: Record<string, unknown>) => mockUseCache(args),
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

import { useCachedBackstage } from '../useCachedBackstage'

describe('useCachedBackstage', () => {
    const defaultData = {
        health: 'not-installed',
        version: 'unknown',
        replicas: 0,
        desiredReplicas: 0,
        catalog: { Component: 0, API: 0, System: 0, Domain: 0, Resource: 0, User: 0, Group: 0 },
        plugins: [],
        templates: [],
        lastCatalogSync: '2024-01-01T00:00:00.000Z',
        lastCheckTime: '2024-01-01T00:00:00.000Z',
        summary: { totalEntities: 0, enabledPlugins: 0, pluginErrors: 0, scaffolderTemplates: 0 },
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
        const { result } = renderHook(() => useCachedBackstage())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('returns isDemoFallback true when demo fallback and not loading', () => {
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
        const { result } = renderHook(() => useCachedBackstage())
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
        const { result } = renderHook(() => useCachedBackstage())
        expect(result.current.isLoading).toBe(true)
    })

    it('passes correct cache key to useCache', () => {
        renderHook(() => useCachedBackstage())
        expect(mockUseCache).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'backstage-status' })
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
        const { result } = renderHook(() => useCachedBackstage())
        expect(result.current.error).toBe(testError)
        expect(result.current.isFailed).toBe(true)
    })
})
