/**
 * Multi-Cluster Service (MCS) API types.
 *
 * MCS enables cross-cluster service discovery using KEP-1645.
 * ServiceExport resources expose services to other clusters.
 * ServiceImport resources consume services from other clusters.
 */

/**
 * ServiceExport status values.
 */
export type ServiceExportStatus = 'Ready' | 'Pending' | 'Failed' | 'Unknown'

/**
 * ServiceImport type values.
 */
export type ServiceImportType = 'ClusterSetIP' | 'Headless'

/**
 * Condition represents a status condition on MCS resources.
 */
export interface Condition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

/**
 * ServicePort represents a port exposed by a service.
 */
export interface ServicePort {
  name?: string
  protocol: string
  port: number
  appProtocol?: string
}

/**
 * ServiceExport represents a service exported for multi-cluster discovery.
 */
export interface ServiceExport {
  name: string
  namespace: string
  cluster: string
  serviceName?: string
  status: ServiceExportStatus
  message?: string
  targetClusters?: string[]
  createdAt: string
  conditions?: Condition[]
}

/**
 * ServiceImport represents an imported service from another cluster.
 */
export interface ServiceImport {
  name: string
  namespace: string
  cluster: string
  sourceCluster?: string
  type: ServiceImportType
  dnsName?: string
  clusterSetIPs?: string[]
  ports?: ServicePort[]
  endpoints: number
  createdAt: string
  conditions?: Condition[]
}

/**
 * MCSClusterError reports an error from a specific cluster during MCS queries.
 */
export interface MCSClusterError {
  cluster: string
  errorType?: string
  message: string
}

/**
 * ServiceExportList is a paginated list of ServiceExports.
 */
export interface ServiceExportList {
  items: ServiceExport[]
  totalCount: number
  clusterErrors?: MCSClusterError[]
  /** Present only on single-cluster queries (?cluster=X). */
  cluster?: string
}

/**
 * ServiceImportList is a paginated list of ServiceImports.
 */
export interface ServiceImportList {
  items: ServiceImport[]
  totalCount: number
  clusterErrors?: MCSClusterError[]
  /** Present only on single-cluster queries (?cluster=X). */
  cluster?: string
}

/**
 * ClusterMCSStatus indicates MCS availability per cluster.
 */
export interface ClusterMCSStatus {
  cluster: string
  mcsAvailable: boolean
}

/**
 * MCSStatusResponse is the response from GET /api/mcs/status.
 */
export interface MCSStatusResponse {
  clusters: ClusterMCSStatus[]
}
