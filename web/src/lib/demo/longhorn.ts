import { BYTES_PER_GIB, BYTES_PER_TIB } from '../constants/units'

/**
 * Longhorn Status Card — Demo Data & Type Definitions
 *
 * Longhorn (CNCF Incubating) is a cloud-native distributed block storage
 * system for Kubernetes. It replicates volumes across nodes and exposes a
 * PVC-compatible storage class.
 *
 * This card surfaces:
 *  - Volume list (state, robustness, replica count, size)
 *  - Node status (Ready / schedulable)
 *  - Replica health per volume
 *  - Total / used storage capacity across the cluster
 *
 * Shown when Longhorn is not installed or when the user is in demo mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LonghornInstallHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

/**
 * Volume operational state as reported by `volume.status.state`.
 */
export type LonghornVolumeState =
  | 'attached'
  | 'detached'
  | 'attaching'
  | 'detaching'
  | 'creating'
  | 'deleting'

/**
 * Volume robustness as reported by `volume.status.robustness`.
 * `healthy` = all replicas are up-to-date.
 * `degraded` = rebuilding / at least one replica missing.
 * `faulted`  = no healthy replicas; the volume is unusable until restored.
 */
export type LonghornVolumeRobustness = 'healthy' | 'degraded' | 'faulted' | 'unknown'

export interface LonghornVolume {
  /** Volume name (matches the PVC it backs when created via storage class). */
  name: string
  namespace: string
  state: LonghornVolumeState
  robustness: LonghornVolumeRobustness
  /** Desired replica count configured on the volume. */
  replicasDesired: number
  /** Currently healthy replicas. */
  replicasHealthy: number
  sizeBytes: number
  /** Actual data written (reported by the engine). */
  actualSizeBytes: number
  /** Node the engine is attached to (empty when detached). */
  nodeAttached: string
  cluster: string
}

export interface LonghornNode {
  name: string
  cluster: string
  /** `True` means the kubelet reports the node Ready. */
  ready: boolean
  /** Whether Longhorn considers the node schedulable for new replicas. */
  schedulable: boolean
  /** Total storage reserved for Longhorn on this node. */
  storageTotalBytes: number
  storageUsedBytes: number
  replicaCount: number
}

export interface LonghornSummary {
  totalVolumes: number
  healthyVolumes: number
  degradedVolumes: number
  faultedVolumes: number
  totalNodes: number
  readyNodes: number
  schedulableNodes: number
  totalCapacityBytes: number
  totalUsedBytes: number
}

export interface LonghornStatusData {
  health: LonghornInstallHealth
  volumes: LonghornVolume[]
  nodes: LonghornNode[]
  summary: LonghornSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data constants — no magic numbers
// ---------------------------------------------------------------------------

// Per-volume sizes
const VOL_SIZE_SMALL_GIB = 10
const VOL_SIZE_MEDIUM_GIB = 50
const VOL_SIZE_LARGE_GIB = 200
const VOL_SIZE_XLARGE_GIB = 500

// Per-volume used (actual written) bytes — expressed as % of size
const PCT_TO_FRACTION = 100
const VOL_USED_PCT_LOW = 20
const VOL_USED_PCT_MID = 55
const VOL_USED_PCT_HIGH = 80
const VOL_USED_PCT_FULL = 95

// Default replica fan-out
const REPLICAS_DEFAULT = 3
const REPLICAS_HIGH = 4

// Per-node capacity
const NODE_CAPACITY_TIB = 1 // 1 TiB per node × 4 nodes = ~4 TiB cluster total ≈ 3 TiB usable
const NODE1_USED_GIB = 520
const NODE2_USED_GIB = 310
const NODE3_USED_GIB = 780
const NODE4_USED_GIB = 180

const NODE1_REPLICAS = 6
const NODE2_REPLICAS = 4
const NODE3_REPLICAS = 8
const NODE4_REPLICAS = 3

// ---------------------------------------------------------------------------
// Demo volumes — 8 entries covering healthy / degraded / faulted states
// ---------------------------------------------------------------------------

function gibToBytes(gib: number): number {
  return gib * BYTES_PER_GIB
}

function usedFraction(sizeBytes: number, pct: number): number {
  return Math.round((sizeBytes * pct) / PCT_TO_FRACTION)
}

const VOL_MEDIUM_BYTES = gibToBytes(VOL_SIZE_MEDIUM_GIB)
const VOL_LARGE_BYTES = gibToBytes(VOL_SIZE_LARGE_GIB)
const VOL_SMALL_BYTES = gibToBytes(VOL_SIZE_SMALL_GIB)
const VOL_XLARGE_BYTES = gibToBytes(VOL_SIZE_XLARGE_GIB)

const DEMO_VOLUMES: LonghornVolume[] = [
  {
    name: 'pvc-postgres-primary',
    namespace: 'databases',
    state: 'attached',
    robustness: 'healthy',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT,
    sizeBytes: VOL_LARGE_BYTES,
    actualSizeBytes: usedFraction(VOL_LARGE_BYTES, VOL_USED_PCT_HIGH),
    nodeAttached: 'worker-1',
    cluster: 'prod-us-east',
  },
  {
    name: 'pvc-postgres-replica',
    namespace: 'databases',
    state: 'attached',
    robustness: 'healthy',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT,
    sizeBytes: VOL_LARGE_BYTES,
    actualSizeBytes: usedFraction(VOL_LARGE_BYTES, VOL_USED_PCT_MID),
    nodeAttached: 'worker-2',
    cluster: 'prod-us-east',
  },
  {
    name: 'pvc-kafka-broker-0',
    namespace: 'streaming',
    state: 'attached',
    robustness: 'healthy',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT,
    sizeBytes: VOL_MEDIUM_BYTES,
    actualSizeBytes: usedFraction(VOL_MEDIUM_BYTES, VOL_USED_PCT_LOW),
    nodeAttached: 'worker-3',
    cluster: 'prod-us-east',
  },
  {
    name: 'pvc-prometheus-data',
    namespace: 'monitoring',
    state: 'attached',
    robustness: 'degraded',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT - 1,
    sizeBytes: VOL_XLARGE_BYTES,
    actualSizeBytes: usedFraction(VOL_XLARGE_BYTES, VOL_USED_PCT_FULL),
    nodeAttached: 'worker-1',
    cluster: 'prod-us-east',
  },
  {
    name: 'pvc-redis-cache',
    namespace: 'platform',
    state: 'attached',
    robustness: 'healthy',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT,
    sizeBytes: VOL_SMALL_BYTES,
    actualSizeBytes: usedFraction(VOL_SMALL_BYTES, VOL_USED_PCT_MID),
    nodeAttached: 'worker-2',
    cluster: 'prod-us-east',
  },
  {
    name: 'pvc-minio-data',
    namespace: 'storage',
    state: 'attached',
    robustness: 'degraded',
    replicasDesired: REPLICAS_HIGH,
    replicasHealthy: REPLICAS_HIGH - 2,
    sizeBytes: VOL_XLARGE_BYTES,
    actualSizeBytes: usedFraction(VOL_XLARGE_BYTES, VOL_USED_PCT_HIGH),
    nodeAttached: 'worker-3',
    cluster: 'edge-dallas',
  },
  {
    name: 'pvc-grafana-storage',
    namespace: 'monitoring',
    state: 'detached',
    robustness: 'unknown',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: REPLICAS_DEFAULT,
    sizeBytes: VOL_SMALL_BYTES,
    actualSizeBytes: usedFraction(VOL_SMALL_BYTES, VOL_USED_PCT_LOW),
    nodeAttached: '',
    cluster: 'edge-dallas',
  },
  {
    name: 'pvc-elasticsearch-hot',
    namespace: 'logging',
    state: 'attached',
    robustness: 'faulted',
    replicasDesired: REPLICAS_DEFAULT,
    replicasHealthy: 0,
    sizeBytes: VOL_LARGE_BYTES,
    actualSizeBytes: usedFraction(VOL_LARGE_BYTES, VOL_USED_PCT_MID),
    nodeAttached: 'worker-4',
    cluster: 'edge-dallas',
  },
]

// ---------------------------------------------------------------------------
// Demo nodes — 4 entries, 3 TiB total capacity w/ mixed utilization
// ---------------------------------------------------------------------------

const NODE_CAPACITY_BYTES = NODE_CAPACITY_TIB * BYTES_PER_TIB

const DEMO_NODES: LonghornNode[] = [
  {
    name: 'worker-1',
    cluster: 'prod-us-east',
    ready: true,
    schedulable: true,
    storageTotalBytes: NODE_CAPACITY_BYTES,
    storageUsedBytes: gibToBytes(NODE1_USED_GIB),
    replicaCount: NODE1_REPLICAS,
  },
  {
    name: 'worker-2',
    cluster: 'prod-us-east',
    ready: true,
    schedulable: true,
    storageTotalBytes: NODE_CAPACITY_BYTES,
    storageUsedBytes: gibToBytes(NODE2_USED_GIB),
    replicaCount: NODE2_REPLICAS,
  },
  {
    name: 'worker-3',
    cluster: 'prod-us-east',
    ready: true,
    schedulable: false,
    storageTotalBytes: NODE_CAPACITY_BYTES,
    storageUsedBytes: gibToBytes(NODE3_USED_GIB),
    replicaCount: NODE3_REPLICAS,
  },
  {
    name: 'worker-4',
    cluster: 'edge-dallas',
    ready: false,
    schedulable: false,
    storageTotalBytes: NODE_CAPACITY_BYTES,
    storageUsedBytes: gibToBytes(NODE4_USED_GIB),
    replicaCount: NODE4_REPLICAS,
  },
]

// ---------------------------------------------------------------------------
// Derived summary
// ---------------------------------------------------------------------------

const DEMO_HEALTHY_VOLUMES = DEMO_VOLUMES.filter(v => v.robustness === 'healthy').length
const DEMO_DEGRADED_VOLUMES = DEMO_VOLUMES.filter(v => v.robustness === 'degraded').length
const DEMO_FAULTED_VOLUMES = DEMO_VOLUMES.filter(v => v.robustness === 'faulted').length
const DEMO_READY_NODES = DEMO_NODES.filter(n => n.ready).length
const DEMO_SCHEDULABLE_NODES = DEMO_NODES.filter(n => n.schedulable).length
const DEMO_TOTAL_CAPACITY = DEMO_NODES.reduce((sum, n) => sum + n.storageTotalBytes, 0)
const DEMO_TOTAL_USED = DEMO_NODES.reduce((sum, n) => sum + n.storageUsedBytes, 0)

export const LONGHORN_DEMO_DATA: LonghornStatusData = {
  health: 'degraded',
  volumes: DEMO_VOLUMES,
  nodes: DEMO_NODES,
  summary: {
    totalVolumes: DEMO_VOLUMES.length,
    healthyVolumes: DEMO_HEALTHY_VOLUMES,
    degradedVolumes: DEMO_DEGRADED_VOLUMES,
    faultedVolumes: DEMO_FAULTED_VOLUMES,
    totalNodes: DEMO_NODES.length,
    readyNodes: DEMO_READY_NODES,
    schedulableNodes: DEMO_SCHEDULABLE_NODES,
    totalCapacityBytes: DEMO_TOTAL_CAPACITY,
    totalUsedBytes: DEMO_TOTAL_USED,
  },
  lastCheckTime: new Date().toISOString(),
}
