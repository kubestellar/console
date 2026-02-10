export interface ClusterInfo {
  name: string
  context: string
  server?: string
  user?: string
  healthy?: boolean
  source?: string
  nodeCount?: number
  podCount?: number
  // Total allocatable resources (capacity)
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  // Resource requests (allocated)
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  // Actual resource usage (from metrics-server)
  cpuUsageMillicores?: number
  cpuUsageCores?: number
  memoryUsageBytes?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
  // PVC metrics
  pvcCount?: number
  pvcBoundCount?: number
  isCurrent?: boolean
  // Reachability fields (from health check)
  reachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
  // Refresh state - true when a refresh is in progress for this cluster
  refreshing?: boolean
  // Detected cluster distribution (openshift, eks, gke, etc.)
  distribution?: string
  // Namespaces in the cluster (for cloud provider detection)
  namespaces?: string[]
  // Aliases - other context names pointing to the same server (populated by deduplication)
  aliases?: string[]
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  apiServer?: string
  nodeCount: number
  readyNodes: number
  podCount?: number
  // Total allocatable resources (capacity)
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  // Resource requests (allocated)
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  // Actual resource usage (from metrics-server)
  cpuUsageMillicores?: number
  cpuUsageCores?: number
  memoryUsageBytes?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
  // PVC metrics
  pvcCount?: number
  pvcBoundCount?: number
  issues?: string[]
  // Fields for reachability
  reachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
}

export interface ContainerInfo {
  name: string
  image: string
  ready: boolean
  state: 'running' | 'waiting' | 'terminated'
  reason?: string
  message?: string
  gpuRequested?: number  // Number of GPUs requested by this container
}

export interface PodInfo {
  name: string
  namespace: string
  cluster?: string
  status: string
  ready: string
  restarts: number
  age: string
  node?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  containers?: ContainerInfo[]
  // Resource requests (sum of all containers)
  cpuRequestMillis?: number    // CPU request in millicores
  cpuLimitMillis?: number      // CPU limit in millicores
  memoryRequestBytes?: number  // Memory request in bytes
  memoryLimitBytes?: number    // Memory limit in bytes
  gpuRequest?: number          // Total GPU request
  // Actual resource usage (from metrics API, if available)
  cpuUsageMillis?: number      // Actual CPU usage in millicores
  memoryUsageBytes?: number    // Actual memory usage in bytes
  metricsAvailable?: boolean   // Whether metrics API data is available
}

export interface PodIssue {
  name: string
  namespace: string
  cluster?: string
  status: string
  reason?: string
  issues: string[]
  restarts: number
}

export interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster?: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export interface DeploymentIssue {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  reason?: string
  message?: string
}

export interface Deployment {
  name: string
  namespace: string
  cluster?: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progress: number
  image?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

// AcceleratorType represents the category of accelerator
export type AcceleratorType = 'GPU' | 'TPU' | 'AIU' | 'XPU'

export interface GPUNode {
  name: string
  cluster: string
  gpuType: string           // Display name of accelerator (e.g., "NVIDIA A100", "Intel Gaudi2", "IBM AIU")
  gpuCount: number          // Number of accelerators
  gpuAllocated: number      // Number of allocated accelerators
  acceleratorType?: AcceleratorType  // GPU, TPU, AIU, or XPU
  // Enhanced GPU info from NVIDIA GPU Feature Discovery
  gpuMemoryMB?: number
  gpuFamily?: string
  cudaDriverVersion?: string
  cudaRuntimeVersion?: string
  migCapable?: boolean
  migStrategy?: string
  manufacturer?: string     // Manufacturer (NVIDIA, AMD, Intel, Google, IBM)
}

// NVIDIA Operator Status types
export interface OperatorComponent {
  name: string
  status: string
  reason?: string
}

export interface GPUOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  driverVersion?: string
  cudaVersion?: string
  namespace?: string
}

export interface NetworkOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  namespace?: string
}

export interface NVIDIAOperatorStatus {
  cluster: string
  gpuOperator?: GPUOperatorInfo
  networkOperator?: NetworkOperatorInfo
}

export interface NodeCondition {
  type: string
  status: string
  reason?: string
  message?: string
}

export interface NodeInfo {
  name: string
  cluster?: string
  status: string // Ready, NotReady, Unknown
  roles: string[]
  internalIP?: string
  externalIP?: string
  kubeletVersion: string
  containerRuntime?: string
  os?: string
  architecture?: string
  cpuCapacity: string
  memoryCapacity: string
  storageCapacity?: string
  podCapacity: string
  conditions: NodeCondition[]
  labels?: Record<string, string>
  taints?: string[]
  age?: string
  unschedulable: boolean
}

export interface Service {
  name: string
  namespace: string
  cluster?: string
  type: string // ClusterIP, NodePort, LoadBalancer, ExternalName
  clusterIP?: string
  externalIP?: string
  ports?: string[]
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Job {
  name: string
  namespace: string
  cluster?: string
  status: string // Running, Complete, Failed
  completions: string
  duration?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface HPA {
  name: string
  namespace: string
  cluster?: string
  reference: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  targetCPU?: string
  currentCPU?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ConfigMap {
  name: string
  namespace: string
  cluster?: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Secret {
  name: string
  namespace: string
  cluster?: string
  type: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ServiceAccount {
  name: string
  namespace: string
  cluster?: string
  secrets?: string[]
  imagePullSecrets?: string[]
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PVC {
  name: string
  namespace: string
  cluster?: string
  status: string
  storageClass?: string
  capacity?: string
  accessModes?: string[]
  volumeName?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PV {
  name: string
  cluster?: string
  status: string
  capacity?: string
  storageClass?: string
  reclaimPolicy?: string
  accessModes?: string[]
  claimRef?: string
  volumeMode?: string
  age?: string
  labels?: Record<string, string>
}

export interface ResourceQuota {
  name: string
  namespace: string
  cluster?: string
  hard: Record<string, string>  // Resource limits
  used: Record<string, string>  // Current usage
  age?: string
  labels?: Record<string, string>
}

export interface ReplicaSet {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  ownerName?: string
  ownerKind?: string
  age?: string
  labels?: Record<string, string>
}

export interface StatefulSet {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  status: string
  image?: string
  age?: string
  labels?: Record<string, string>
}

export interface DaemonSet {
  name: string
  namespace: string
  cluster?: string
  desiredScheduled: number
  currentScheduled: number
  ready: number
  status: string
  age?: string
  labels?: Record<string, string>
}

export interface CronJob {
  name: string
  namespace: string
  cluster?: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule?: string
  age?: string
  labels?: Record<string, string>
}

export interface Ingress {
  name: string
  namespace: string
  cluster?: string
  class?: string
  hosts: string[]
  address?: string
  age?: string
  labels?: Record<string, string>
}

export interface NetworkPolicy {
  name: string
  namespace: string
  cluster?: string
  policyTypes: string[]
  podSelector: string
  age?: string
  labels?: Record<string, string>
}

export interface LimitRangeItem {
  type: string  // Pod, Container, PersistentVolumeClaim
  default?: Record<string, string>
  defaultRequest?: Record<string, string>
  max?: Record<string, string>
  min?: Record<string, string>
}

export interface LimitRange {
  name: string
  namespace: string
  cluster?: string
  limits: LimitRangeItem[]
  age?: string
  labels?: Record<string, string>
}

export interface MCPStatus {
  opsClient: {
    available: boolean
    toolCount: number
  }
  deployClient: {
    available: boolean
    toolCount: number
  }
}

export interface ResourceQuotaSpec {
  cluster: string
  name: string
  namespace: string
  hard: Record<string, string>
  labels?: Record<string, string>
}

export interface SecurityIssue {
  name: string
  namespace: string
  cluster?: string
  issue: string
  severity: 'high' | 'medium' | 'low'
  details?: string
}

export interface GitOpsDrift {
  resource: string
  namespace: string
  cluster: string
  kind: string
  driftType: 'modified' | 'deleted' | 'added'
  gitVersion: string
  details?: string
  severity: 'high' | 'medium' | 'low'
}

export interface NamespaceStats {
  name: string
  podCount: number
  runningPods: number
  pendingPods: number
  failedPods: number
}

export interface Operator {
  name: string
  namespace: string
  version: string
  status: 'Succeeded' | 'Failed' | 'Installing' | 'Upgrading'
  upgradeAvailable?: string
  cluster?: string
}

export interface OperatorSubscription {
  name: string
  namespace: string
  channel: string
  source: string
  installPlanApproval: 'Automatic' | 'Manual'
  currentCSV: string
  pendingUpgrade?: string
  cluster?: string
}

export interface K8sRole {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  ruleCount: number
}

// K8s role binding type
export interface K8sRoleBinding {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  roleName: string
  roleKind: string
  subjects: Array<{
    kind: 'User' | 'Group' | 'ServiceAccount'
    name: string
    namespace?: string
  }>
}

// K8s service account type (for RBAC)
export interface K8sServiceAccountInfo {
  name: string
  namespace: string
  cluster: string
  secrets?: string[]
  roles?: string[]
  createdAt?: string
}

export interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
  cluster?: string
}

export interface HelmHistoryEntry {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}
