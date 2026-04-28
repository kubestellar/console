/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedStrimzi.ts, PLUS fetcher function tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables } from '../useCachedStrimzi'
import { useCachedStrimzi } from '../useCachedStrimzi'
import type { StrimziKafkaCluster } from '../../components/cards/strimzi_status/demoData'

const { summarize, aggregateStats, deriveHealth, buildStrimziStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<StrimziKafkaCluster> = {}): StrimziKafkaCluster {
  return {
    name: 'my-kafka',
    namespace: 'kafka',
    cluster: 'cluster-1',
    health: 'healthy',
    brokers: { total: 3, ready: 3 },
    listeners: [{ name: 'plain', type: 'internal', port: 9092 }],
    topics: [{ name: 'orders', partitions: 3, replicas: 3 }],
    consumerGroups: [{ name: 'order-processor', members: 2, lag: 10 }],
    totalLag: 10,
    version: '3.7.0',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty clusters', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalClusters: 0,
      healthyClusters: 0,
      totalBrokers: 0,
      readyBrokers: 0,
    })
  })

  it('counts clusters and brokers', () => {
    const clusters = [
      makeCluster({ health: 'healthy', brokers: { total: 3, ready: 3 } }),
      makeCluster({ name: 'k2', health: 'degraded', brokers: { total: 3, ready: 2 } }),
    ]
    const result = summarize(clusters)
    expect(result.totalClusters).toBe(2)
    expect(result.healthyClusters).toBe(1)
    expect(result.totalBrokers).toBe(6)
    expect(result.readyBrokers).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// aggregateStats
// ---------------------------------------------------------------------------

describe('aggregateStats', () => {
  it('aggregates stats from clusters', () => {
    const clusters = [
      makeCluster({
        topics: [{ name: 't1', partitions: 3, replicas: 3 }, { name: 't2', partitions: 1, replicas: 1 }],
        consumerGroups: [{ name: 'cg1', members: 2, lag: 5 }],
        totalLag: 5,
        brokers: { total: 3, ready: 3 },
      }),
    ]
    const result = aggregateStats(clusters, '0.39.0')
    expect(result.clusterCount).toBe(1)
    expect(result.topicCount).toBe(2)
    expect(result.consumerGroupCount).toBe(1)
    expect(result.totalLag).toBe(5)
    expect(result.brokerCount).toBe(3)
    expect(result.operatorVersion).toBe('0.39.0')
  })

  it('handles clusters with no topics or consumer groups', () => {
    const clusters = [makeCluster({ topics: undefined as unknown as StrimziKafkaCluster['topics'], consumerGroups: undefined as unknown as StrimziKafkaCluster['consumerGroups'], totalLag: undefined as unknown as number })]
    const result = aggregateStats(clusters, '0.39.0')
    expect(result.topicCount).toBe(0)
    expect(result.consumerGroupCount).toBe(0)
    expect(result.totalLag).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no clusters', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all clusters are healthy', () => {
    expect(deriveHealth([makeCluster(), makeCluster({ name: 'k2' })])).toBe('healthy')
  })

  it('returns degraded when a cluster is not healthy', () => {
    expect(deriveHealth([makeCluster(), makeCluster({ name: 'k2', health: 'degraded' })])).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildStrimziStatus
// ---------------------------------------------------------------------------

describe('buildStrimziStatus', () => {
  it('builds not-installed status with empty clusters', () => {
    const result = buildStrimziStatus([], 'unknown')
    expect(result.health).toBe('not-installed')
    expect(result.clusters).toEqual([])
    expect(result.stats.operatorVersion).toBe('unknown')
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status', () => {
    const result = buildStrimziStatus([makeCluster()], '0.39.0')
    expect(result.health).toBe('healthy')
    expect(result.clusters).toHaveLength(1)
    expect(result.stats.operatorVersion).toBe('0.39.0')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildStrimziStatus([], 'unknown')
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchStrimziStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', clusters: [], stats: { clusterCount: 0, brokerCount: 0, topicCount: 0, consumerGroupCount: 0, totalLag: 0, operatorVersion: 'unknown' }, summary: { totalClusters: 0, healthyClusters: 0, totalBrokers: 0, readyBrokers: 0 }, lastCheckTime: '' },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('parses a successful API response into StrimziStatusData', async () => {
    renderHook(() => useCachedStrimzi())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          clusters: [
            {
              name: 'my-kafka',
              namespace: 'kafka',
              cluster: 'cluster-1',
              health: 'healthy',
              brokers: { total: 3, ready: 3 },
              listeners: [],
              topics: [],
              consumerGroups: [],
              totalLag: 0,
              version: '3.7.0',
            },
          ],
          stats: { operatorVersion: '0.39.0' },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.clusters).toHaveLength(1)
    expect(result.stats.operatorVersion).toBe('0.39.0')
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedStrimzi())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch Strimzi status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedStrimzi())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.clusters).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedStrimzi())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch Strimzi status')
  })

  it('handles empty body fields gracefully', async () => {
    renderHook(() => useCachedStrimzi())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.clusters).toEqual([])
    expect(result.stats.operatorVersion).toBe('unknown')
  })
})
