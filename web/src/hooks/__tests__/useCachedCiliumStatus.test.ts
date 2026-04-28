import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    useCache: (args: any) => mockUseCache(args),
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

import { useCachedCiliumStatus } from '../useCachedCiliumStatus'

describe('useCachedCiliumStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
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
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.data.status).toBe('Healthy')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.data.nodes.length).toBeGreaterThan(0)
        // Check that one of the demo nodes is present (e.g. kind-worker)
        expect(result.current.data.nodes.some((n: any) => n.name.includes('node') || n.name.includes('kind'))).toBe(true)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', nodes: [] },
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedCiliumStatus())
        expect(result.current.isLoading).toBe(true)
    })
})
