export interface ClusterInfo {
  name: string
  context: string
  server?: string
  user?: string
  healthy?: boolean
  healthUnknown?: boolean
  neverConnected?: boolean
  source?: string
  nodeCount?: number
  podCount?: number
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  cpuUsageMillicores?: number
  cpuUsageCores?: number
  memoryUsageBytes?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
  pvcCount?: number
  pvcBoundCount?: number
  isCurrent?: boolean
  authMethod?: 'exec' | 'token' | 'certificate' | 'auth-provider' | 'unknown'
  reachable?: boolean
  externallyReachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
  refreshing?: boolean
  distribution?: string
  namespaces?: string[]
  aliases?: string[]
  isDemo?: boolean
  issues?: string[]
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  apiServer?: string
  nodeCount: number
  readyNodes: number
  podCount?: number
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  cpuUsageMillicores?: number
  cpuUsageCores?: number
  memoryUsageBytes?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
  pvcCount?: number
  pvcBoundCount?: number
  issues?: string[]
  reachable?: boolean
  externallyReachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
}

export type MetricState = 'loading' | 'unknown' | 'value'

export interface TriStateMetric<T = number> { state: MetricState; value?: T }

export interface AggregatedMetricCompleteness {
  contributingClusters: string[]
  missingClusters: string[]
  isComplete: boolean
}

export interface MCPStatus {
  opsClient: { available: boolean; toolCount: number }
  deployClient: { available: boolean; toolCount: number }
}

export interface NamespaceStats {
  name: string
  podCount: number
  runningPods: number
  pendingPods: number
  failedPods: number
}
