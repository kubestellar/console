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

import { useCachedRook, __testables } from '../useCachedRook'
import { ROOK_DEMO_DATA, type RookCephCluster } from '../../lib/demo/rook'

const { normalizeCephHealth, extractCephVersion, itemToCluster, summarize, buildStatus } = __testables

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'healthy', clusters: [], summary: { totalClusters: 0, healthyClusters: 0, degradedClusters: 0, totalOsdUp: 0, totalOsdTotal: 0, totalCapacityBytes: 0, totalUsedBytes: 0 }, lastCheckTime: '' },
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

describe('useCachedRook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: ROOK_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.data.clusters.length).toBeGreaterThan(0)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedRook())
        expect(result.current.isLoading).toBe(true)
    })
})

describe('__testables.normalizeCephHealth', () => {
    it('maps HEALTH_OK correctly', () => {
        expect(normalizeCephHealth('HEALTH_OK')).toBe('HEALTH_OK')
    })

    it('maps HEALTH_ERR correctly', () => {
        expect(normalizeCephHealth('HEALTH_ERR')).toBe('HEALTH_ERR')
    })

    it('defaults undefined to HEALTH_WARN', () => {
        expect(normalizeCephHealth(undefined)).toBe('HEALTH_WARN')
    })

    it('defaults unknown string to HEALTH_WARN', () => {
        expect(normalizeCephHealth('SOMETHING_ELSE')).toBe('HEALTH_WARN')
    })
})

describe('__testables.extractCephVersion', () => {
    it('extracts version from status.ceph.version', () => {
        expect(extractCephVersion({ status: { ceph: { version: 'v18.2.4' } } })).toBe('v18.2.4')
    })

    it('extracts version from spec image tag', () => {
        expect(extractCephVersion({ spec: { cephVersion: { image: 'quay.io/ceph/ceph:v18.2.4' } } })).toBe('v18.2.4')
    })

    it('returns empty string for missing data', () => {
        expect(extractCephVersion({})).toBe('')
    })

    it('handles image with digest', () => {
        expect(extractCephVersion({ spec: { cephVersion: { image: 'ceph:v18@sha256:abc' } } })).toBe('v18')
    })
})

describe('__testables.itemToCluster', () => {
    it('transforms a full CephCluster item', () => {
        const item = {
            metadata: { name: 'rook-ceph', namespace: 'rook-ceph' },
            cluster: 'cluster-1',
            status: { ceph: { health: 'HEALTH_OK', version: 'v18.2.4' } },
        }
        const cluster = itemToCluster(item)
        expect(cluster.name).toBe('rook-ceph')
        expect(cluster.namespace).toBe('rook-ceph')
        expect(cluster.cluster).toBe('cluster-1')
        expect(cluster.cephHealth).toBe('HEALTH_OK')
        expect(cluster.cephVersion).toBe('v18.2.4')
    })

    it('handles missing fields gracefully', () => {
        const cluster = itemToCluster({})
        expect(cluster.name).toBe('')
        expect(cluster.namespace).toBe('')
        expect(cluster.cephHealth).toBe('HEALTH_WARN')
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty array', () => {
        const summary = summarize([])
        expect(summary.totalClusters).toBe(0)
        expect(summary.healthyClusters).toBe(0)
        expect(summary.degradedClusters).toBe(0)
    })

    it('counts healthy vs degraded clusters', () => {
        const clusters = [
            { cephHealth: 'HEALTH_OK', osdUp: 3, osdTotal: 3, capacityTotalBytes: 100, capacityUsedBytes: 50 },
            { cephHealth: 'HEALTH_WARN', osdUp: 2, osdTotal: 3, capacityTotalBytes: 100, capacityUsedBytes: 60 },
        ] as RookCephCluster[]
        const summary = summarize(clusters)
        expect(summary.totalClusters).toBe(2)
        expect(summary.healthyClusters).toBe(1)
        expect(summary.degradedClusters).toBe(1)
        expect(summary.totalOsdUp).toBe(5)
        expect(summary.totalOsdTotal).toBe(6)
    })
})

describe('__testables.buildStatus', () => {
    it('returns not-installed for empty clusters', () => {
        const status = buildStatus([])
        expect(status.health).toBe('not-installed')
        expect(status.clusters).toHaveLength(0)
    })

    it('returns healthy when all clusters are HEALTH_OK', () => {
        const clusters = [{ cephHealth: 'HEALTH_OK' }] as RookCephCluster[]
        const status = buildStatus(clusters)
        expect(status.health).toBe('healthy')
    })

    it('returns degraded when any cluster is not HEALTH_OK', () => {
        const clusters = [
            { cephHealth: 'HEALTH_OK' },
            { cephHealth: 'HEALTH_WARN' },
        ] as RookCephCluster[]
        const status = buildStatus(clusters)
        expect(status.health).toBe('degraded')
    })
})
