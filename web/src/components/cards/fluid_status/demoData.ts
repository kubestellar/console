/**
 * Demo data for the Fluid (CNCF incubating) dataset caching status card.
 *
 * Represents a typical production environment using Fluid to accelerate
 * data access for AI/Big Data workloads on Kubernetes.
 *
 * Fluid terminology:
 * - Dataset:     abstract of a data source (S3, HDFS, OSS, Ceph) treated as
 *                a first-class Kubernetes resource with caching semantics.
 * - Runtime:     the distributed caching engine backing a Dataset
 *                (AlluxioRuntime, JuiceFSRuntime, JindoRuntime, etc.).
 * - DataLoad:    a batch job that pre-loads data from remote storage into
 *                the cache tier before workloads start.
 */

const DEMO_LAST_CHECK_OFFSET_MS = 45_000

// ---------------------------------------------------------------------------
// Dataset types
// ---------------------------------------------------------------------------

export type FluidDatasetStatus = 'bound' | 'not-bound' | 'unknown'

export interface FluidDataset {
  name: string
  namespace: string
  status: FluidDatasetStatus
  /** Remote storage source (e.g. "s3://bucket/path", "hdfs://…") */
  source: string
  /** Percentage of data cached locally (0–100) */
  cachedPercentage: number
  /** Human-readable total size (e.g. "128 GiB") */
  totalSize: string
  /** Number of files tracked */
  fileCount: number
  /** Runtime type bound to this dataset */
  runtimeType: string
}

// ---------------------------------------------------------------------------
// Runtime types
// ---------------------------------------------------------------------------

export type FluidRuntimeStatus = 'ready' | 'not-ready' | 'unknown'

export interface FluidRuntime {
  name: string
  namespace: string
  /** Caching engine type (Alluxio, JuiceFS, JindoFS, etc.) */
  type: string
  status: FluidRuntimeStatus
  /** Master pod readiness */
  masterReady: { ready: number; total: number }
  /** Worker pod readiness */
  workerReady: { ready: number; total: number }
  /** Fuse pod readiness */
  fuseReady: { ready: number; total: number }
  /** Total cache capacity (human-readable, e.g. "200 GiB") */
  cacheCapacity: string
  /** Currently used cache (human-readable, e.g. "128 GiB") */
  cacheUsed: string
}

// ---------------------------------------------------------------------------
// DataLoad types
// ---------------------------------------------------------------------------

export type FluidDataLoadPhase =
  | 'pending'
  | 'loading'
  | 'complete'
  | 'failed'

export interface FluidDataLoad {
  name: string
  namespace: string
  /** Target dataset name */
  dataset: string
  phase: FluidDataLoadPhase
  /** Load progress percentage (0–100) */
  progress: number
  /** Duration string (e.g. "3m 12s") */
  duration: string
}

// ---------------------------------------------------------------------------
// Aggregate type
// ---------------------------------------------------------------------------

export interface FluidDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  controllerPods: { ready: number; total: number }
  datasets: FluidDataset[]
  runtimes: FluidRuntime[]
  dataLoads: FluidDataLoad[]
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export const FLUID_DEMO_DATA: FluidDemoData = {
  health: 'degraded',
  controllerPods: { ready: 2, total: 3 },
  datasets: [
    {
      name: 'imagenet-train',
      namespace: 'ml-training',
      status: 'bound',
      source: 's3://datasets/imagenet/train',
      cachedPercentage: 87,
      totalSize: '256 GiB',
      fileCount: 1281167,
      runtimeType: 'Alluxio',
    },
    {
      name: 'nlp-corpus',
      namespace: 'ml-training',
      status: 'bound',
      source: 'hdfs://namenode:9000/data/nlp',
      cachedPercentage: 100,
      totalSize: '64 GiB',
      fileCount: 45320,
      runtimeType: 'JuiceFS',
    },
    {
      name: 'feature-store',
      namespace: 'production',
      status: 'not-bound',
      source: 'oss://ml-features/v2',
      cachedPercentage: 0,
      totalSize: '512 GiB',
      fileCount: 0,
      runtimeType: '',
    },
    {
      name: 'log-archive',
      namespace: 'analytics',
      status: 'bound',
      source: 's3://company-logs/2025',
      cachedPercentage: 42,
      totalSize: '1.2 TiB',
      fileCount: 892340,
      runtimeType: 'Alluxio',
    },
  ],
  runtimes: [
    {
      name: 'imagenet-train',
      namespace: 'ml-training',
      type: 'Alluxio',
      status: 'ready',
      masterReady: { ready: 1, total: 1 },
      workerReady: { ready: 3, total: 3 },
      fuseReady: { ready: 3, total: 3 },
      cacheCapacity: '300 GiB',
      cacheUsed: '223 GiB',
    },
    {
      name: 'nlp-corpus',
      namespace: 'ml-training',
      type: 'JuiceFS',
      status: 'ready',
      masterReady: { ready: 1, total: 1 },
      workerReady: { ready: 2, total: 2 },
      fuseReady: { ready: 2, total: 2 },
      cacheCapacity: '80 GiB',
      cacheUsed: '64 GiB',
    },
    {
      name: 'log-archive',
      namespace: 'analytics',
      type: 'Alluxio',
      status: 'not-ready',
      masterReady: { ready: 1, total: 1 },
      workerReady: { ready: 1, total: 3 },
      fuseReady: { ready: 1, total: 3 },
      cacheCapacity: '500 GiB',
      cacheUsed: '210 GiB',
    },
  ],
  dataLoads: [
    {
      name: 'imagenet-warmup',
      namespace: 'ml-training',
      dataset: 'imagenet-train',
      phase: 'complete',
      progress: 100,
      duration: '12m 34s',
    },
    {
      name: 'log-archive-preload',
      namespace: 'analytics',
      dataset: 'log-archive',
      phase: 'loading',
      progress: 42,
      duration: '8m 15s',
    },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
