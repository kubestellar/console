/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedLonghorn.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

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
vi.mock('../../lib/api', () => ({ authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

import { __testables, useCachedLonghorn } from '../useCachedLonghorn'

const { normalizeVolumeState, normalizeRobustness, summarize, deriveHealth, buildStatus } = __testables

// ---------------------------------------------------------------------------
// normalizeVolumeState
// ---------------------------------------------------------------------------

describe('normalizeVolumeState', () => {
  it('returns valid states unchanged', () => {
    expect(normalizeVolumeState('attached')).toBe('attached')
    expect(normalizeVolumeState('detached')).toBe('detached')
    expect(normalizeVolumeState('attaching')).toBe('attaching')
    expect(normalizeVolumeState('detaching')).toBe('detaching')
    expect(normalizeVolumeState('creating')).toBe('creating')
    expect(normalizeVolumeState('deleting')).toBe('deleting')
  })

  it('defaults to detached for unknown string', () => {
    expect(normalizeVolumeState('bogus')).toBe('detached')
  })

  it('defaults to detached for undefined', () => {
    expect(normalizeVolumeState(undefined)).toBe('detached')
  })

  it('defaults to detached for empty string', () => {
    expect(normalizeVolumeState('')).toBe('detached')
  })
})

// ---------------------------------------------------------------------------
// normalizeRobustness
// ---------------------------------------------------------------------------

describe('normalizeRobustness', () => {
  it('returns valid robustness values unchanged', () => {
    expect(normalizeRobustness('healthy')).toBe('healthy')
    expect(normalizeRobustness('degraded')).toBe('degraded')
    expect(normalizeRobustness('faulted')).toBe('faulted')
    expect(normalizeRobustness('unknown')).toBe('unknown')
  })

  it('defaults to unknown for unrecognized string', () => {
    expect(normalizeRobustness('bogus')).toBe('unknown')
  })

  it('defaults to unknown for undefined', () => {
    expect(normalizeRobustness(undefined)).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize (longhorn)', () => {
  it('returns zeros for empty arrays', () => {
    const result = summarize([], [])
    expect(result.totalVolumes).toBe(0)
    expect(result.healthyVolumes).toBe(0)
    expect(result.degradedVolumes).toBe(0)
    expect(result.faultedVolumes).toBe(0)
    expect(result.totalNodes).toBe(0)
    expect(result.readyNodes).toBe(0)
    expect(result.schedulableNodes).toBe(0)
    expect(result.totalCapacityBytes).toBe(0)
    expect(result.totalUsedBytes).toBe(0)
  })

  it('counts volumes by robustness', () => {
    const volumes = [
      { name: 'v1', namespace: 'ns', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 1000, actualSizeBytes: 500, nodeAttached: 'n1', cluster: '' },
      { name: 'v2', namespace: 'ns', state: 'attached' as const, robustness: 'degraded' as const, replicasDesired: 3, replicasHealthy: 2, sizeBytes: 2000, actualSizeBytes: 1000, nodeAttached: 'n1', cluster: '' },
      { name: 'v3', namespace: 'ns', state: 'detached' as const, robustness: 'faulted' as const, replicasDesired: 3, replicasHealthy: 0, sizeBytes: 500, actualSizeBytes: 0, nodeAttached: '', cluster: '' },
    ]
    const result = summarize(volumes, [])
    expect(result.totalVolumes).toBe(3)
    expect(result.healthyVolumes).toBe(1)
    expect(result.degradedVolumes).toBe(1)
    expect(result.faultedVolumes).toBe(1)
  })

  it('counts node stats and capacity', () => {
    const nodes = [
      { name: 'n1', cluster: '', ready: true, schedulable: true, storageTotalBytes: 100000, storageUsedBytes: 40000, replicaCount: 5 },
      { name: 'n2', cluster: '', ready: false, schedulable: false, storageTotalBytes: 100000, storageUsedBytes: 60000, replicaCount: 3 },
    ]
    const result = summarize([], nodes)
    expect(result.totalNodes).toBe(2)
    expect(result.readyNodes).toBe(1)
    expect(result.schedulableNodes).toBe(1)
    expect(result.totalCapacityBytes).toBe(200000)
    expect(result.totalUsedBytes).toBe(100000)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth (longhorn)', () => {
  it('returns not-installed when no volumes and no nodes', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when all volumes are healthy and nodes ready', () => {
    const volumes = [
      { name: 'v1', namespace: 'ns', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 1000, actualSizeBytes: 500, nodeAttached: 'n1', cluster: '' },
    ]
    const nodes = [
      { name: 'n1', cluster: '', ready: true, schedulable: true, storageTotalBytes: 100000, storageUsedBytes: 40000, replicaCount: 3 },
    ]
    expect(deriveHealth(volumes, nodes)).toBe('healthy')
  })

  it('returns degraded when a volume is faulted', () => {
    const volumes = [
      { name: 'v1', namespace: 'ns', state: 'attached' as const, robustness: 'faulted' as const, replicasDesired: 3, replicasHealthy: 0, sizeBytes: 1000, actualSizeBytes: 0, nodeAttached: '', cluster: '' },
    ]
    expect(deriveHealth(volumes, [])).toBe('degraded')
  })

  it('returns degraded when a volume is degraded', () => {
    const volumes = [
      { name: 'v1', namespace: 'ns', state: 'attached' as const, robustness: 'degraded' as const, replicasDesired: 3, replicasHealthy: 2, sizeBytes: 1000, actualSizeBytes: 500, nodeAttached: 'n1', cluster: '' },
    ]
    expect(deriveHealth(volumes, [])).toBe('degraded')
  })

  it('returns degraded when a node is not ready', () => {
    const nodes = [
      { name: 'n1', cluster: '', ready: false, schedulable: true, storageTotalBytes: 100000, storageUsedBytes: 0, replicaCount: 0 },
    ]
    expect(deriveHealth([], nodes)).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus (longhorn)', () => {
  it('returns not-installed for empty inputs', () => {
    const result = buildStatus([], [])
    expect(result.health).toBe('not-installed')
    expect(result.volumes).toEqual([])
    expect(result.nodes).toEqual([])
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds full status with volumes and nodes', () => {
    const volumes = [
      { name: 'v1', namespace: 'ns', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 1000, actualSizeBytes: 500, nodeAttached: 'n1', cluster: 'c1' },
    ]
    const nodes = [
      { name: 'n1', cluster: 'c1', ready: true, schedulable: true, storageTotalBytes: 100000, storageUsedBytes: 40000, replicaCount: 3 },
    ]
    const result = buildStatus(volumes, nodes)
    expect(result.health).toBe('healthy')
    expect(result.volumes).toHaveLength(1)
    expect(result.nodes).toHaveLength(1)
    expect(result.summary.totalVolumes).toBe(1)
    expect(result.summary.totalNodes).toBe(1)
    expect(result.summary.healthyVolumes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchLonghornStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedLonghorn())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const validResponse = {
      volumes: [
        { name: 'v1', namespace: 'ns', state: 'attached', robustness: 'healthy', replicasDesired: 3, replicasHealthy: 3, sizeBytes: 1000, actualSizeBytes: 500, nodeAttached: 'n1', cluster: 'c1' },
      ],
      nodes: [
        { name: 'n1', cluster: 'c1', ready: true, schedulable: true, storageTotalBytes: 100000, storageUsedBytes: 40000, replicaCount: 3 },
      ],
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; volumes: unknown[]; nodes: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.volumes).toHaveLength(1)
    expect(result.nodes).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; volumes: unknown[]; nodes: unknown[] }
    expect(result.health).toBe('not-installed')
    expect(result.volumes).toEqual([])
    expect(result.nodes).toEqual([])
  })

  it('throws on non-404 error status', async () => {
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

  it('handles empty body arrays gracefully', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; volumes: unknown[]; nodes: unknown[] }
    expect(result.health).toBe('not-installed')
    expect(result.volumes).toEqual([])
    expect(result.nodes).toEqual([])
  })
})
