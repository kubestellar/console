/**
 * Demo data and type definitions for the KubeRay Fleet Monitor card.
 *
 * Discovers RayCluster, RayService, and RayJob CRDs across all clusters
 * and aggregates fleet-level Ray workload status.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RayClusterState = 'ready' | 'unhealthy' | 'suspended' | 'unknown'
export type RayJobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'STOPPED'
export type RayServiceStatus = 'Running' | 'Deploying' | 'FailedToGetOrCreateRayCluster' | 'WaitForServeDeploymentReady' | 'Unknown'

export interface RayClusterInfo {
  name: string
  namespace: string
  cluster: string
  state: RayClusterState
  desiredWorkers: number
  availableWorkers: number
  headPodIP: string
  gpuCount: number
}

export interface RayServiceInfo {
  name: string
  namespace: string
  cluster: string
  status: RayServiceStatus
  activeClusterName: string
  pendingUpgrade: boolean
}

export interface RayJobInfo {
  name: string
  namespace: string
  cluster: string
  jobStatus: RayJobStatus
  submissionId: string
}

export interface KubeRayFleetData {
  detected: boolean
  rayClusters: RayClusterInfo[]
  rayServices: RayServiceInfo[]
  rayJobs: RayJobInfo[]
  totalGPUs: number
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_LAST_CHECK_AGE_MS = 45_000
const DEMO_GPU_TOTAL = 24

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

export const KUBERAY_FLEET_DEMO_DATA: KubeRayFleetData = {
  detected: true,
  rayClusters: [
    {
      name: 'llm-serve-cluster',
      namespace: 'ml-inference',
      cluster: 'us-east-prod',
      state: 'ready',
      desiredWorkers: 4,
      availableWorkers: 4,
      headPodIP: '10.0.5.12',
      gpuCount: 8,
    },
    {
      name: 'llm-serve-cluster',
      namespace: 'ml-inference',
      cluster: 'eu-west-prod',
      state: 'ready',
      desiredWorkers: 3,
      availableWorkers: 3,
      headPodIP: '10.1.2.8',
      gpuCount: 6,
    },
    {
      name: 'batch-training',
      namespace: 'ml-training',
      cluster: 'us-east-prod',
      state: 'ready',
      desiredWorkers: 8,
      availableWorkers: 6,
      headPodIP: '10.0.7.22',
      gpuCount: 10,
    },
  ],
  rayServices: [
    {
      name: 'text-generation-svc',
      namespace: 'ml-inference',
      cluster: 'us-east-prod',
      status: 'Running',
      activeClusterName: 'llm-serve-cluster',
      pendingUpgrade: false,
    },
    {
      name: 'text-generation-svc',
      namespace: 'ml-inference',
      cluster: 'eu-west-prod',
      status: 'Running',
      activeClusterName: 'llm-serve-cluster',
      pendingUpgrade: true,
    },
  ],
  rayJobs: [
    {
      name: 'fine-tune-llama-3',
      namespace: 'ml-training',
      cluster: 'us-east-prod',
      jobStatus: 'RUNNING',
      submissionId: 'raysubmit_abc123',
    },
    {
      name: 'eval-benchmark-v2',
      namespace: 'ml-training',
      cluster: 'us-east-prod',
      jobStatus: 'SUCCEEDED',
      submissionId: 'raysubmit_def456',
    },
    {
      name: 'embedding-index-rebuild',
      namespace: 'ml-inference',
      cluster: 'eu-west-prod',
      jobStatus: 'PENDING',
      submissionId: 'raysubmit_ghi789',
    },
  ],
  totalGPUs: DEMO_GPU_TOTAL,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGE_MS).toISOString(),
}
