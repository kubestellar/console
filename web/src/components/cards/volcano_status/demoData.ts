/**
 * Volcano Status Card — Demo Data & Type Definitions
 *
 * Volcano is a CNCF Incubating batch/HPC scheduler that extends Kubernetes
 * with gang scheduling, fair-share queues, preemption, and per-job resource
 * accounting. It's the de-facto scheduler for AI/ML training, HPC, and
 * big-data workloads on Kubernetes.
 *
 * This card surfaces the operational signals a platform team needs to
 * monitor a Volcano deployment:
 *  - Queues with weight, capability, and allocated / guaranteed capacity
 *  - Jobs grouped by phase (pending, running, completed, failed)
 *  - Pod groups (the unit of gang scheduling) and their scheduling state
 *  - Aggregate GPU allocation across the batch workload
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Volcano bridge lands (`/api/volcano/status`), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VolcanoHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type VolcanoJobPhase =
  | 'Pending'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Aborted'
export type PodGroupPhase =
  | 'Pending'
  | 'Inqueue'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Unknown'
export type QueueState = 'Open' | 'Closed' | 'Closing'

export interface VolcanoQueue {
  name: string
  state: QueueState
  weight: number
  runningJobs: number
  pendingJobs: number
  allocatedCpu: number
  allocatedMemGiB: number
  allocatedGpu: number
  capabilityCpu: number
  capabilityMemGiB: number
  capabilityGpu: number
  cluster: string
}

export interface VolcanoJob {
  name: string
  namespace: string
  queue: string
  phase: VolcanoJobPhase
  minAvailable: number
  runningPods: number
  totalPods: number
  gpuRequest: number
  cluster: string
  createdAt: string
}

export interface VolcanoPodGroup {
  name: string
  namespace: string
  queue: string
  phase: PodGroupPhase
  minMember: number
  runningMember: number
  cluster: string
}

export interface VolcanoStats {
  totalQueues: number
  openQueues: number
  totalJobs: number
  pendingJobs: number
  runningJobs: number
  completedJobs: number
  failedJobs: number
  totalPodGroups: number
  allocatedGpu: number
  schedulerVersion: string
}

export interface VolcanoSummary {
  totalQueues: number
  totalJobs: number
  totalPodGroups: number
  allocatedGpu: number
}

export interface VolcanoStatusData {
  health: VolcanoHealth
  queues: VolcanoQueue[]
  jobs: VolcanoJob[]
  podGroups: VolcanoPodGroup[]
  stats: VolcanoStats
  summary: VolcanoSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_SCHEDULER_VERSION = '1.9.0'
const DEMO_CLUSTER_PRIMARY = 'prod-east'
const DEMO_CLUSTER_SECONDARY = 'prod-west'

// Queue capabilities & allocations
const DEFAULT_QUEUE_WEIGHT = 1
const HIGH_PRIORITY_QUEUE_WEIGHT = 4
const ML_TRAINING_QUEUE_WEIGHT = 2

const DEFAULT_QUEUE_CAP_CPU = 64
const DEFAULT_QUEUE_CAP_MEM_GIB = 256
const DEFAULT_QUEUE_CAP_GPU = 4
const DEFAULT_QUEUE_ALLOC_CPU = 18
const DEFAULT_QUEUE_ALLOC_MEM_GIB = 72
const DEFAULT_QUEUE_ALLOC_GPU = 1
const DEFAULT_QUEUE_RUNNING = 3
const DEFAULT_QUEUE_PENDING = 1

const HIGH_PRIORITY_CAP_CPU = 128
const HIGH_PRIORITY_CAP_MEM_GIB = 512
const HIGH_PRIORITY_CAP_GPU = 8
const HIGH_PRIORITY_ALLOC_CPU = 96
const HIGH_PRIORITY_ALLOC_MEM_GIB = 384
const HIGH_PRIORITY_ALLOC_GPU = 6
const HIGH_PRIORITY_RUNNING = 5
const HIGH_PRIORITY_PENDING = 2

const ML_TRAINING_CAP_CPU = 256
const ML_TRAINING_CAP_MEM_GIB = 1024
const ML_TRAINING_CAP_GPU = 32
const ML_TRAINING_ALLOC_CPU = 192
const ML_TRAINING_ALLOC_MEM_GIB = 768
const ML_TRAINING_ALLOC_GPU = 24
const ML_TRAINING_RUNNING = 7
const ML_TRAINING_PENDING = 4

// Job counts (15 jobs total — distributed across phases)
const DEMO_TOTAL_JOBS = 15
const DEMO_PENDING_JOBS = 3
const DEMO_RUNNING_JOBS = 6
const DEMO_COMPLETED_JOBS = 5
const DEMO_FAILED_JOBS = 1

// Pod-group count
const DEMO_POD_GROUP_COUNT = 42

// Aggregate GPU allocation
const DEMO_ALLOCATED_GPU_TOTAL =
  DEFAULT_QUEUE_ALLOC_GPU + HIGH_PRIORITY_ALLOC_GPU + ML_TRAINING_ALLOC_GPU

// Per-job sizing
const JOB_MIN_AVAILABLE_SMALL = 2
const JOB_MIN_AVAILABLE_MEDIUM = 4
const JOB_MIN_AVAILABLE_LARGE = 8

const JOB_TOTAL_PODS_SMALL = 2
const JOB_TOTAL_PODS_MEDIUM = 4
const JOB_TOTAL_PODS_LARGE = 8

const JOB_GPU_NONE = 0
const JOB_GPU_SMALL = 1
const JOB_GPU_MEDIUM = 2
const JOB_GPU_LARGE = 4

// Pod-group members
const PG_MIN_SMALL = 2
const PG_MIN_MEDIUM = 4
const PG_MIN_LARGE = 8

const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const SIX_HOURS_MS = 6 * MS_PER_HOUR

// ---------------------------------------------------------------------------
// Demo data — shown when Volcano is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_QUEUES: VolcanoQueue[] = [
  {
    name: 'default',
    state: 'Open',
    weight: DEFAULT_QUEUE_WEIGHT,
    runningJobs: DEFAULT_QUEUE_RUNNING,
    pendingJobs: DEFAULT_QUEUE_PENDING,
    allocatedCpu: DEFAULT_QUEUE_ALLOC_CPU,
    allocatedMemGiB: DEFAULT_QUEUE_ALLOC_MEM_GIB,
    allocatedGpu: DEFAULT_QUEUE_ALLOC_GPU,
    capabilityCpu: DEFAULT_QUEUE_CAP_CPU,
    capabilityMemGiB: DEFAULT_QUEUE_CAP_MEM_GIB,
    capabilityGpu: DEFAULT_QUEUE_CAP_GPU,
    cluster: DEMO_CLUSTER_PRIMARY,
  },
  {
    name: 'high-priority',
    state: 'Open',
    weight: HIGH_PRIORITY_QUEUE_WEIGHT,
    runningJobs: HIGH_PRIORITY_RUNNING,
    pendingJobs: HIGH_PRIORITY_PENDING,
    allocatedCpu: HIGH_PRIORITY_ALLOC_CPU,
    allocatedMemGiB: HIGH_PRIORITY_ALLOC_MEM_GIB,
    allocatedGpu: HIGH_PRIORITY_ALLOC_GPU,
    capabilityCpu: HIGH_PRIORITY_CAP_CPU,
    capabilityMemGiB: HIGH_PRIORITY_CAP_MEM_GIB,
    capabilityGpu: HIGH_PRIORITY_CAP_GPU,
    cluster: DEMO_CLUSTER_PRIMARY,
  },
  {
    name: 'ml-training',
    state: 'Open',
    weight: ML_TRAINING_QUEUE_WEIGHT,
    runningJobs: ML_TRAINING_RUNNING,
    pendingJobs: ML_TRAINING_PENDING,
    allocatedCpu: ML_TRAINING_ALLOC_CPU,
    allocatedMemGiB: ML_TRAINING_ALLOC_MEM_GIB,
    allocatedGpu: ML_TRAINING_ALLOC_GPU,
    capabilityCpu: ML_TRAINING_CAP_CPU,
    capabilityMemGiB: ML_TRAINING_CAP_MEM_GIB,
    capabilityGpu: ML_TRAINING_CAP_GPU,
    cluster: DEMO_CLUSTER_SECONDARY,
  },
]

const DEMO_JOBS: VolcanoJob[] = [
  {
    name: 'resnet50-train-001',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Running',
    minAvailable: JOB_MIN_AVAILABLE_LARGE,
    runningPods: JOB_TOTAL_PODS_LARGE,
    totalPods: JOB_TOTAL_PODS_LARGE,
    gpuRequest: JOB_GPU_LARGE,
    cluster: DEMO_CLUSTER_SECONDARY,
    createdAt: new Date(Date.now() - MS_PER_HOUR).toISOString(),
  },
  {
    name: 'bert-finetune-042',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Running',
    minAvailable: JOB_MIN_AVAILABLE_MEDIUM,
    runningPods: JOB_TOTAL_PODS_MEDIUM,
    totalPods: JOB_TOTAL_PODS_MEDIUM,
    gpuRequest: JOB_GPU_MEDIUM,
    cluster: DEMO_CLUSTER_SECONDARY,
    createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
  },
  {
    name: 'spark-etl-nightly',
    namespace: 'data',
    queue: 'high-priority',
    phase: 'Running',
    minAvailable: JOB_MIN_AVAILABLE_MEDIUM,
    runningPods: JOB_TOTAL_PODS_MEDIUM,
    totalPods: JOB_TOTAL_PODS_MEDIUM,
    gpuRequest: JOB_GPU_NONE,
    cluster: DEMO_CLUSTER_PRIMARY,
    createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
  },
  {
    name: 'hyperparam-sweep-17',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Pending',
    minAvailable: JOB_MIN_AVAILABLE_LARGE,
    runningPods: 0,
    totalPods: JOB_TOTAL_PODS_LARGE,
    gpuRequest: JOB_GPU_LARGE,
    cluster: DEMO_CLUSTER_SECONDARY,
    createdAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
  },
  {
    name: 'monte-carlo-sim',
    namespace: 'research',
    queue: 'default',
    phase: 'Completed',
    minAvailable: JOB_MIN_AVAILABLE_SMALL,
    runningPods: 0,
    totalPods: JOB_TOTAL_PODS_SMALL,
    gpuRequest: JOB_GPU_NONE,
    cluster: DEMO_CLUSTER_PRIMARY,
    createdAt: new Date(Date.now() - MS_PER_DAY).toISOString(),
  },
  {
    name: 'llama-eval-007',
    namespace: 'ml-training',
    queue: 'high-priority',
    phase: 'Failed',
    minAvailable: JOB_MIN_AVAILABLE_MEDIUM,
    runningPods: 0,
    totalPods: JOB_TOTAL_PODS_MEDIUM,
    gpuRequest: JOB_GPU_MEDIUM,
    cluster: DEMO_CLUSTER_PRIMARY,
    createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
  },
  {
    name: 'genomics-align-21',
    namespace: 'research',
    queue: 'default',
    phase: 'Running',
    minAvailable: JOB_MIN_AVAILABLE_SMALL,
    runningPods: JOB_TOTAL_PODS_SMALL,
    totalPods: JOB_TOTAL_PODS_SMALL,
    gpuRequest: JOB_GPU_SMALL,
    cluster: DEMO_CLUSTER_PRIMARY,
    createdAt: new Date(Date.now() - MS_PER_HOUR).toISOString(),
  },
]

const DEMO_POD_GROUPS: VolcanoPodGroup[] = [
  {
    name: 'resnet50-train-001-pg',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Running',
    minMember: PG_MIN_LARGE,
    runningMember: PG_MIN_LARGE,
    cluster: DEMO_CLUSTER_SECONDARY,
  },
  {
    name: 'bert-finetune-042-pg',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Running',
    minMember: PG_MIN_MEDIUM,
    runningMember: PG_MIN_MEDIUM,
    cluster: DEMO_CLUSTER_SECONDARY,
  },
  {
    name: 'spark-etl-nightly-pg',
    namespace: 'data',
    queue: 'high-priority',
    phase: 'Running',
    minMember: PG_MIN_MEDIUM,
    runningMember: PG_MIN_MEDIUM,
    cluster: DEMO_CLUSTER_PRIMARY,
  },
  {
    name: 'hyperparam-sweep-17-pg',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Inqueue',
    minMember: PG_MIN_LARGE,
    runningMember: 0,
    cluster: DEMO_CLUSTER_SECONDARY,
  },
  {
    name: 'genomics-align-21-pg',
    namespace: 'research',
    queue: 'default',
    phase: 'Running',
    minMember: PG_MIN_SMALL,
    runningMember: PG_MIN_SMALL,
    cluster: DEMO_CLUSTER_PRIMARY,
  },
]

export const VOLCANO_DEMO_DATA: VolcanoStatusData = {
  health: 'healthy',
  queues: DEMO_QUEUES,
  jobs: DEMO_JOBS,
  podGroups: DEMO_POD_GROUPS,
  stats: {
    totalQueues: DEMO_QUEUES.length,
    openQueues: DEMO_QUEUES.filter(q => q.state === 'Open').length,
    totalJobs: DEMO_TOTAL_JOBS,
    pendingJobs: DEMO_PENDING_JOBS,
    runningJobs: DEMO_RUNNING_JOBS,
    completedJobs: DEMO_COMPLETED_JOBS,
    failedJobs: DEMO_FAILED_JOBS,
    totalPodGroups: DEMO_POD_GROUP_COUNT,
    allocatedGpu: DEMO_ALLOCATED_GPU_TOTAL,
    schedulerVersion: DEMO_SCHEDULER_VERSION,
  },
  summary: {
    totalQueues: DEMO_QUEUES.length,
    totalJobs: DEMO_TOTAL_JOBS,
    totalPodGroups: DEMO_POD_GROUP_COUNT,
    allocatedGpu: DEMO_ALLOCATED_GPU_TOTAL,
  },
  lastCheckTime: new Date().toISOString(),
}
