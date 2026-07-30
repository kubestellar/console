import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
// useCachedSpire imports createCachedHook from '../lib/cache/createCachedHook' directly
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

vi.mock('../lib/demo/spire', () => ({
    SPIRE_DEMO_DATA: {
        health: 'degraded',
        version: '1.0.0',
        trustDomain: 'example.org',
        serverPods: [],
        agentDaemonSet: { desired: 0, ready: 0 },
        summary: { registrationEntries: 0, attestedAgents: 0 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
}))

vi.mock('../lib/api', () => ({
    authFetch: vi.fn(),
}))

import { useCachedSpire } from './useCachedSpire'

const BASE_SPIRE = {
    data: { health: 'healthy' as const, version: '1.9.0', trustDomain: 'prod.example.org', serverPods: [], agentDaemonSet: { desired: 3, ready: 3 }, summary: { registrationEntries: 10, attestedAgents: 3 }, lastCheckTime: '2026-01-01T00:00:00Z' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 555555555,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedSpire', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_SPIRE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedSpire())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.trustDomain).toBe('prod.example.org')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_SPIRE, isDemoFallback: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedSpire())
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_SPIRE, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedSpire())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
