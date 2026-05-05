import { MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants/network'
import type { ClusterErrorType } from '../../../lib/errorClassifier'
import type {
  CronJob,
  DaemonSet,
  Deployment,
  DeploymentIssue,
  HPA,
  Job,
  PodInfo,
  PodIssue,
  ReplicaSet,
  StatefulSet,
} from '../types'

/**
 * Per-cluster error surfaced by `useAllPods` when the backend emits a
 * `cluster_error` SSE event for a particular cluster (Issue 9353). Lets the
 * drill-down distinguish an RBAC denial ({@link ClusterErrorType} === 'auth')
 * from a transient 5xx/timeout failure so the UI can render a specific
 * explanation instead of a generic "detailed list is empty" warning.
 */
export interface PodClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

// ---------------------------------------------------------------------------
// Return types for exported hooks
// ---------------------------------------------------------------------------

export interface UsePodsResult {
  pods: PodInfo[]
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

export interface UseAllPodsResult {
  pods: PodInfo[]
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  error: string | null
  clusterErrors: PodClusterError[]
  refetch: () => Promise<void>
}

export interface UsePodIssuesResult {
  issues: PodIssue[]
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

export interface UseDeploymentIssuesResult {
  issues: DeploymentIssue[]
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

export interface UseDeploymentsResult {
  deployments: Deployment[]
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

export interface UseJobsResult {
  jobs: Job[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UseHPAsResult {
  hpas: HPA[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UseReplicaSetsResult {
  replicaSets: ReplicaSet[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UseStatefulSetsResult {
  statefulSets: StatefulSet[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UseDaemonSetsResult {
  daemonSets: DaemonSet[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UseCronJobsResult {
  cronJobs: CronJob[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  consecutiveFailures: number
  isFailed: boolean
}

export interface UsePodLogsResult {
  logs: string
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export async function fetchInClusterCollection<T>(
  resource: string,
  params: URLSearchParams,
  collectionKey: string,
): Promise<T[] | null> {
  try {
    const response = await fetch(`/api/mcp/${resource}?${params.toString()}`, {
      signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
    })
    if (!response.ok) {
      return null
    }
    const data = await response.json() as Record<string, unknown> | T[]
    if (Array.isArray(data)) {
      return data
    }
    const collection = data[collectionKey]
    return Array.isArray(collection) ? collection as T[] : []
  } catch (err: unknown) {
    console.warn(`[${resource}] Backend fetch failed:`, err)
    return null
  }
}
