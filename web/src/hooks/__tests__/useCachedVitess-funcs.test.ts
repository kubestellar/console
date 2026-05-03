/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedVitess.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
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
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

import { __testables, useCachedVitess } from '../useCachedVitess'

const { buildShards, buildKeyspaces, summarize, deriveHealth, buildStatus } = __testables

// ---------------------------------------------------------------------------
// buildShards
// ---------------------------------------------------------------------------

describe('buildShards', () => {
  it('returns empty array for no tablets', () => {
    expect(buildShards([])).toEqual([])
  })

  it('groups tablets into shards by keyspace/shard', () => {
    const tablets = [
      { alias: 'z1-001', keyspace: 'commerce', shard: '-80', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'z1-002', keyspace: 'commerce', shard: '-80', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 1 },
      { alias: 'z1-003', keyspace: 'commerce', shard: '80-', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
    ]
    const shards = buildShards(tablets)
    expect(shards).toHaveLength(2)

    const shard80 = shards.find(s => s.name === '-80')!
    expect(shard80.tabletCount).toBe(2)
    expect(shard80.servingTabletCount).toBe(2)
    expect(shard80.primaryAlias).toBe('z1-001')
  })

  it('sets primaryAlias to null when no PRIMARY tablet exists', () => {
    const tablets = [
      { alias: 'r1', keyspace: 'ks', shard: '0', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 0 },
    ]
    const shards = buildShards(tablets)
    expect(shards[0].primaryAlias).toBeNull()
  })

  it('counts non-SERVING tablets correctly', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'b', keyspace: 'ks', shard: '0', type: 'REPLICA', state: 'NOT_SERVING', replicationLagSeconds: 5 },
    ]
    const shards = buildShards(tablets)
    expect(shards[0].servingTabletCount).toBe(1)
    expect(shards[0].tabletCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// buildKeyspaces
// ---------------------------------------------------------------------------

describe('buildKeyspaces', () => {
  it('returns empty array when no shards', () => {
    expect(buildKeyspaces([], [])).toEqual([])
  })

  it('groups shards into keyspaces with correct tablet counts', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks1', shard: '-80', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'b', keyspace: 'ks1', shard: '80-', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'c', keyspace: 'ks2', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
    ]
    const shards = buildShards(tablets)
    const keyspaces = buildKeyspaces(shards, tablets)

    expect(keyspaces).toHaveLength(2)
    const ks1 = keyspaces.find(k => k.name === 'ks1')!
    expect(ks1.sharded).toBe(true)
    expect(ks1.tabletCount).toBe(2)
    expect(ks1.shards).toHaveLength(2)

    const ks2 = keyspaces.find(k => k.name === 'ks2')!
    expect(ks2.sharded).toBe(false)
    expect(ks2.tabletCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zero summary for empty input', () => {
    const result = summarize([], [])
    expect(result.totalKeyspaces).toBe(0)
    expect(result.totalShards).toBe(0)
    expect(result.totalTablets).toBe(0)
    expect(result.primaryTablets).toBe(0)
    expect(result.replicaTablets).toBe(0)
    expect(result.rdonlyTablets).toBe(0)
    expect(result.servingTablets).toBe(0)
    expect(result.maxReplicationLagSeconds).toBe(0)
  })

  it('counts tablet types and serving tablets', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'b', keyspace: 'ks', shard: '0', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 3 },
      { alias: 'c', keyspace: 'ks', shard: '0', type: 'RDONLY', state: 'NOT_SERVING', replicationLagSeconds: 10 },
    ]
    const shards = buildShards(tablets)
    const keyspaces = buildKeyspaces(shards, tablets)
    const result = summarize(tablets, keyspaces)

    expect(result.totalTablets).toBe(3)
    expect(result.primaryTablets).toBe(1)
    expect(result.replicaTablets).toBe(1)
    expect(result.rdonlyTablets).toBe(1)
    expect(result.servingTablets).toBe(2)
    expect(result.maxReplicationLagSeconds).toBe(10)
  })

  it('ignores PRIMARY replication lag for max calculation', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 999 },
      { alias: 'b', keyspace: 'ks', shard: '0', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 2 },
    ]
    const result = summarize(tablets, [])
    expect(result.maxReplicationLagSeconds).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no tablets', () => {
    expect(deriveHealth([], { totalKeyspaces: 0, totalShards: 0, totalTablets: 0, primaryTablets: 0, replicaTablets: 0, rdonlyTablets: 0, servingTablets: 0, maxReplicationLagSeconds: 0 })).toBe('not-installed')
  })

  it('returns degraded when some tablets are not serving', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
    ]
    const summary = { totalKeyspaces: 1, totalShards: 1, totalTablets: 1, primaryTablets: 1, replicaTablets: 0, rdonlyTablets: 0, servingTablets: 0, maxReplicationLagSeconds: 0 }
    expect(deriveHealth(tablets, summary)).toBe('degraded')
  })

  it('returns healthy when all tablets are serving', () => {
    const tablets = [
      { alias: 'a', keyspace: 'ks', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
    ]
    const summary = { totalKeyspaces: 1, totalShards: 1, totalTablets: 1, primaryTablets: 1, replicaTablets: 0, rdonlyTablets: 0, servingTablets: 1, maxReplicationLagSeconds: 0 }
    expect(deriveHealth(tablets, summary)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus', () => {
  it('returns not-installed status for empty tablets', () => {
    const result = buildStatus([], 'v18.0.0')
    expect(result.health).toBe('not-installed')
    expect(result.keyspaces).toEqual([])
    expect(result.tablets).toEqual([])
    expect(result.vitessVersion).toBe('v18.0.0')
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('falls back to unknown version when empty string given', () => {
    const result = buildStatus([], '')
    expect(result.vitessVersion).toBe('unknown')
  })

  it('builds full status from tablets', () => {
    const tablets = [
      { alias: 'z1-001', keyspace: 'commerce', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
      { alias: 'z1-002', keyspace: 'commerce', shard: '0', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 1 },
    ]
    const result = buildStatus(tablets, 'v18.0.0')
    expect(result.health).toBe('healthy')
    expect(result.keyspaces).toHaveLength(1)
    expect(result.summary.totalTablets).toBe(2)
    expect(result.summary.primaryTablets).toBe(1)
    expect(result.summary.replicaTablets).toBe(1)
    expect(result.summary.servingTablets).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchVitessStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedVitess())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const validResponse = {
      tablets: [
        { alias: 'z1-001', keyspace: 'commerce', shard: '0', type: 'PRIMARY', state: 'SERVING', replicationLagSeconds: 0 },
        { alias: 'z1-002', keyspace: 'commerce', shard: '0', type: 'REPLICA', state: 'SERVING', replicationLagSeconds: 1 },
      ],
      version: 'v18.0.0',
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; keyspaces: unknown[]; vitessVersion: string }
    expect(result.health).toBe('healthy')
    expect(result.keyspaces).toHaveLength(1)
    expect(result.vitessVersion).toBe('v18.0.0')
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; tablets: unknown[] }
    expect(result.health).toBe('not-installed')
    expect(result.tablets).toEqual([])
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

  it('uses default version when body has no version', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tablets: [] }),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { vitessVersion: string }
    expect(result.vitessVersion).toBe('unknown')
  })
})
