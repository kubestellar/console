/**
 * Vitess Status Card — Demo Data & Type Definitions
 *
 * Vitess (CNCF graduated) is a cloud-native, horizontally-scalable database
 * clustering system for MySQL. The card surfaces the shape operators care
 * about at a glance:
 *
 *   keyspaces  → shards  → tablets (PRIMARY / REPLICA / RDONLY)
 *
 * Replication lag (seconds behind primary) is tracked per non-primary
 * tablet. This is scaffolding — when a real VTAdmin bridge lands, the
 * hook's fetcher will pick up live data automatically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitessTabletType = 'PRIMARY' | 'REPLICA' | 'RDONLY'
export type VitessTabletState = 'SERVING' | 'NOT_SERVING' | 'UNKNOWN'
export type VitessHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

export interface VitessTablet {
  alias: string
  keyspace: string
  shard: string
  type: VitessTabletType
  state: VitessTabletState
  /** Replication lag in seconds (0 for PRIMARY tablets). */
  replicationLagSeconds: number
  cell: string
  version: string
}

export interface VitessShard {
  keyspace: string
  name: string
  primaryAlias: string | null
  tabletCount: number
  /** Count of tablets whose state === 'SERVING'. */
  servingTabletCount: number
}

export interface VitessKeyspace {
  name: string
  shards: VitessShard[]
  tabletCount: number
  /** True when sharded (i.e. more than one shard). */
  sharded: boolean
}

export interface VitessSummary {
  totalKeyspaces: number
  totalShards: number
  totalTablets: number
  primaryTablets: number
  replicaTablets: number
  rdonlyTablets: number
  servingTablets: number
  /** Maximum replication lag observed across non-primary tablets, in seconds. */
  maxReplicationLagSeconds: number
}

export interface VitessStatusData {
  health: VitessHealth
  keyspaces: VitessKeyspace[]
  tablets: VitessTablet[]
  summary: VitessSummary
  /** VTAdmin / control plane version (best effort). */
  vitessVersion: string
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_VITESS_VERSION = 'v19.0.4'
const DEMO_CELL = 'zone1'

// Replication lag buckets (seconds) for demo tablets.
const LAG_HEALTHY_S = 0
const LAG_SLIGHT_S = 1
const LAG_MILD_S = 2
const LAG_MODERATE_S = 3
const LAG_WARN_S = 8
const LAG_HIGH_S = 42

// ---------------------------------------------------------------------------
// Demo tablets (commerce / customer keyspaces, realistic Vitess shape)
// ---------------------------------------------------------------------------

const DEMO_TABLETS: VitessTablet[] = [
  // commerce keyspace — unsharded (single shard "0")
  {
    alias: 'zone1-0000000100',
    keyspace: 'commerce',
    shard: '0',
    type: 'PRIMARY',
    state: 'SERVING',
    replicationLagSeconds: LAG_HEALTHY_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000101',
    keyspace: 'commerce',
    shard: '0',
    type: 'REPLICA',
    state: 'SERVING',
    replicationLagSeconds: LAG_SLIGHT_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000102',
    keyspace: 'commerce',
    shard: '0',
    type: 'RDONLY',
    state: 'SERVING',
    replicationLagSeconds: LAG_MILD_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  // customer keyspace — sharded into two shards "-80" and "80-"
  {
    alias: 'zone1-0000000200',
    keyspace: 'customer',
    shard: '-80',
    type: 'PRIMARY',
    state: 'SERVING',
    replicationLagSeconds: LAG_HEALTHY_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000201',
    keyspace: 'customer',
    shard: '-80',
    type: 'REPLICA',
    state: 'SERVING',
    replicationLagSeconds: LAG_SLIGHT_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000202',
    keyspace: 'customer',
    shard: '-80',
    type: 'RDONLY',
    state: 'SERVING',
    replicationLagSeconds: LAG_MODERATE_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000300',
    keyspace: 'customer',
    shard: '80-',
    type: 'PRIMARY',
    state: 'SERVING',
    replicationLagSeconds: LAG_HEALTHY_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000301',
    keyspace: 'customer',
    shard: '80-',
    type: 'REPLICA',
    state: 'SERVING',
    replicationLagSeconds: LAG_WARN_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
  {
    alias: 'zone1-0000000302',
    keyspace: 'customer',
    shard: '80-',
    type: 'RDONLY',
    state: 'NOT_SERVING',
    replicationLagSeconds: LAG_HIGH_S,
    cell: DEMO_CELL,
    version: DEMO_VITESS_VERSION,
  },
]

// ---------------------------------------------------------------------------
// Helpers to derive keyspace/shard aggregates from tablets (demo-only)
// ---------------------------------------------------------------------------

function buildDemoShards(tablets: VitessTablet[]): VitessShard[] {
  const byKey = new Map<string, VitessShard>()
  for (const tablet of tablets) {
    const key = `${tablet.keyspace}/${tablet.shard}`
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

function buildDemoKeyspaces(shards: VitessShard[], tablets: VitessTablet[]): VitessKeyspace[] {
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

const DEMO_SHARDS = buildDemoShards(DEMO_TABLETS)
const DEMO_KEYSPACES = buildDemoKeyspaces(DEMO_SHARDS, DEMO_TABLETS)

const DEMO_PRIMARY_COUNT = DEMO_TABLETS.filter(t => t.type === 'PRIMARY').length
const DEMO_REPLICA_COUNT = DEMO_TABLETS.filter(t => t.type === 'REPLICA').length
const DEMO_RDONLY_COUNT = DEMO_TABLETS.filter(t => t.type === 'RDONLY').length
const DEMO_SERVING_COUNT = DEMO_TABLETS.filter(t => t.state === 'SERVING').length
const DEMO_MAX_LAG_S = DEMO_TABLETS.reduce(
  (acc, t) => (t.type === 'PRIMARY' ? acc : Math.max(acc, t.replicationLagSeconds)),
  0,
)

export const VITESS_DEMO_DATA: VitessStatusData = {
  // One tablet is NOT_SERVING + LAG_HIGH_S — realistic degraded shape
  health: 'degraded',
  keyspaces: DEMO_KEYSPACES,
  tablets: DEMO_TABLETS,
  summary: {
    totalKeyspaces: DEMO_KEYSPACES.length,
    totalShards: DEMO_SHARDS.length,
    totalTablets: DEMO_TABLETS.length,
    primaryTablets: DEMO_PRIMARY_COUNT,
    replicaTablets: DEMO_REPLICA_COUNT,
    rdonlyTablets: DEMO_RDONLY_COUNT,
    servingTablets: DEMO_SERVING_COUNT,
    maxReplicationLagSeconds: DEMO_MAX_LAG_S,
  },
  vitessVersion: DEMO_VITESS_VERSION,
  lastCheckTime: new Date().toISOString(),
}
