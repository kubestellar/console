import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../lib/cache', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/cache')>()
    return {
        ...actual,
        useCache: (options: unknown) => mockUseCache(options),
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
    }
})

vi.mock('../lib/demo/dragonfly', () => ({
    DRAGONFLY_DEMO_DATA: {
        health: 'degraded',
        clusterName: 'demo-cluster',
        lastCheckTime: '2026-01-01T00:00:00Z',
        summary: { managerReplicas: 1, schedulerReplicas: 1, seedPeers: 1, dfdaemonNodesUp: 2, dfdaemonNodesTotal: 3, activeTasks: 0, cacheHitPercent: 0, p2pBytesServed: 0, upstreamBytes: 0 },
        components: [],
    },
}))

vi.mock('../lib/api', () => ({ authFetch: vi.fn() }))

import { useCachedDragonfly, __testables } from './useCachedDragonfly'

const BASE_DRAGONFLY = {
    data: {
        health: 'healthy' as const,
        clusterName: 'prod',
        lastCheckTime: '2026-01-01T00:00:00Z',
        summary: { managerReplicas: 1, schedulerReplicas: 2, seedPeers: 1, dfdaemonNodesUp: 5, dfdaemonNodesTotal: 5, activeTasks: 12, cacheHitPercent: 88, p2pBytesServed: 1024, upstreamBytes: 200 },
        components: [],
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 100000000,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
}

describe('useCachedDragonfly', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCache.mockReturnValue(BASE_DRAGONFLY)
    })

    it('returns data from cache', () => {
        const { result } = renderHook(() => useCachedDragonfly())
        expect(result.current.data.health).toBe('healthy')
        expect(result.current.data.clusterName).toBe('prod')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('surfaces isDemoFallback when cache reports demo fallback', () => {
        mockUseCache.mockReturnValue({ ...BASE_DRAGONFLY, isDemoFallback: true, isFailed: true, consecutiveFailures: 2 })
        const { result } = renderHook(() => useCachedDragonfly())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.isFailed).toBe(true)
    })

    it('isDemoFallback is false during loading', () => {
        mockUseCache.mockReturnValue({ ...BASE_DRAGONFLY, isLoading: true, isDemoFallback: true, data: null })
        const { result } = renderHook(() => useCachedDragonfly())
        expect(result.current.isDemoFallback).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Pure helper unit tests (via __testables)
// ---------------------------------------------------------------------------

const { classifyDragonflyPod, podIsReady, parseVersion, buildStatus } = __testables

describe('classifyDragonflyPod', () => {
    it('classifies manager via app.kubernetes.io/component label', () => {
        const pod = { name: 'x', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-manager' } } }
        expect(classifyDragonflyPod(pod)).toBe('manager')
    })

    it('classifies scheduler via app.kubernetes.io/name label', () => {
        const pod = { name: 'x', metadata: { labels: { 'app.kubernetes.io/name': 'dragonfly-scheduler' } } }
        expect(classifyDragonflyPod(pod)).toBe('scheduler')
    })

    it('classifies seed-peer via app label', () => {
        const pod = { name: 'x', metadata: { labels: { app: 'dragonfly-seed-peer' } } }
        expect(classifyDragonflyPod(pod)).toBe('seed-peer')
    })

    it('classifies dfdaemon via pod name prefix', () => {
        const pod = { name: 'dragonfly-dfdaemon-abcde', metadata: { labels: {} } }
        expect(classifyDragonflyPod(pod)).toBe('dfdaemon')
    })

    it('returns null for unrelated pods', () => {
        const pod = { name: 'nginx-abc', metadata: { labels: { app: 'nginx' } } }
        expect(classifyDragonflyPod(pod)).toBeNull()
    })
})

describe('podIsReady', () => {
    it('returns true when Running and all containers ready', () => {
        const pod = {
            name: 'x',
            status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: true }] },
        }
        expect(podIsReady(pod)).toBe(true)
    })

    it('returns false when phase is not Running', () => {
        const pod = { name: 'x', status: { phase: 'Pending', containerStatuses: [{ ready: true }] } }
        expect(podIsReady(pod)).toBe(false)
    })

    it('returns false when a container is not ready', () => {
        const pod = {
            name: 'x',
            status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: false }] },
        }
        expect(podIsReady(pod)).toBe(false)
    })

    it('returns false when containerStatuses is empty', () => {
        const pod = { name: 'x', status: { phase: 'Running', containerStatuses: [] } }
        expect(podIsReady(pod)).toBe(false)
    })
})

describe('parseVersion', () => {
    it('extracts tag from image string', () => {
        const pod = { name: 'x', status: { containerStatuses: [{ image: 'dragonflyoss/manager:v2.1.0' }] } }
        expect(parseVersion(pod)).toBe('v2.1.0')
    })

    it('returns empty string when no containers', () => {
        const pod = { name: 'x', status: { containerStatuses: [] } }
        expect(parseVersion(pod)).toBe('')
    })

    it('ignores digest portion', () => {
        const pod = { name: 'x', status: { containerStatuses: [{ image: 'dragonflyoss/manager:v2.1.0@sha256:abc' }] } }
        expect(parseVersion(pod)).toBe('v2.1.0')
    })
})

describe('buildStatus', () => {
    it('returns not-installed when no Dragonfly pods', () => {
        const result = buildStatus([{ name: 'nginx-abc', metadata: { labels: {} } }])
        expect(result.health).toBe('not-installed')
    })

    it('returns healthy when all components ready', () => {
        const pods = [
            { name: 'dragonfly-manager-xyz', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-manager' } }, status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'img:v1' }] } },
            { name: 'dragonfly-scheduler-xyz', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-scheduler' } }, status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'img:v1' }] } },
        ]
        const result = buildStatus(pods)
        expect(result.health).toBe('healthy')
    })

    it('returns degraded when some pods not ready', () => {
        const pods = [
            { name: 'dragonfly-manager-xyz', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-manager' } }, status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'img:v1' }] } },
            { name: 'dragonfly-scheduler-xyz', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-scheduler' } }, status: { phase: 'Pending', containerStatuses: [{ ready: false, image: 'img:v1' }] } },
        ]
        const result = buildStatus(pods)
        expect(result.health).toBe('degraded')
    })
})
