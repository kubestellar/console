import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock useCache (the hook wraps this)
const mockUseCache = vi.fn()
vi.mock('../lib/cache', () => ({
    useCache: (options: any) => mockUseCache(options),
    createCachedHook: vi.fn((_config: unknown) => () => mockUseCache(_config)),
}))

// Mock useDemoMode — the hook actually imports `useDemoMode` from `./useDemoMode`,
// NOT `isDemoMode` directly from `../lib/demoMode`. Mocking `../lib/demoMode` would
// break transitive imports (e.g. `isNetlifyDeployment` is used by `hooks/mcp/shared.ts`).
const mockIsDemoMode = vi.fn(() => false)
vi.mock('./useDemoMode', () => ({
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

// Mock demo data for the jaeger status hook
vi.mock('./useCachedData/demoData', () => ({
    getDemoJaegerStatus: () => ({
        status: 'Healthy',
        version: 'demo-1.0',
        collectors: { count: 1, status: 'Healthy', items: [] },
        query: { status: 'Healthy' },
        metrics: {
            servicesCount: 0,
            tracesLastHour: 0,
            dependenciesCount: 0,
            avgLatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            spansDroppedLastHour: 0,
            avgQueueLength: 0,
        },
    }),
}))

import { useCachedJaegerStatus } from './useCachedJaegerStatus'

describe('useCachedJaegerStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: '1.57.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
        })
    })

    it('returns live data when not in demo mode', () => {
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.data.version).toBe('1.57.0')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when in demo mode', () => {
        mockIsDemoMode.mockReturnValue(true)
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.data.version).toBe('demo-1.0')
        expect(result.current.isDemoData).toBe(true)
    })

    it('identifies demo fallback when API fails', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: 'demo-1.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true, // Cache layer signaled fallback
            isFailed: true,
            consecutiveFailures: 1,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.isDemoData).toBe(true)
    })

    it('does not show demo data while loading', () => {
        mockUseCache.mockReturnValue({
            data: null,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: true,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.isDemoData).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
