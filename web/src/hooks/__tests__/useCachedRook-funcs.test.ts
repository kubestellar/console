/**
 * Tests for the pure helper functions and fetcher function exported via
 * __testables / useCache capture from useCachedRook.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { useCachedRook, __testables } from '../useCachedRook'

const {
  normalizeCephHealth,
  extractCephVersion,
  itemToCluster,
  summarize,
  buildStatus,
} = __testables

// ---------------------------------------------------------------------------
// normalizeCephHealth
// ---------------------------------------------------------------------------

describe('normalizeCephHealth', () => {
  it('returns HEALTH_OK for HEALTH_OK', () => {
    expect(normalizeCephHealth('HEALTH_OK')).toBe('HEALTH_OK')
  })

  it('returns HEALTH_ERR for HEALTH_ERR', () => {
    expect(normalizeCephHealth('HEALTH_ERR')).toBe('HEALTH_ERR')
  })

  it('defaults to HEALTH_WARN for unknown values', () => {
    expect(normalizeCephHealth('SOMETHING_ELSE')).toBe('HEALTH_WARN')
    expect(normalizeCephHealth(undefined)).toBe('HEALTH_WARN')
  })
})

// ---------------------------------------------------------------------------
// extractCephVersion
// ---------------------------------------------------------------------------

describe('extractCephVersion', () => {
  it('extracts from status.ceph.version', () => {
    const item = { status: { ceph: { version: '17.2.6' } } }
    expect(extractCephVersion(item)).toBe('17.2.6')
  })

  it('extracts from status.version.version as fallback', () => {
    const item = { status: { version: { version: '17.2.5' } } }
    expect(extractCephVersion(item)).toBe('17.2.5')
  })

  it('extracts from spec.cephVersion.image tag', () => {
    const item = { spec: { cephVersion: { image: 'quay.io/ceph/ceph:v17.2.6' } } }
    expect(extractCephVersion(item)).toBe('v17.2.6')
  })

  it('returns empty string when no version info', () => {
    expect(extractCephVersion({})).toBe('')
  })
})

// ---------------------------------------------------------------------------
// itemToCluster
// ---------------------------------------------------------------------------

describe('itemToCluster', () => {
  it('maps a CephCluster item to RookCephCluster', () => {
    const item = {
      name: 'rook-ceph',
      namespace: 'rook-ceph',
      cluster: 'prod',
      metadata: { name: 'rook-ceph', namespace: 'rook-ceph' },
      status: { ceph: { health: 'HEALTH_OK', version: '17.2.6' } },
    }
    const cluster = itemToCluster(item)
    expect(cluster.name).toBe('rook-ceph')
    expect(cluster.namespace).toBe('rook-ceph')
    expect(cluster.cephHealth).toBe('HEALTH_OK')
    expect(cluster.cephVersion).toBe('17.2.6')
  })

  it('uses item name/namespace when metadata is missing', () => {
    const item = { name: 'my-cluster', namespace: 'ns1' }
    const cluster = itemToCluster(item)
    expect(cluster.name).toBe('my-cluster')
    expect(cluster.namespace).toBe('ns1')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize (rook)', () => {
  it('returns zeros for empty clusters', () => {
    const result = summarize([])
    expect(result.totalClusters).toBe(0)
    expect(result.healthyClusters).toBe(0)
    expect(result.degradedClusters).toBe(0)
  })

  it('counts healthy vs degraded clusters', () => {
    const clusters = [
      { name: 'c1', namespace: 'ns', cluster: '', cephVersion: '', cephHealth: 'HEALTH_OK' as const, osdTotal: 0, osdUp: 0, osdIn: 0, monQuorum: 0, monExpected: 0, mgrActive: 0, mgrStandby: 0, capacityTotalBytes: 1000, capacityUsedBytes: 500, pools: 0, pgActiveClean: 0, pgTotal: 0 },
      { name: 'c2', namespace: 'ns', cluster: '', cephVersion: '', cephHealth: 'HEALTH_WARN' as const, osdTotal: 0, osdUp: 0, osdIn: 0, monQuorum: 0, monExpected: 0, mgrActive: 0, mgrStandby: 0, capacityTotalBytes: 2000, capacityUsedBytes: 1000, pools: 0, pgActiveClean: 0, pgTotal: 0 },
    ]
    const result = summarize(clusters)
    expect(result.totalClusters).toBe(2)
    expect(result.healthyClusters).toBe(1)
    expect(result.degradedClusters).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus (rook)', () => {
  it('returns not-installed for empty clusters', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.clusters).toEqual([])
  })

  it('returns healthy when all clusters are HEALTH_OK', () => {
    const clusters = [
      { name: 'c1', namespace: 'ns', cluster: '', cephVersion: '', cephHealth: 'HEALTH_OK' as const, osdTotal: 0, osdUp: 0, osdIn: 0, monQuorum: 0, monExpected: 0, mgrActive: 0, mgrStandby: 0, capacityTotalBytes: 0, capacityUsedBytes: 0, pools: 0, pgActiveClean: 0, pgTotal: 0 },
    ]
    const result = buildStatus(clusters)
    expect(result.health).toBe('healthy')
  })

  it('returns degraded when some clusters are not HEALTH_OK', () => {
    const clusters = [
      { name: 'c1', namespace: 'ns', cluster: '', cephVersion: '', cephHealth: 'HEALTH_OK' as const, osdTotal: 0, osdUp: 0, osdIn: 0, monQuorum: 0, monExpected: 0, mgrActive: 0, mgrStandby: 0, capacityTotalBytes: 0, capacityUsedBytes: 0, pools: 0, pgActiveClean: 0, pgTotal: 0 },
      { name: 'c2', namespace: 'ns', cluster: '', cephVersion: '', cephHealth: 'HEALTH_ERR' as const, osdTotal: 0, osdUp: 0, osdIn: 0, monQuorum: 0, monExpected: 0, mgrActive: 0, mgrStandby: 0, capacityTotalBytes: 0, capacityUsedBytes: 0, pools: 0, pgActiveClean: 0, pgTotal: 0 },
    ]
    const result = buildStatus(clusters)
    expect(result.health).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchRookStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedRook())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const cephCluster = {
      name: 'rook-ceph',
      namespace: 'rook-ceph',
      cluster: 'prod',
      metadata: { name: 'rook-ceph', namespace: 'rook-ceph' },
      status: { ceph: { health: 'HEALTH_OK', version: '17.2.6' } },
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [cephCluster] }),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; clusters: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.clusters).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; clusters: unknown[] }
    expect(result.health).toBe('not-installed')
    expect(result.clusters).toEqual([])
  })

  it('returns not-installed for 401 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for 503 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('throws on non-whitelisted error status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })

  it('returns not-installed when JSON parse fails', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })
})
