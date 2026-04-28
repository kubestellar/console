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

import { useCachedStrimzi, __testables } from '../useCachedStrimzi'
import { STRIMZI_DEMO_DATA, type StrimziKafkaCluster } from '../../components/cards/strimzi_status/demoData'

const { summarize, aggregateStats, deriveHealth, buildStrimziStatus } = __testables

const makeCluster = (overrides: Partial<StrimziKafkaCluster> = {}): StrimziKafkaCluster => ({
    name: 'kafka-cluster',
    namespace: 'kafka',
    cluster: 'c1',
    kafkaVersion: '3.7.0',
    health: 'healthy',
    brokers: { ready: 3, total: 3 },
    topics: [],
    consumerGroups: [],
    totalLag: 0,
    ...overrides,
})

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', clusters: [], stats: { clusterCount: 0, brokerCount: 0, topicCount: 0, consumerGroupCount: 0, totalLag: 0, operatorVersion: 'unknown' }, summary: { totalClusters: 0, healthyClusters: 0, totalBrokers: 0, readyBrokers: 0 }, lastCheckTime: '' },
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

describe('useCachedStrimzi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: STRIMZI_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.isDemoData).toBe(true)
        expect(result.current.data.clusters.length).toBeGreaterThan(0)
    })

    it('respects isLoading state — isDemoData false during loading', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedStrimzi())
        expect(result.current.isLoading).toBe(true)
        expect(result.current.isDemoData).toBe(false)
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty clusters', () => {
        const s = summarize([])
        expect(s.totalClusters).toBe(0)
        expect(s.totalBrokers).toBe(0)
    })

    it('counts healthy clusters and broker totals', () => {
        const clusters = [
            makeCluster({ health: 'healthy', brokers: { ready: 3, total: 3 } }),
            makeCluster({ health: 'degraded', brokers: { ready: 1, total: 3 } }),
        ]
        const s = summarize(clusters)
        expect(s.totalClusters).toBe(2)
        expect(s.healthyClusters).toBe(1)
        expect(s.totalBrokers).toBe(6)
        expect(s.readyBrokers).toBe(4)
    })
})

describe('__testables.aggregateStats', () => {
    it('aggregates topics, consumer groups, lag, and brokers', () => {
        const clusters = [
            makeCluster({
                brokers: { ready: 2, total: 3 },
                topics: [{ name: 't1', partitions: 1, replicationFactor: 1, status: 'active' }],
                consumerGroups: [{ groupId: 'g1', members: 1, lag: 10, status: 'ok' }],
                totalLag: 10,
            }),
        ]
        const s = aggregateStats(clusters, '0.40.0')
        expect(s.clusterCount).toBe(1)
        expect(s.brokerCount).toBe(3)
        expect(s.topicCount).toBe(1)
        expect(s.consumerGroupCount).toBe(1)
        expect(s.totalLag).toBe(10)
        expect(s.operatorVersion).toBe('0.40.0')
    })

    it('handles empty clusters', () => {
        const s = aggregateStats([], 'unknown')
        expect(s.clusterCount).toBe(0)
        expect(s.brokerCount).toBe(0)
    })
})

describe('__testables.deriveHealth', () => {
    it('returns not-installed for empty clusters', () => {
        expect(deriveHealth([])).toBe('not-installed')
    })

    it('returns healthy when all clusters healthy', () => {
        expect(deriveHealth([makeCluster()])).toBe('healthy')
    })

    it('returns degraded when any cluster is degraded', () => {
        expect(deriveHealth([makeCluster(), makeCluster({ health: 'degraded' })])).toBe('degraded')
    })
})

describe('__testables.buildStrimziStatus', () => {
    it('builds complete status object', () => {
        const clusters = [makeCluster()]
        const status = buildStrimziStatus(clusters, '0.40.0')
        expect(status.health).toBe('healthy')
        expect(status.clusters).toHaveLength(1)
        expect(status.stats.operatorVersion).toBe('0.40.0')
        expect(status.summary.totalClusters).toBe(1)
    })

    it('returns not-installed for empty clusters', () => {
        expect(buildStrimziStatus([], 'unknown').health).toBe('not-installed')
    })
})
