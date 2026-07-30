// MCP hook types — cluster, node, service, namespace, operator, helm, security, and metric types.
//
// Domain-specific groups are split into sibling files (re-exported below) to keep each under the
// max-lines limit:
//   - types.workloads.ts  (Pod/Container/Deployment/Job/HPA/ReplicaSet/StatefulSet/DaemonSet/CronJob)
//   - types.gpu.ts        (AcceleratorType/GPUNode/GPUOperator/etc.)
//   - types.resources.ts  (ConfigMap/Secret/ServiceAccount/PVC/PV/ResourceQuota/LimitRange/RBAC)
// Public exports are preserved — external callers keep importing from './types'.

export interface ClusterInfo {
  name: string
  context: string
  server?: string
  user?: string
  healthy?: boolean
  /** True when no health probe has returned yet (initial state). #5921/#5924 */
  healthUnknown?: boolean
  /** True when every health probe since startup has failed — used to drive
   *  the stale-kubeconfig warning banner (#5921). */
  neverConnected?: boolean
  source?: string
  nodeCount?: number
  readyNodes?: number
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
  // Auth method detected from kubeconfig (exec = IAM/cloud CLI, token, certificate, auth-provider)
  authMethod?: 'exec' | 'token' | 'certificate' | 'auth-provider' | 'unknown'
  // Reachability fields (from health check)
  reachable?: boolean
  /** External TCP probe result — false when the API server is internally reachable
   *  but not reachable from outside (e.g. external network outage) (#4202). */
  externallyReachable?: boolean
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
  // Synthetic demo cluster marker - used to prevent demo data leaking into live mode
  isDemo?: boolean
  // Node condition issues (DiskPressure, MemoryPressure, PIDPressure, etc.)
  issues?: string[]
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
  /** External TCP probe result — false when the API server is internally reachable
   *  but not reachable from outside (e.g. external network outage) (#4202). */
  externallyReachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
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

/**
 * Tri-state metric value (issue #6113).
 *
 * Frontend code has historically conflated three very different situations into
 * a single numeric 0: (a) the upstream returned "zero", (b) the upstream hasn't
 * returned yet, and (c) the upstream doesn't know / isn't exposing this metric.
 * This enum lets callers disambiguate explicitly.
 *
 * v1 use-site: see `AggregatedMetricCompleteness` below and
 * `useClusters().metricsCompleteness`. A fuller migration of every card to
 * tri-state values is tracked as follow-up work.
 */
export type MetricState = 'loading' | 'unknown' | 'value'

export interface TriStateMetric<T = number> {
  state: MetricState
  value?: T
}

/**
 * Metadata describing the completeness of an aggregated metric computed across
 * multiple clusters (issue #6114). `contributingClusters` is the list of
 * cluster names whose data was included in the aggregate, and `missingClusters`
 * lists cluster names that should have contributed but didn't (unreachable,
 * metrics-server unavailable, fetch error, etc.). `isComplete` is true only
 * when `missingClusters` is empty.
 */
export interface AggregatedMetricCompleteness {
  contributingClusters: string[]
  missingClusters: string[]
  isComplete: boolean
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

/** Structured view of a ServicePort that preserves the port name
 * (issue #6163). Matches pkg/k8s.ServicePortDetail. */
export interface ServicePortDetail {
  /** Optional name from the k8s ServicePort (e.g. "http", "metrics"). */
  name?: string
  /** Service-level port number. */
  port: number
  /** TCP / UDP / SCTP. */
  protocol?: string
  /** Externally exposed port for NodePort / LoadBalancer services. */
  nodePort?: number
}

export interface Service {
  name: string
  namespace: string
  cluster?: string
  type: string // ClusterIP, NodePort, LoadBalancer, ExternalName
  clusterIP?: string
  externalIP?: string
  /** Legacy flat representation ("80/TCP" or "80:30080/TCP"). */
  ports?: string[]
  /** Structured ports with optional names (issue #6163). Same order as `ports`. */
  portDetails?: ServicePortDetail[]
  // Number of ready backend addresses (pods) currently associated with this
  // service via its core/v1 Endpoints object. Issue #6150: the Endpoints
  // dashboard stat sums this across services rather than counting services.
  endpoints?: number
  // LoadBalancer provisioning state. Empty string for non-LoadBalancer
  // services. 'Provisioning' when a LoadBalancer service has no ingress
  // IP/hostname yet, 'Ready' when it does. Issue #6153.
  lbStatus?: string
  /** Label selector for backing pods. Used to detect orphaned services
   * (issue #6164) and invalid empty selectors on non-ExternalName services
   * (issue #6166). */
  selector?: Record<string, string>
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
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

// -- Re-exports from split sibling files --

export type {
  ContainerInfo,
  PodInfo,
  PodIssue,
  DeploymentIssue,
  Deployment,
  Job,
  HPA,
  ReplicaSet,
  StatefulSet,
  DaemonSet,
  CronJob,
} from './types.workloads'

export type {
  AcceleratorType,
  GPUTaint,
  GPUNode,
  GPUNodeHealthCheck,
  GPUNodeHealthStatus,
  GPUHealthCheckResult,
  GPUHealthCronJobStatus,
  OperatorComponent,
  GPUOperatorInfo,
  NetworkOperatorInfo,
  NVIDIAOperatorStatus,
} from './types.gpu'

export type {
  ConfigMap,
  Secret,
  ServiceAccount,
  PVC,
  PV,
  ResourceQuota,
  LimitRangeItem,
  LimitRange,
  ResourceQuotaSpec,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccountInfo,
} from './types.resources'
