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
    useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
}))

import { useCachedGrpc, __testables } from '../useCachedGrpc'
import { GRPC_DEMO_DATA, type GrpcService, type GrpcStats } from '../../components/cards/grpc_status/demoData'

const { summarize, deriveHealth, buildGrpcStatus } = __testables

const EMPTY_STATS: GrpcStats = { totalRps: 0, avgLatencyP99Ms: 0, avgErrorRatePct: 0, reflectionEnabled: 0 }

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', services: [], stats: EMPTY_STATS, summary: { totalServices: 0, servingServices: 0, totalEndpoints: 0 }, lastCheckTime: '' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
    ...overrides,
})

describe('useCachedGrpc', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: GRPC_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.data.services.length).toBeGreaterThan(0)
    })

    it('respects isLoading state — isDemoData should be false during loading', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.isLoading).toBe(true)
        expect(result.current.isDemoData).toBe(false)
    })

    it('sets error to true when isFailed and no data', () => {
        mockUseCache.mockReturnValue(makeCacheResult({
            data: { health: 'degraded', services: [], stats: EMPTY_STATS, summary: { totalServices: 0, servingServices: 0, totalEndpoints: 0 }, lastCheckTime: '' },
            isFailed: true,
        }))
        const { result } = renderHook(() => useCachedGrpc())
        expect(result.current.error).toBe(true)
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty services', () => {
        const s = summarize([])
        expect(s.totalServices).toBe(0)
        expect(s.servingServices).toBe(0)
        expect(s.totalEndpoints).toBe(0)
    })

    it('counts serving services and endpoints', () => {
        const services = [
            { status: 'serving', endpoints: 3 },
            { status: 'not-serving', endpoints: 2 },
        ] as GrpcService[]
        const s = summarize(services)
        expect(s.totalServices).toBe(2)
        expect(s.servingServices).toBe(1)
        expect(s.totalEndpoints).toBe(5)
    })
})

describe('__testables.deriveHealth', () => {
    it('returns not-installed for empty services', () => {
        expect(deriveHealth([])).toBe('not-installed')
    })

    it('returns healthy when all serving', () => {
        expect(deriveHealth([{ status: 'serving' }] as GrpcService[])).toBe('healthy')
    })

    it('returns degraded when any not serving', () => {
        expect(deriveHealth([
            { status: 'serving' },
            { status: 'not-serving' },
        ] as GrpcService[])).toBe('degraded')
    })
})

describe('__testables.buildGrpcStatus', () => {
    it('builds full status with services and stats', () => {
        const services = [{ status: 'serving', endpoints: 2, name: 'svc1', namespace: 'ns', rps: 10, latencyP99Ms: 5, errorRatePct: 0, cluster: 'c1' }] as GrpcService[]
        const stats: GrpcStats = { totalRps: 10, avgLatencyP99Ms: 5, avgErrorRatePct: 0, reflectionEnabled: 1 }
        const result = buildGrpcStatus(services, stats)
        expect(result.health).toBe('healthy')
        expect(result.services).toHaveLength(1)
        expect(result.summary.totalEndpoints).toBe(2)
        expect(result.stats.totalRps).toBe(10)
    })

    it('returns not-installed for empty services', () => {
        expect(buildGrpcStatus([], EMPTY_STATS).health).toBe('not-installed')
    })
})
