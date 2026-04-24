/**
 * Rook Status Card — Demo Data & Type Definitions
 *
 * Models a Rook-managed CephCluster (CNCF graduated cloud-native storage
 * orchestrator). Surfaces the operational signals an SRE cares about:
 *   • CephCluster health (HEALTH_OK / HEALTH_WARN / HEALTH_ERR)
 *   • OSD counts (up / in / total)
 *   • MON quorum size and expected
 *   • MGR active status
 *   • Raw and usable capacity (used / total)
 *   • Pool count and PG state summary
 *
 * Shown when Rook is not installed or when the user is in demo mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RookCephHealth = 'HEALTH_OK' | 'HEALTH_WARN' | 'HEALTH_ERR'
export type RookInstallHealth = 'healthy' | 'degraded' | 'not-installed'

export interface RookCephCluster {
  /** Namespace/name of the CephCluster custom resource. */
  namespace: string
  name: string
  /** Ceph version string reported by the operator (e.g. `v18.2.4`). */
  cephVersion: string
  /** Overall Ceph health as reported by `ceph status`. */
  cephHealth: RookCephHealth
  /** Cluster which hosts the CephCluster (for multi-cluster views). */
  cluster: string
  /** OSD counters. */
  osdTotal: number
  osdUp: number
  osdIn: number
  /** MON quorum. */
  monQuorum: number
  monExpected: number
  /** MGR active / standby counts. */
  mgrActive: number
  mgrStandby: number
  /** Storage capacity in bytes. */
  capacityTotalBytes: number
  capacityUsedBytes: number
  /** Pools + PG summary. */
  pools: number
  pgActiveClean: number
  pgTotal: number
}

export interface RookSummary {
  totalClusters: number
  healthyClusters: number
  degradedClusters: number
  totalOsdUp: number
  totalOsdTotal: number
  totalCapacityBytes: number
  totalUsedBytes: number
}

export interface RookStatusData {
  health: RookInstallHealth
  clusters: RookCephCluster[]
  summary: RookSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data constants — no magic numbers
// ---------------------------------------------------------------------------

const BYTES_PER_GIB = 1024 * 1024 * 1024
const BYTES_PER_TIB = 1024 * BYTES_PER_GIB

// Primary (production-like) CephCluster
const PROD_OSD_TOTAL = 12
const PROD_OSD_UP = 12
const PROD_OSD_IN = 12
const PROD_MON_QUORUM = 3
const PROD_MON_EXPECTED = 3
const PROD_MGR_ACTIVE = 1
const PROD_MGR_STANDBY = 1
const PROD_CAPACITY_TIB = 24
const PROD_USED_TIB = 9
const PROD_POOLS = 7
const PROD_PG_ACTIVE_CLEAN = 512
const PROD_PG_TOTAL = 512

// Edge CephCluster with a flapping OSD (HEALTH_WARN)
const EDGE_OSD_TOTAL = 6
const EDGE_OSD_UP = 5
const EDGE_OSD_IN = 6
const EDGE_MON_QUORUM = 3
const EDGE_MON_EXPECTED = 3
const EDGE_MGR_ACTIVE = 1
const EDGE_MGR_STANDBY = 0
const EDGE_CAPACITY_TIB = 6
const EDGE_USED_GIB = 4200
const EDGE_POOLS = 4
const EDGE_PG_ACTIVE_CLEAN = 244
const EDGE_PG_TOTAL = 256

// ---------------------------------------------------------------------------
// Demo CephCluster records
// ---------------------------------------------------------------------------

const DEMO_CLUSTERS: RookCephCluster[] = [
  {
    namespace: 'rook-ceph',
    name: 'rook-ceph',
    cephVersion: 'v18.2.4',
    cephHealth: 'HEALTH_OK',
    cluster: 'prod-us-east',
    osdTotal: PROD_OSD_TOTAL,
    osdUp: PROD_OSD_UP,
    osdIn: PROD_OSD_IN,
    monQuorum: PROD_MON_QUORUM,
    monExpected: PROD_MON_EXPECTED,
    mgrActive: PROD_MGR_ACTIVE,
    mgrStandby: PROD_MGR_STANDBY,
    capacityTotalBytes: PROD_CAPACITY_TIB * BYTES_PER_TIB,
    capacityUsedBytes: PROD_USED_TIB * BYTES_PER_TIB,
    pools: PROD_POOLS,
    pgActiveClean: PROD_PG_ACTIVE_CLEAN,
    pgTotal: PROD_PG_TOTAL,
  },
  {
    namespace: 'rook-ceph-edge',
    name: 'edge-ceph',
    cephVersion: 'v18.2.2',
    cephHealth: 'HEALTH_WARN',
    cluster: 'edge-dallas',
    osdTotal: EDGE_OSD_TOTAL,
    osdUp: EDGE_OSD_UP,
    osdIn: EDGE_OSD_IN,
    monQuorum: EDGE_MON_QUORUM,
    monExpected: EDGE_MON_EXPECTED,
    mgrActive: EDGE_MGR_ACTIVE,
    mgrStandby: EDGE_MGR_STANDBY,
    capacityTotalBytes: EDGE_CAPACITY_TIB * BYTES_PER_TIB,
    capacityUsedBytes: EDGE_USED_GIB * BYTES_PER_GIB,
    pools: EDGE_POOLS,
    pgActiveClean: EDGE_PG_ACTIVE_CLEAN,
    pgTotal: EDGE_PG_TOTAL,
  },
]

// ---------------------------------------------------------------------------
// Derived summary
// ---------------------------------------------------------------------------

const DEMO_HEALTHY = DEMO_CLUSTERS.filter(c => c.cephHealth === 'HEALTH_OK').length
const DEMO_DEGRADED = DEMO_CLUSTERS.length - DEMO_HEALTHY
const DEMO_TOTAL_OSD_UP = DEMO_CLUSTERS.reduce((sum, c) => sum + c.osdUp, 0)
const DEMO_TOTAL_OSD = DEMO_CLUSTERS.reduce((sum, c) => sum + c.osdTotal, 0)
const DEMO_TOTAL_CAPACITY = DEMO_CLUSTERS.reduce((sum, c) => sum + c.capacityTotalBytes, 0)
const DEMO_TOTAL_USED = DEMO_CLUSTERS.reduce((sum, c) => sum + c.capacityUsedBytes, 0)

export const ROOK_DEMO_DATA: RookStatusData = {
  health: 'degraded',
  clusters: DEMO_CLUSTERS,
  summary: {
    totalClusters: DEMO_CLUSTERS.length,
    healthyClusters: DEMO_HEALTHY,
    degradedClusters: DEMO_DEGRADED,
    totalOsdUp: DEMO_TOTAL_OSD_UP,
    totalOsdTotal: DEMO_TOTAL_OSD,
    totalCapacityBytes: DEMO_TOTAL_CAPACITY,
    totalUsedBytes: DEMO_TOTAL_USED,
  },
  lastCheckTime: new Date().toISOString(),
}
