/**
 * useCachedVitess — Cached hook for Vitess cluster status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * This is scaffolding — the fetcher hits `/api/vitess/status`, which does
 * not exist yet. Until a real VTAdmin bridge lands, the cache layer will
 * surface demo data via its demoData fallback path with no component
 * changes required.
 */

import { createCachedHook } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  VITESS_DEMO_DATA,
  type VitessStatusData,
  type VitessTablet,
  type VitessKeyspace,
  type VitessShard,
  type VitessSummary,
} from '../lib/demo/vitess'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_VITESS = 'vitess-status'
const VITESS_STATUS_ENDPOINT = '/api/vitess/status'
const DEFAULT_VITESS_VERSION = 'unknown'

const EMPTY_SUMMARY: VitessSummary = {
  totalKeyspaces: 0,
  totalShards: 0,
  totalTablets: 0,
  primaryTablets: 0,
  replicaTablets: 0,
  rdonlyTablets: 0,
  servingTablets: 0,
  maxReplicationLagSeconds: 0,
}

const INITIAL_DATA: VitessStatusData = {
  health: 'not-installed',
  keyspaces: [],
  tablets: [],
  summary: EMPTY_SUMMARY,
  vitessVersion: DEFAULT_VITESS_VERSION,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal response shape (future VTAdmin bridge)
// ---------------------------------------------------------------------------

interface VitessStatusResponse {
  tablets?: VitessTablet[]
  version?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function shardKey(keyspace: string, shard: string): string {
  return `${keyspace}/${shard}`
}

function buildShards(tablets: VitessTablet[]): VitessShard[] {
  const byKey = new Map<string, VitessShard>()
  for (const tablet of tablets) {
    const key = shardKey(tablet.keyspace, tablet.shard)
    const existing = byKey.get(key)
    if (existing) {
      existing.tabletCount += 1
      if (tablet.state === 'SERVING') existing.servingTabletCount += 1
      if (tablet.type === 'PRIMARY') existing.primaryAlias = tablet.alias
    } else {
      byKey.set(key, {
        keyspace: tablet.keyspace,
        name: tablet.shard,
        primaryAlias: tablet.type === 'PRIMARY' ? tablet.alias : null,
        tabletCount: 1,
        servingTabletCount: tablet.state === 'SERVING' ? 1 : 0,
      })
    }
  }
  return Array.from(byKey.values())
}

function buildKeyspaces(shards: VitessShard[], tablets: VitessTablet[]): VitessKeyspace[] {
  const byName = new Map<string, VitessKeyspace>()
  for (const shard of shards) {
    const existing = byName.get(shard.keyspace)
    if (existing) {
      existing.shards.push(shard)
    } else {
      byName.set(shard.keyspace, {
        name: shard.keyspace,
        shards: [shard],
        tabletCount: 0,
        sharded: false,
      })
    }
  }
  for (const keyspace of byName.values()) {
    keyspace.sharded = keyspace.shards.length > 1
    keyspace.tabletCount = tablets.filter(t => t.keyspace === keyspace.name).length
  }
  return Array.from(byName.values())
}

function summarize(tablets: VitessTablet[], keyspaces: VitessKeyspace[]): VitessSummary {
  let primaryTablets = 0
  let replicaTablets = 0
  let rdonlyTablets = 0
  let servingTablets = 0
  let maxReplicationLagSeconds = 0
  let totalShards = 0

  for (const tablet of tablets) {
    if (tablet.type === 'PRIMARY') primaryTablets += 1
    else if (tablet.type === 'REPLICA') replicaTablets += 1
    else if (tablet.type === 'RDONLY') rdonlyTablets += 1
    if (tablet.state === 'SERVING') servingTablets += 1
    if (tablet.type !== 'PRIMARY' && tablet.replicationLagSeconds > maxReplicationLagSeconds) {
      maxReplicationLagSeconds = tablet.replicationLagSeconds
    }
  }

  for (const keyspace of keyspaces) {
    totalShards += keyspace.shards.length
  }

  return {
    totalKeyspaces: keyspaces.length,
    totalShards,
    totalTablets: tablets.length,
    primaryTablets,
    replicaTablets,
    rdonlyTablets,
    servingTablets,
    maxReplicationLagSeconds,
  }
}

function deriveHealth(tablets: VitessTablet[], summary: VitessSummary): VitessStatusData['health'] {
  if (tablets.length === 0) return 'not-installed'
  if (summary.servingTablets < summary.totalTablets) return 'degraded'
  return 'healthy'
}

function buildStatus(tablets: VitessTablet[], version: string): VitessStatusData {
  const shards = buildShards(tablets)
  const keyspaces = buildKeyspaces(shards, tablets)
  const summary = summarize(tablets, keyspaces)
  return {
    health: deriveHealth(tablets, summary),
    keyspaces,
    tablets,
    summary,
    vitessVersion: version || DEFAULT_VITESS_VERSION,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchVitessStatus(): Promise<VitessStatusData> {
  const resp = await authFetch(VITESS_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    // 404 means the future VTAdmin bridge is not wired up — surface an
    // empty "not-installed" state so the cache layer can fall back to
    // demo data without throwing.
    if (resp.status === 404) return buildStatus([], DEFAULT_VITESS_VERSION)
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as VitessStatusResponse
  const tablets = Array.isArray(body.tablets) ? body.tablets : []
  const version = typeof body.version === 'string' ? body.version : DEFAULT_VITESS_VERSION
  return buildStatus(tablets, version)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedVitess = createCachedHook<VitessStatusData>({
  key: CACHE_KEY_VITESS,
  initialData: INITIAL_DATA,
  demoData: VITESS_DEMO_DATA,
  fetcher: fetchVitessStatus,
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  buildShards,
  buildKeyspaces,
  summarize,
  deriveHealth,
  buildStatus,
}
