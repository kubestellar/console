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

import { useCachedFlatcar, __testables } from '../useCachedFlatcar'
import { FLATCAR_DEMO_DATA, type FlatcarNode, type FlatcarChannel } from '../../lib/demo/flatcar'

const { computeStats, deriveHealth, buildFlatcarStatus, dedupeChannels } = __testables

const makeNode = (overrides: Partial<FlatcarNode> = {}): FlatcarNode => ({
    name: 'node-1',
    cluster: 'c1',
    osImage: 'Flatcar Container Linux',
    currentVersion: '3815.2.0',
    availableVersion: null,
    channel: 'stable',
    state: 'up-to-date',
    rebootRequired: false,
    lastCheckTime: new Date().toISOString(),
    ...overrides,
})

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', nodes: [], stats: { totalNodes: 0, upToDateNodes: 0, updateAvailableNodes: 0, rebootRequiredNodes: 0, channelsInUse: [] }, summary: { latestStableVersion: '', latestBetaVersion: '', totalClusters: 0 }, lastCheckTime: '' },
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

describe('useCachedFlatcar', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: FLATCAR_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.data.nodes.length).toBeGreaterThan(0)
    })

    it('respects isLoading state — isDemoData false during loading', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedFlatcar())
        expect(result.current.isLoading).toBe(true)
        expect(result.current.isDemoData).toBe(false)
    })
})

describe('__testables.dedupeChannels', () => {
    it('removes duplicate channels', () => {
        const channels: FlatcarChannel[] = ['stable', 'beta', 'stable', 'alpha', 'beta']
        expect(dedupeChannels(channels)).toEqual(['stable', 'beta', 'alpha'])
    })

    it('handles empty array', () => {
        expect(dedupeChannels([])).toEqual([])
    })
})

describe('__testables.computeStats', () => {
    it('returns zeroed stats for empty nodes', () => {
        const s = computeStats([])
        expect(s.totalNodes).toBe(0)
        expect(s.upToDateNodes).toBe(0)
        expect(s.updateAvailableNodes).toBe(0)
        expect(s.rebootRequiredNodes).toBe(0)
        expect(s.channelsInUse).toEqual([])
    })

    it('counts node states and channels', () => {
        const nodes = [
            makeNode({ state: 'up-to-date', channel: 'stable' }),
            makeNode({ state: 'update-available', channel: 'beta', rebootRequired: true }),
            makeNode({ state: 'up-to-date', channel: 'stable' }),
        ]
        const s = computeStats(nodes)
        expect(s.totalNodes).toBe(3)
        expect(s.upToDateNodes).toBe(2)
        expect(s.updateAvailableNodes).toBe(1)
        expect(s.rebootRequiredNodes).toBe(1)
        expect(s.channelsInUse).toEqual(['stable', 'beta'])
    })
})

describe('__testables.deriveHealth', () => {
    it('returns not-installed for empty nodes', () => {
        expect(deriveHealth([], { totalNodes: 0, upToDateNodes: 0, updateAvailableNodes: 0, rebootRequiredNodes: 0, channelsInUse: [] })).toBe('not-installed')
    })

    it('returns healthy when all up-to-date and no reboots', () => {
        const nodes = [makeNode()]
        const stats = computeStats(nodes)
        expect(deriveHealth(nodes, stats)).toBe('healthy')
    })

    it('returns degraded when updates available', () => {
        const nodes = [makeNode({ state: 'update-available' })]
        const stats = computeStats(nodes)
        expect(deriveHealth(nodes, stats)).toBe('degraded')
    })

    it('returns degraded when reboot required', () => {
        const nodes = [makeNode({ rebootRequired: true })]
        const stats = computeStats(nodes)
        expect(deriveHealth(nodes, stats)).toBe('degraded')
    })
})

describe('__testables.buildFlatcarStatus', () => {
    it('builds complete status with nodes and summary', () => {
        const nodes = [makeNode()]
        const summary = { latestStableVersion: '3815.2.0', latestBetaVersion: '3850.0.0', totalClusters: 1 }
        const status = buildFlatcarStatus(nodes, summary)
        expect(status.health).toBe('healthy')
        expect(status.nodes).toHaveLength(1)
        expect(status.stats.totalNodes).toBe(1)
        expect(status.summary.latestStableVersion).toBe('3815.2.0')
    })

    it('returns not-installed for empty nodes', () => {
        const summary = { latestStableVersion: '', latestBetaVersion: '', totalClusters: 0 }
        expect(buildFlatcarStatus([], summary).health).toBe('not-installed')
    })
})
