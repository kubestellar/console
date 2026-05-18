import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockHookResult = vi.fn()

vi.mock('../lib/cache/createCardCachedHook', () => ({
    createCardCachedHook: (_config: Record<string, unknown>) => {
        return () => mockHookResult()
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedLinkerd } from './useCachedLinkerd'

const BASE = {
    data: {
        health: 'healthy' as const,
        meshedDeployments: [],
        stats: { totalRPS: 4200, successRate: 99.8, p50LatencyMs: 8, p99LatencyMs: 45 },
        summary: { totalDeployments: 12, meshedDeployments: 12, unmeshedDeployments: 0, totalRPS: 4200, successRate: 99.8 },
        lastCheckTime: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 1000000000,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
}

describe('useCachedLinkerd', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHookResult.mockReturnValue(BASE)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedLinkerd())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.summary.meshedDeployments).toBe(12)
        expect(result.current.isDemoData).toBe(false)
    })

    it('surfaces isDemoData when cache reports demo fallback', () => {
        mockHookResult.mockReturnValue({ ...BASE, isDemoData: true, isFailed: true, consecutiveFailures: 1 })
        const { result } = renderHook(() => useCachedLinkerd())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('shows skeleton during loading', () => {
        mockHookResult.mockReturnValue({ ...BASE, isLoading: true, showSkeleton: true })
        const { result } = renderHook(() => useCachedLinkerd())
        expect(result.current.showSkeleton).toBe(true)
    })

    it('shows empty state when not installed', () => {
        mockHookResult.mockReturnValue({ ...BASE, showEmptyState: true })
        const { result } = renderHook(() => useCachedLinkerd())
        expect(result.current.showEmptyState).toBe(true)
    })
})
