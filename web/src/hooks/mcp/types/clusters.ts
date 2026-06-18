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

export interface NamespaceStats {
  name: string
  podCount: number
  runningPods: number
  pendingPods: number
  failedPods: number
}
