/**
 * Demo data generators for useCached* hooks.
 *
 * Each function returns a fresh copy of synthetic data used as fallback when
 * the backend is in demo mode or unreachable.
 *
 * Internal — not part of the public API surface.
 */

import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
  SecurityIssue,
  NodeInfo,
  GPUNode,
  GPUNodeHealthStatus,
  PVC,
  Job,
  HPA,
  HelmRelease,
  HelmHistoryEntry,
  Operator,
  OperatorSubscription,
  GitOpsDrift,
  BuildpackImage,
  ConfigMap,
  Secret,
  ServiceAccount,
  ReplicaSet,
  StatefulSet,
  DaemonSet,
  CronJob,
  Ingress,
  NetworkPolicy,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccountInfo,
} from '../useMCP'
import type { Workload } from '../useWorkloads'
import type { CiliumStatus } from '../../types/cilium'
import type { JaegerStatus } from '../../types/jaeger'

// ---------------------------------------------------------------------------
// Local type stubs used only by demo data — avoid circular import with
// useCachedGPU.ts which imports *from* this file. The canonical definitions
// live in useCachedGPU.ts and are re-exported from useCachedData.ts.
// ---------------------------------------------------------------------------

interface _DeviceAlert {
  id: string
  nodeName: string
  cluster: string
  deviceType: string
  previousCount: number
  currentCount: number
  droppedCount: number
  firstSeen: string
  lastSeen: string
  severity: string
}

interface _DeviceCounts {
  gpuCount: number
  nicCount: number
  nvmeCount: number
  infinibandCount: number
  sriovCapable: boolean
  rdmaAvailable: boolean
  mellanoxPresent: boolean
  nvidiaNicPresent: boolean
  spectrumScale: boolean
  mofedReady: boolean
  gpuDriverReady: boolean
}

interface _NodeDeviceInventory {
  nodeName: string
  cluster: string
  devices: _DeviceCounts
  lastSeen: string
}

interface _HardwareHealthData {
  alerts: _DeviceAlert[]
  inventory: _NodeDeviceInventory[]
  nodeCount: number
  lastUpdate: string | null
}

// CoreDNSClusterStatus stub — canonical def in useCachedNodes.ts
interface _CoreDNSPodInfo {
  name: string
  status: string
  ready: string
  restarts: number
  version: string
}

interface _CoreDNSClusterStatus {
  cluster: string
  pods: _CoreDNSPodInfo[]
  healthy: boolean
  totalRestarts: number
}

// ============================================================================
// Core workload demo data
// ============================================================================

export const getDemoPods = (): PodInfo[] => [
  { name: 'frontend-7d8f9c4b5-x2km4', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '2d', cpuRequestMillis: 500, memoryRequestBytes: 536870912, cpuUsageMillis: 320, memoryUsageBytes: 412516352, metricsAvailable: true },
  { name: 'backend-api-6c8d7f5e4-j3ln9', namespace: 'production', status: 'Running', ready: '2/2', restarts: 1, age: '5d', cpuRequestMillis: 1000, memoryRequestBytes: 1073741824, cpuUsageMillis: 850, memoryUsageBytes: 892871680, metricsAvailable: true },
  { name: 'ml-worker-8f9a6b7c3-k4lm2', namespace: 'ml-workloads', status: 'Running', ready: '1/1', restarts: 0, age: '1d', cpuRequestMillis: 4000, memoryRequestBytes: 8589934592, gpuRequest: 2, cpuUsageMillis: 3200, memoryUsageBytes: 7516192768, metricsAvailable: true },
  { name: 'inference-server-5d4c3b2a1-n7op9', namespace: 'ml-workloads', status: 'Running', ready: '1/1', restarts: 2, age: '3d', cpuRequestMillis: 2000, memoryRequestBytes: 4294967296, gpuRequest: 1, cpuUsageMillis: 1850, memoryUsageBytes: 3865470566, metricsAvailable: true },
  { name: 'cache-redis-6e5d4c3b2-q8rs1', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '7d', cpuRequestMillis: 250, memoryRequestBytes: 268435456, cpuUsageMillis: 45, memoryUsageBytes: 134217728, metricsAvailable: true },
]

export const getDemoEvents = (): ClusterEvent[] => {
  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60000).toISOString()
  return [
    { type: 'Warning', reason: 'FailedScheduling', message: 'No nodes available to schedule pod', object: 'Pod/worker-5c6d7e8f9-n3p2q', namespace: 'default', cluster: 'eks-prod-us-east-1', count: 3, firstSeen: minutesAgo(25), lastSeen: minutesAgo(5) },
    { type: 'Normal', reason: 'Started', message: 'Container started successfully', object: 'Pod/web-frontend-8e9f0a1b2-def34', namespace: 'production', cluster: 'gke-staging', count: 1, firstSeen: minutesAgo(12), lastSeen: minutesAgo(12) },
    { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'Pod/api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', count: 15, firstSeen: minutesAgo(45), lastSeen: minutesAgo(2) },
    { type: 'Normal', reason: 'Pulled', message: 'Container image pulled successfully', object: 'Pod/frontend-8e9f0a1b2-def34', namespace: 'production', cluster: 'gke-staging', count: 1, firstSeen: minutesAgo(8), lastSeen: minutesAgo(8) },
    { type: 'Warning', reason: 'Unhealthy', message: 'Readiness probe failed: connection refused', object: 'Pod/cache-redis-0', namespace: 'data', cluster: 'gke-staging', count: 8, firstSeen: minutesAgo(30), lastSeen: minutesAgo(1) },
    { type: 'Normal', reason: 'ScalingReplicaSet', message: 'Scaled up replica set api-gateway-7d8c to 3', object: 'Deployment/api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', count: 1, firstSeen: minutesAgo(18), lastSeen: minutesAgo(18) },
    { type: 'Normal', reason: 'SuccessfulCreate', message: 'Created pod: worker-5c6d7e8f9-abc12', object: 'ReplicaSet/worker-5c6d7e8f9', namespace: 'batch', cluster: 'vllm-gpu-cluster', count: 1, firstSeen: minutesAgo(22), lastSeen: minutesAgo(22) },
    { type: 'Warning', reason: 'FailedMount', message: 'MountVolume.SetUp failed for volume "config": configmap "app-config" not found', object: 'Pod/ml-inference-7f8g9h-xyz99', namespace: 'ml', cluster: 'vllm-gpu-cluster', count: 4, firstSeen: minutesAgo(35), lastSeen: minutesAgo(3) },
  ]
}

export const getDemoPodIssues = (): PodIssue[] => [
  { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'CrashLoopBackOff', issues: ['Container restarting', 'OOMKilled'], restarts: 15 },
  { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-gpu-cluster', status: 'ImagePullBackOff', issues: ['Failed to pull image'], restarts: 0 },
  { name: 'cache-redis-0', namespace: 'data', cluster: 'gke-staging', status: 'Pending', issues: ['Insufficient memory'], restarts: 0 },
  { name: 'metrics-collector-2b4c6-j8k9l', namespace: 'monitoring', cluster: 'aks-dev-westeu', status: 'CrashLoopBackOff', issues: ['Exit code 137'], restarts: 8 },
  { name: 'gpu-scheduler-0', namespace: 'ml-ops', cluster: 'vllm-gpu-cluster', status: 'Pending', issues: ['Insufficient nvidia.com/gpu'], restarts: 0 },
]

export const getDemoDeploymentIssues = (): DeploymentIssue[] => [
  { name: 'web-frontend', namespace: 'production', replicas: 3, readyReplicas: 2, reason: 'ReplicaFailure' },
]

export const getDemoDeployments = (): Deployment[] => [
  { name: 'web-frontend', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
  { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'deploying', replicas: 3, readyReplicas: 1, updatedReplicas: 2, availableReplicas: 1, progress: 33 },
  { name: 'worker-service', namespace: 'batch', cluster: 'gke-staging', status: 'deploying', replicas: 4, readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2, progress: 50 },
  { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-gpu-cluster', status: 'deploying', replicas: 2, readyReplicas: 0, updatedReplicas: 1, availableReplicas: 0, progress: 0 },
  { name: 'cache-redis', namespace: 'data', cluster: 'gke-staging', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
  { name: 'monitoring-stack', namespace: 'monitoring', cluster: 'aks-dev-westeu', status: 'running', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, progress: 100 },
]

export const getDemoServices = (): Service[] => [
  { name: 'web-service', namespace: 'production', type: 'LoadBalancer', clusterIP: '10.0.0.1', ports: ['80/TCP'] },
]

export const getDemoSecurityIssues = (): SecurityIssue[] => [
  { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' },
  { name: 'worker-deployment', namespace: 'batch', cluster: 'vllm-gpu-cluster', issue: 'Running as root', severity: 'high', details: 'Container running as root user' },
  { name: 'nginx-ingress', namespace: 'ingress', cluster: 'eks-prod-us-east-1', issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' },
  { name: 'monitoring-agent', namespace: 'monitoring', cluster: 'gke-staging', issue: 'Missing security context', severity: 'low', details: 'No security context defined' },
  { name: 'redis-cache', namespace: 'data', cluster: 'openshift-prod', issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' },
  { name: 'legacy-app', namespace: 'legacy', cluster: 'vllm-gpu-cluster', issue: 'Running as root', severity: 'high', details: 'Container running as root user' },
]

export const getDemoWorkloads = (): Workload[] => [
  { name: 'nginx-ingress', namespace: 'ingress-system', type: 'Deployment', status: 'Running', replicas: 3, readyReplicas: 3, image: 'nginx/nginx-ingress:3.4.0', labels: { app: 'nginx-ingress', tier: 'frontend' }, targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'], createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  { name: 'api-gateway', namespace: 'production', type: 'Deployment', status: 'Degraded', replicas: 5, readyReplicas: 3, image: 'company/api-gateway:v2.5.1', labels: { app: 'api-gateway', tier: 'api' }, targetClusters: ['us-east-1', 'us-west-2'], createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
  { name: 'postgres-primary', namespace: 'databases', type: 'StatefulSet', status: 'Running', replicas: 1, readyReplicas: 1, image: 'postgres:15.4', labels: { app: 'postgres', role: 'primary' }, targetClusters: ['us-east-1'], createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
  { name: 'fluentd', namespace: 'logging', type: 'DaemonSet', status: 'Running', replicas: 12, readyReplicas: 12, image: 'fluent/fluentd:v1.16', labels: { app: 'fluentd', tier: 'logging' }, targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'], createdAt: new Date(Date.now() - 45 * 86400000).toISOString() },
  { name: 'ml-training', namespace: 'ml-workloads', type: 'Deployment', status: 'Pending', replicas: 1, readyReplicas: 0, image: 'company/ml-trainer:latest', labels: { app: 'ml-training', team: 'data-science' }, targetClusters: ['gpu-cluster-1'], createdAt: new Date(Date.now() - 3600000).toISOString() },
  { name: 'payment-service', namespace: 'payments', type: 'Deployment', status: 'Failed', replicas: 2, readyReplicas: 0, image: 'company/payment-service:v1.8.0', labels: { app: 'payment-service', tier: 'backend' }, targetClusters: ['us-east-1'], createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
]

// ============================================================================
// Node demo data
// ============================================================================

export const getDemoCachedNodes = (): NodeInfo[] => [
  { name: 'node-1', cluster: 'prod-east', status: 'Ready', roles: ['control-plane', 'master'], kubeletVersion: 'v1.28.4', cpuCapacity: '8', memoryCapacity: '32Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'node-2', cluster: 'prod-east', status: 'Ready', roles: ['worker'], kubeletVersion: 'v1.28.4', cpuCapacity: '16', memoryCapacity: '64Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'gpu-node-1', cluster: 'vllm-d', status: 'Ready', roles: ['worker'], kubeletVersion: 'v1.28.4', cpuCapacity: '32', memoryCapacity: '128Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'kind-control-plane', cluster: 'kind-local', status: 'Ready', roles: ['control-plane'], kubeletVersion: 'v1.27.3', cpuCapacity: '4', memoryCapacity: '8Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
]

export const getDemoCoreDNSStatus = (): _CoreDNSClusterStatus[] => [
  {
    cluster: 'eks-prod-us-east-1',
    pods: [
      { name: 'coredns-7db6d8ff4d-xk2p8', status: 'Running', ready: '1/1', restarts: 0, version: '1.11.1' },
      { name: 'coredns-7db6d8ff4d-n9wq3', status: 'Running', ready: '1/1', restarts: 0, version: '1.11.1' },
    ],
    healthy: true,
    totalRestarts: 0
  },
  {
    cluster: 'gke-staging',
    pods: [
      { name: 'coredns-6d4b75cb6d-abcde', status: 'Running', ready: '1/1', restarts: 2, version: '1.10.1' },
      { name: 'coredns-6d4b75cb6d-fghij', status: 'Running', ready: '1/1', restarts: 0, version: '1.10.1' },
    ],
    healthy: true,
    totalRestarts: 2
  },
  {
    cluster: 'aks-dev-westeu',
    pods: [
      { name: 'coredns-abc123-xyz99', status: 'CrashLoopBackOff', ready: '0/1', restarts: 7, version: '1.9.3' },
    ],
    healthy: false,
    totalRestarts: 7
  },
]

// ============================================================================
// GPU demo data
// ============================================================================

export const getDemoGPUNodes = (): GPUNode[] => [
  { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'GPU', gpuMemoryMB: 81920, manufacturer: 'NVIDIA' },
  { name: 'gpu-node-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU', gpuMemoryMB: 16384, manufacturer: 'NVIDIA' },
  { name: 'gpu-node-3', cluster: 'gke-staging', gpuType: 'NVIDIA L4', gpuCount: 2, gpuAllocated: 0, acceleratorType: 'GPU', gpuMemoryMB: 24576, manufacturer: 'NVIDIA' },
]

export const getDemoCachedGPUNodeHealth = (): GPUNodeHealthStatus[] => [
  {
    nodeName: 'gpu-node-1', cluster: 'vllm-gpu-cluster', status: 'healthy',
    gpuCount: 8, gpuType: 'NVIDIA A100-SXM4-80GB',
    checks: [
      { name: 'node_ready', passed: true },
      { name: 'scheduling', passed: true },
      { name: 'gpu-feature-discovery', passed: true },
      { name: 'nvidia-device-plugin', passed: true },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: true },
      { name: 'gpu_events', passed: true },
    ],
    issues: [], stuckPods: 0, checkedAt: new Date().toISOString()
  },
  {
    nodeName: 'gpu-node-2', cluster: 'vllm-gpu-cluster', status: 'degraded',
    gpuCount: 8, gpuType: 'NVIDIA A100-SXM4-80GB',
    checks: [
      { name: 'node_ready', passed: true },
      { name: 'scheduling', passed: true },
      { name: 'gpu-feature-discovery', passed: false, message: 'CrashLoopBackOff (12 restarts)' },
      { name: 'nvidia-device-plugin', passed: true },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: true },
      { name: 'gpu_events', passed: true },
    ],
    issues: ['gpu-feature-discovery: CrashLoopBackOff (12 restarts)'], stuckPods: 0, checkedAt: new Date().toISOString()
  },
  {
    nodeName: 'gpu-node-3', cluster: 'eks-prod-us-east-1', status: 'unhealthy',
    gpuCount: 4, gpuType: 'NVIDIA V100',
    checks: [
      { name: 'node_ready', passed: false, message: 'Node is NotReady' },
      { name: 'scheduling', passed: false, message: 'Node is cordoned (SchedulingDisabled)' },
      { name: 'gpu-feature-discovery', passed: false, message: 'CrashLoopBackOff (128 restarts)' },
      { name: 'nvidia-device-plugin', passed: false, message: 'CrashLoopBackOff (64 restarts)' },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: false, message: '54 pods stuck (ContainerStatusUnknown/Terminating)' },
      { name: 'gpu_events', passed: false, message: '3 GPU warning events in last hour' },
    ],
    issues: ['Node is NotReady', 'Node is cordoned', 'gpu-feature-discovery: CrashLoopBackOff (128 restarts)', '54 pods stuck'],
    stuckPods: 54, checkedAt: new Date().toISOString()
  },
]

export const getDemoCachedWarningEvents = (): ClusterEvent[] => [
  { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient cpu', namespace: 'production', object: 'Pod/api-gateway-7d9c8b7f5-abcde', count: 3, firstSeen: new Date(Date.now() - 300000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'prod-east' },
  { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', namespace: 'monitoring', object: 'Pod/prometheus-agent-0', count: 5, firstSeen: new Date(Date.now() - 600000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'prod-east' },
  { type: 'Warning', reason: 'FailedCreate', message: 'Error creating: pods "worker-xyz" is forbidden', namespace: 'ml-workloads', object: 'Job/training-job-123', count: 1, firstSeen: new Date(Date.now() - 120000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'vllm-d' },
]

// ============================================================================
// Hardware health demo data
// ============================================================================

const DEMO_HW_ALERTS: _DeviceAlert[] = [
  {
    id: 'demo-1',
    nodeName: 'gpu-node-1',
    cluster: 'production',
    deviceType: 'gpu',
    previousCount: 8,
    currentCount: 6,
    droppedCount: 2,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'critical'
  },
  {
    id: 'demo-2',
    nodeName: 'gpu-node-2',
    cluster: 'production',
    deviceType: 'infiniband',
    previousCount: 2,
    currentCount: 1,
    droppedCount: 1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'warning'
  },
]

const DEMO_HW_INVENTORY: _NodeDeviceInventory[] = [
  {
    nodeName: 'gpu-node-1',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString()
  },
  {
    nodeName: 'gpu-node-2',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString()
  },
  {
    nodeName: 'compute-node-1',
    cluster: 'staging',
    devices: { gpuCount: 0, nicCount: 1, nvmeCount: 2, infinibandCount: 0, sriovCapable: false, rdmaAvailable: false, mellanoxPresent: false, nvidiaNicPresent: false, spectrumScale: false, mofedReady: false, gpuDriverReady: false },
    lastSeen: new Date().toISOString()
  },
]

export const HW_INITIAL_DATA: _HardwareHealthData = {
  alerts: [],
  inventory: [],
  nodeCount: 0,
  lastUpdate: null
}

export const HW_DEMO_DATA: _HardwareHealthData = {
  alerts: DEMO_HW_ALERTS,
  inventory: DEMO_HW_INVENTORY,
  nodeCount: DEMO_HW_INVENTORY.length,
  lastUpdate: new Date().toISOString()
}

// ============================================================================
// K8s resources demo data
// ============================================================================

export const getDemoPVCs = (): PVC[] => [
  { name: 'data-postgres-0', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], age: '30d' },
  { name: 'redis-data-0', namespace: 'data', cluster: 'gke-staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], age: '14d' },
  { name: 'ml-scratch', namespace: 'ml-workloads', cluster: 'vllm-gpu-cluster', status: 'Pending', storageClass: 'fast-nvme', capacity: '500Gi', accessModes: ['ReadWriteMany'], age: '1h' },
]

export const getDemoNamespaces = (): string[] =>
  ['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'ingress', 'security']

export const getDemoJobs = (): Job[] => [
  { name: 'data-migration-v2', namespace: 'batch', cluster: 'eks-prod-us-east-1', status: 'Complete', completions: '1/1', duration: '5m', age: '2h' },
  { name: 'model-training-run-42', namespace: 'ml-workloads', cluster: 'vllm-gpu-cluster', status: 'Running', completions: '0/1', age: '30m' },
  { name: 'backup-db-daily', namespace: 'production', cluster: 'gke-staging', status: 'Failed', completions: '0/1', duration: '10m', age: '6h' },
]

export const getDemoHPAs = (): HPA[] => [
  { name: 'web-frontend', namespace: 'production', cluster: 'eks-prod-us-east-1', reference: 'Deployment/web-frontend', minReplicas: 2, maxReplicas: 10, currentReplicas: 4, targetCPU: '70%', currentCPU: '55%', age: '30d' },
  { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', reference: 'Deployment/api-gateway', minReplicas: 3, maxReplicas: 20, currentReplicas: 8, targetCPU: '60%', currentCPU: '78%', age: '14d' },
]

export const getDemoConfigMaps = (): ConfigMap[] => [
  { name: 'app-config', namespace: 'production', cluster: 'eks-prod-us-east-1', dataCount: 5, age: '7d' },
  { name: 'nginx-config', namespace: 'ingress', cluster: 'gke-staging', dataCount: 3, age: '14d' },
]

export const getDemoSecrets = (): Secret[] => [
  { name: 'db-credentials', namespace: 'production', cluster: 'eks-prod-us-east-1', type: 'Opaque', dataCount: 3, age: '30d' },
  { name: 'tls-cert', namespace: 'ingress', cluster: 'eks-prod-us-east-1', type: 'kubernetes.io/tls', dataCount: 2, age: '90d' },
]

export const getDemoServiceAccounts = (): ServiceAccount[] => [
  { name: 'default', namespace: 'production', cluster: 'eks-prod-us-east-1', age: '90d' },
  { name: 'prometheus', namespace: 'monitoring', cluster: 'gke-staging', age: '30d' },
]

export const getDemoReplicaSets = (): ReplicaSet[] => [
  { name: 'web-frontend-7d8f9c4b5', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, ownerName: 'web-frontend', ownerKind: 'Deployment', age: '2d' },
  { name: 'api-gateway-6c8d7f5e4', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 1, ownerName: 'api-gateway', ownerKind: 'Deployment', age: '1d' },
]

export const getDemoStatefulSets = (): StatefulSet[] => [
  { name: 'postgres', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, status: 'running', image: 'postgres:15', age: '30d' },
  { name: 'redis', namespace: 'data', cluster: 'gke-staging', replicas: 3, readyReplicas: 3, status: 'running', image: 'redis:7', age: '14d' },
]

export const getDemoDaemonSets = (): DaemonSet[] => [
  { name: 'node-exporter', namespace: 'monitoring', cluster: 'eks-prod-us-east-1', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'running', age: '60d' },
  { name: 'fluentd', namespace: 'logging', cluster: 'gke-staging', desiredScheduled: 3, currentScheduled: 3, ready: 3, status: 'running', age: '30d' },
]

export const getDemoCronJobs = (): CronJob[] => [
  { name: 'db-backup', namespace: 'production', cluster: 'eks-prod-us-east-1', schedule: '0 2 * * *', suspend: false, active: 0, lastSchedule: new Date(Date.now() - 8 * 3600000).toISOString(), age: '60d' },
  { name: 'log-cleanup', namespace: 'monitoring', cluster: 'gke-staging', schedule: '0 0 * * 0', suspend: false, active: 0, lastSchedule: new Date(Date.now() - 48 * 3600000).toISOString(), age: '30d' },
]

export const getDemoIngresses = (): Ingress[] => [
  { name: 'main-ingress', namespace: 'production', cluster: 'eks-prod-us-east-1', class: 'nginx', hosts: ['app.example.com', 'api.example.com'], address: '10.0.0.100', age: '30d' },
  { name: 'staging-ingress', namespace: 'staging', cluster: 'gke-staging', class: 'nginx', hosts: ['staging.example.com'], address: '10.0.1.50', age: '14d' },
]

export const getDemoNetworkPolicies = (): NetworkPolicy[] => [
  { name: 'deny-all', namespace: 'production', cluster: 'eks-prod-us-east-1', policyTypes: ['Ingress', 'Egress'], podSelector: '{}', age: '60d' },
  { name: 'allow-web', namespace: 'production', cluster: 'eks-prod-us-east-1', policyTypes: ['Ingress'], podSelector: 'app=web', age: '30d' },
]

// ============================================================================
// GitOps & Helm demo data
// ============================================================================

export const getDemoHelmReleases = (): HelmRelease[] => [
  { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'eks-prod-us-east-1' },
  { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3', cluster: 'eks-prod-us-east-1' },
  { name: 'nginx-ingress', namespace: 'ingress', revision: '8', updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'deployed', chart: 'ingress-nginx-4.8.3', app_version: '1.9.4', cluster: 'gke-staging' },
  { name: 'api-gateway', namespace: 'production', revision: '6', updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', cluster: 'eks-prod-us-east-1' },
]

export const getDemoHelmHistory = (): HelmHistoryEntry[] => [
  { revision: 6, updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', description: 'Upgrade failed: container crashed' },
  { revision: 5, updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
  { revision: 4, updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.7.0', app_version: '2.48.0', description: 'Upgrade complete' },
]

export const getDemoHelmValues = (): Record<string, unknown> => ({
  replicaCount: 2,
  image: { repository: 'prom/prometheus', tag: 'v2.48.1', pullPolicy: 'IfNotPresent' },
  service: { type: 'ClusterIP', port: 9090 },
  resources: { limits: { cpu: '500m', memory: '512Mi' }, requests: { cpu: '200m', memory: '256Mi' } }
})

export const getDemoOperators = (): Operator[] => [
  { name: 'prometheus-operator', namespace: 'monitoring', version: '0.72.0', status: 'Succeeded', cluster: 'eks-prod-us-east-1' },
  { name: 'cert-manager', namespace: 'cert-manager', version: '1.14.0', status: 'Succeeded', upgradeAvailable: '1.15.0', cluster: 'eks-prod-us-east-1' },
  { name: 'gpu-operator', namespace: 'nvidia-gpu-operator', version: '23.9.1', status: 'Succeeded', cluster: 'vllm-gpu-cluster' },
]

export const getDemoOperatorSubscriptions = (): OperatorSubscription[] => [
  { name: 'prometheus-sub', namespace: 'monitoring', channel: 'stable', source: 'community-operators', installPlanApproval: 'Automatic', currentCSV: 'prometheusoperator.0.72.0', cluster: 'eks-prod-us-east-1' },
  { name: 'cert-manager-sub', namespace: 'cert-manager', channel: 'stable', source: 'community-operators', installPlanApproval: 'Manual', currentCSV: 'cert-manager.v1.14.0', pendingUpgrade: 'cert-manager.v1.15.0', cluster: 'eks-prod-us-east-1' },
]

export const getDemoGitOpsDrifts = (): GitOpsDrift[] => [
  { resource: 'nginx-deployment', namespace: 'production', cluster: 'eks-prod-us-east-1', kind: 'Deployment', driftType: 'modified', gitVersion: 'abc1234', details: 'replicas changed from 3 to 5', severity: 'medium' },
  { resource: 'redis-config', namespace: 'data', cluster: 'gke-staging', kind: 'ConfigMap', driftType: 'modified', gitVersion: 'def5678', details: 'maxmemory-policy changed', severity: 'low' },
]

export const getDemoBuildpackImages = (): BuildpackImage[] => [
  { name: 'api-service', namespace: 'production', builder: 'paketo-buildpacks/builder-jammy-base', image: 'registry.example.com/api-service:latest', status: 'succeeded', updated: new Date(Date.now() - 2 * 3600000).toISOString(), cluster: 'eks-prod-us-east-1' },
  { name: 'web-app', namespace: 'staging', builder: 'paketo-buildpacks/builder-jammy-full', image: 'registry.example.com/web-app:v2.1', status: 'building', updated: new Date(Date.now() - 300000).toISOString(), cluster: 'gke-staging' },
]

// ============================================================================
// RBAC demo data
// ============================================================================

export const getDemoK8sRoles = (): K8sRole[] => [
  { name: 'pod-reader', namespace: 'production', cluster: 'eks-prod-us-east-1', isCluster: false, ruleCount: 3 },
  { name: 'admin', cluster: 'eks-prod-us-east-1', isCluster: true, ruleCount: 15 },
]

export const getDemoK8sRoleBindings = (): K8sRoleBinding[] => [
  { name: 'pod-reader-binding', namespace: 'production', cluster: 'eks-prod-us-east-1', isCluster: false, roleName: 'pod-reader', roleKind: 'Role', subjects: [{ kind: 'User', name: 'jane' }] },
  { name: 'admin-binding', cluster: 'eks-prod-us-east-1', isCluster: true, roleName: 'admin', roleKind: 'ClusterRole', subjects: [{ kind: 'Group', name: 'admins' }] },
]

export const getDemoK8sServiceAccountsRbac = (): K8sServiceAccountInfo[] => [
  { name: 'default', namespace: 'production', cluster: 'eks-prod-us-east-1', createdAt: new Date(Date.now() - 90 * 86400000).toISOString() },
  { name: 'prometheus', namespace: 'monitoring', cluster: 'eks-prod-us-east-1', roles: ['prometheus-reader'], createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
]

// ============================================================================
// Cilium demo data
// ============================================================================

export const getDemoCiliumStatus = (): CiliumStatus => ({
  status: 'Healthy',
  nodes: [
    { name: 'node-1', status: 'Healthy', version: '1.14.4' },
    { name: 'node-2', status: 'Healthy', version: '1.14.4' },
    { name: 'node-3', status: 'Healthy', version: '1.14.4' },
  ],
  networkPolicies: 42,
  endpoints: 156,
  hubble: {
    enabled: true,
    flowsPerSecond: 1250,
    metrics: {
      forwarded: 1245000,
      dropped: 1500,
    },
  },
})
// ============================================================================
// Jaeger demo data
// ============================================================================

export const getDemoJaegerStatus = (): JaegerStatus => ({
  status: 'Healthy',
  version: '1.57.0',
  collectors: {
    count: 4,
    status: 'Healthy',
    items: [
      { name: 'jaeger-collector-1', status: 'Healthy', version: '1.57.0', cluster: 'cluster-1' },
      { name: 'jaeger-collector-2', status: 'Healthy', version: '1.57.0', cluster: 'cluster-2' },
      { name: 'jaeger-collector-3', status: 'Healthy', version: '1.57.0', cluster: 'cluster-3' },
      { name: 'jaeger-collector-4', status: 'Healthy', version: '1.57.0', cluster: 'cluster-4' },
    ],
  },
  query: {
    status: 'Healthy',
  },
  metrics: {
    servicesCount: 32,
    tracesLastHour: 2450,
    dependenciesCount: 128,
    avgLatencyMs: 38,
    p95LatencyMs: 142,
    p99LatencyMs: 385,
    spansDroppedLastHour: 15, // Realistic small number of dropped spans
    avgQueueLength: 42,
  },
})
