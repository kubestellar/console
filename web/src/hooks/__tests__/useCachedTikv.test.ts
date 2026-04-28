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

import { useCachedTikv, __testables } from '../useCachedTikv'
import { TIKV_DEMO_DATA, type TikvStore } from '../../lib/demo/tikv'

const { isTikvPod, parseIntOrZero, deriveStoreState, parseVersion, podToStore, summarize, buildStatus } = __testables

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', stores: [], summary: { totalStores: 0, upStores: 0, downStores: 0, totalRegions: 0, totalLeaders: 0 }, lastCheckTime: '' },
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

describe('useCachedTikv', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: TIKV_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.data.stores.length).toBeGreaterThan(0)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedTikv())
        expect(result.current.isLoading).toBe(true)
    })
})

describe('__testables.isTikvPod', () => {
    it('detects pod by label app.kubernetes.io/component', () => {
        expect(isTikvPod({ name: 'x', metadata: { labels: { 'app.kubernetes.io/component': 'tikv' } } })).toBe(true)
    })

    it('detects pod by name prefix tikv-', () => {
        expect(isTikvPod({ name: 'tikv-0' })).toBe(true)
    })

    it('detects pod by name containing -tikv-', () => {
        expect(isTikvPod({ name: 'tc-tikv-0' })).toBe(true)
    })

    it('rejects non-tikv pod', () => {
        expect(isTikvPod({ name: 'redis-0', metadata: { labels: { app: 'redis' } } })).toBe(false)
    })
})

describe('__testables.parseIntOrZero', () => {
    it('parses valid integer', () => {
        expect(parseIntOrZero('42')).toBe(42)
    })

    it('returns 0 for undefined', () => {
        expect(parseIntOrZero(undefined)).toBe(0)
    })

    it('returns 0 for non-numeric string', () => {
        expect(parseIntOrZero('abc')).toBe(0)
    })
})

describe('__testables.deriveStoreState', () => {
    it('returns Up when Running and all containers ready', () => {
        expect(deriveStoreState({ name: 'a', status: { phase: 'Running', containerStatuses: [{ ready: true }] } })).toBe('Up')
    })

    it('returns Down when Running but containers not ready', () => {
        expect(deriveStoreState({ name: 'a', status: { phase: 'Running', containerStatuses: [{ ready: false }] } })).toBe('Down')
    })

    it('returns Offline when Pending', () => {
        expect(deriveStoreState({ name: 'a', status: { phase: 'Pending' } })).toBe('Offline')
    })

    it('returns Down when Failed', () => {
        expect(deriveStoreState({ name: 'a', status: { phase: 'Failed' } })).toBe('Down')
    })
})

describe('__testables.parseVersion', () => {
    it('extracts version tag from tikv container image', () => {
        const pod = { name: 'tikv-0', status: { containerStatuses: [{ name: 'tikv', image: 'pingcap/tikv:v7.5.1' }] } }
        expect(parseVersion(pod)).toBe('v7.5.1')
    })

    it('returns empty for pod with no containers', () => {
        expect(parseVersion({ name: 'tikv-0' })).toBe('')
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty stores', () => {
        const s = summarize([])
        expect(s.totalStores).toBe(0)
        expect(s.upStores).toBe(0)
        expect(s.downStores).toBe(0)
    })

    it('aggregates store stats', () => {
        const stores = [
            { state: 'Up', regionCount: 10, leaderCount: 5 },
            { state: 'Down', regionCount: 8, leaderCount: 3 },
        ] as TikvStore[]
        const s = summarize(stores)
        expect(s.totalStores).toBe(2)
        expect(s.upStores).toBe(1)
        expect(s.downStores).toBe(1)
        expect(s.totalRegions).toBe(18)
        expect(s.totalLeaders).toBe(8)
    })
})

describe('__testables.buildStatus', () => {
    it('returns not-installed for empty stores', () => {
        expect(buildStatus([]).health).toBe('not-installed')
    })

    it('returns healthy when all stores are Up', () => {
        const stores = [{ state: 'Up', regionCount: 0, leaderCount: 0 }] as TikvStore[]
        expect(buildStatus(stores).health).toBe('healthy')
    })

    it('returns degraded when any store is Down', () => {
        const stores = [
            { state: 'Up', regionCount: 0, leaderCount: 0 },
            { state: 'Down', regionCount: 0, leaderCount: 0 },
        ] as TikvStore[]
        expect(buildStatus(stores).health).toBe('degraded')
    })
})
