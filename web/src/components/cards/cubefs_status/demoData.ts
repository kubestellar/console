/**
 * Demo data for the CubeFS (CNCF graduated) distributed file system status card.
 *
 * Represents a typical production environment using CubeFS for
 * distributed storage on Kubernetes.
 *
 * CubeFS terminology:
 * - Cluster:     a CubeFS deployment comprising master, metadata, data nodes,
 *                and optional ObjectNode/BlobStore gateways.
 * - Volume:      the basic unit of storage — a logical namespace backed by
 *                multiple data partitions spread across data nodes.
 * - MetaNode:    metadata server that stores inode/dentry trees for volumes.
 * - DataNode:    stores actual file data in data partitions (replicated or EC).
 * - Master:      cluster coordinator managing topology, partition placement,
 *                and volume lifecycle.
 */

const DEMO_LAST_CHECK_OFFSET_MS = 30_000

// ---------------------------------------------------------------------------
// Volume types
// ---------------------------------------------------------------------------

export type CubefsVolumeStatus = 'active' | 'inactive' | 'read-only' | 'unknown'

export interface CubefsVolume {
  name: string
  /** Owner or tenant identifier */
  owner: string
  status: CubefsVolumeStatus
  /** Volume capacity (human-readable, e.g. "500 GiB") */
  capacity: string
  /** Currently used storage (human-readable, e.g. "320 GiB") */
  usedSize: string
  /** Usage percentage (0–100) */
  usagePercent: number
  /** Number of data partitions */
  dataPartitions: number
  /** Number of metadata partitions */
  metaPartitions: number
  /** Replica count for data partitions */
  replicaCount: number
}

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

export type CubefsNodeStatus = 'active' | 'inactive' | 'unknown'

export interface CubefsNode {
  /** Node hostname or IP */
  address: string
  /** Node role: master | meta | data */
  role: 'master' | 'meta' | 'data'
  status: CubefsNodeStatus
  /** Total disk capacity (human-readable, e.g. "2 TiB") */
  totalDisk: string
  /** Used disk (human-readable, e.g. "1.2 TiB") */
  usedDisk: string
  /** Disk usage percentage (0–100) */
  diskUsagePercent: number
  /** Number of partitions hosted */
  partitions: number
}

// ---------------------------------------------------------------------------
// Aggregate type
// ---------------------------------------------------------------------------

export interface CubefsDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  clusterName: string
  masterLeader: string
  volumes: CubefsVolume[]
  nodes: CubefsNode[]
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export const CUBEFS_DEMO_DATA: CubefsDemoData = {
  health: 'degraded',
  clusterName: 'cubefs-prod',
  masterLeader: '10.0.1.10:17010',
  volumes: [
    {
      name: 'ml-datasets',
      owner: 'ml-team',
      status: 'active',
      capacity: '500 GiB',
      usedSize: '387 GiB',
      usagePercent: 77,
      dataPartitions: 48,
      metaPartitions: 12,
      replicaCount: 3,
    },
    {
      name: 'user-uploads',
      owner: 'platform',
      status: 'active',
      capacity: '1 TiB',
      usedSize: '612 GiB',
      usagePercent: 60,
      dataPartitions: 96,
      metaPartitions: 24,
      replicaCount: 3,
    },
    {
      name: 'log-archive',
      owner: 'observability',
      status: 'read-only',
      capacity: '2 TiB',
      usedSize: '1.9 TiB',
      usagePercent: 95,
      dataPartitions: 192,
      metaPartitions: 32,
      replicaCount: 2,
    },
    {
      name: 'staging-data',
      owner: 'dev-team',
      status: 'inactive',
      capacity: '200 GiB',
      usedSize: '0 GiB',
      usagePercent: 0,
      dataPartitions: 0,
      metaPartitions: 0,
      replicaCount: 3,
    },
  ],
  nodes: [
    {
      address: '10.0.1.10:17010',
      role: 'master',
      status: 'active',
      totalDisk: '100 GiB',
      usedDisk: '12 GiB',
      diskUsagePercent: 12,
      partitions: 0,
    },
    {
      address: '10.0.1.11:17010',
      role: 'master',
      status: 'active',
      totalDisk: '100 GiB',
      usedDisk: '10 GiB',
      diskUsagePercent: 10,
      partitions: 0,
    },
    {
      address: '10.0.1.12:17010',
      role: 'master',
      status: 'inactive',
      totalDisk: '100 GiB',
      usedDisk: '8 GiB',
      diskUsagePercent: 8,
      partitions: 0,
    },
    {
      address: '10.0.2.20:17210',
      role: 'meta',
      status: 'active',
      totalDisk: '500 GiB',
      usedDisk: '145 GiB',
      diskUsagePercent: 29,
      partitions: 34,
    },
    {
      address: '10.0.2.21:17210',
      role: 'meta',
      status: 'active',
      totalDisk: '500 GiB',
      usedDisk: '132 GiB',
      diskUsagePercent: 26,
      partitions: 34,
    },
    {
      address: '10.0.3.30:17310',
      role: 'data',
      status: 'active',
      totalDisk: '4 TiB',
      usedDisk: '2.8 TiB',
      diskUsagePercent: 70,
      partitions: 112,
    },
    {
      address: '10.0.3.31:17310',
      role: 'data',
      status: 'active',
      totalDisk: '4 TiB',
      usedDisk: '3.1 TiB',
      diskUsagePercent: 78,
      partitions: 112,
    },
    {
      address: '10.0.3.32:17310',
      role: 'data',
      status: 'active',
      totalDisk: '4 TiB',
      usedDisk: '2.5 TiB',
      diskUsagePercent: 63,
      partitions: 112,
    },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
