import { Box, CheckCircle2, AlertTriangle, Clock, XCircle, Gauge, Database, Layers, Server } from 'lucide-react'
import { MS_PER_DAY, MS_PER_HOUR } from '../../lib/constants/time'
import type { Workload as ApiWorkload } from '../../hooks/useWorkloads'
import { isAgentUnavailable } from '../../hooks/useLocalAgent'
import { LOCAL_AGENT_HTTP_URL, MCP_HOOK_TIMEOUT_MS } from '../../lib/constants'
import { clusterCacheRef, agentFetch } from '../../hooks/mcp/shared'

export type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob'
export type WorkloadStatus = 'Running' | 'Pending' | 'Degraded' | 'Failed' | 'Unknown'

export interface ClusterDeployment {
  cluster: string
  status: WorkloadStatus
  replicas: number
  readyReplicas: number
  lastUpdated: string
}

export interface Workload {
  name: string
  namespace: string
  type: WorkloadType
  status: WorkloadStatus
  replicas: number
  readyReplicas: number
  image: string
  labels: Record<string, string>
  targetClusters: string[]
  deployments: ClusterDeployment[]
  createdAt: string
}

export type SortByOption = 'name' | 'status' | 'type'

export interface WorkloadStats {
  totalWorkloads: number
  uniqueWorkloads: number
  runningCount: number
  degradedCount: number
  pendingCount: number
  failedCount: number
  totalClusters: number
}

export interface AvailableCluster {
  name: string
  reachable?: boolean
}

export const SCALE_SUCCESS_RESET_MS = 2000
export const REFETCH_AFTER_SCALE_MS = 1500
export const ZERO_REPLICAS = 0
export const CLUSTER_FILTER_STORAGE_KEY = 'kubestellar-card-filter:workload-deployment-clusters'

export const PROTECTED_NAMESPACES = new Set([
  'argocd',
  'calico-system',
  'cert-manager',
  'flux-system',
  'gatekeeper-system',
  'ingress-nginx',
  'kube-node-lease',
  'kube-public',
  'kube-system',
  'kubescape',
  'metallb-system',
  'tigera-operator',
])

export const DEMO_WORKLOADS: Workload[] = [
  {
    name: 'nginx-ingress',
    namespace: 'ingress-system',
    type: 'Deployment',
    status: 'Running',
    replicas: 3,
    readyReplicas: 3,
    image: 'nginx/nginx-ingress:3.4.0',
    labels: { app: 'nginx-ingress', tier: 'frontend' },
    targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'eu-central-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(),
  },
  {
    name: 'api-gateway',
    namespace: 'production',
    type: 'Deployment',
    status: 'Degraded',
    replicas: 5,
    readyReplicas: 3,
    image: 'company/api-gateway:v2.5.1',
    labels: { app: 'api-gateway', tier: 'api' },
    targetClusters: ['us-east-1', 'us-west-2'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Degraded', replicas: 2, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 14 * MS_PER_DAY).toISOString(),
  },
  {
    name: 'postgres-primary',
    namespace: 'databases',
    type: 'StatefulSet',
    status: 'Running',
    replicas: 1,
    readyReplicas: 1,
    image: 'postgres:15.4',
    labels: { app: 'postgres', role: 'primary' },
    targetClusters: ['us-east-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 1, readyReplicas: 1, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 60 * MS_PER_DAY).toISOString(),
  },
  {
    name: 'fluentd',
    namespace: 'logging',
    type: 'DaemonSet',
    status: 'Running',
    replicas: 12,
    readyReplicas: 12,
    image: 'fluent/fluentd:v1.16',
    labels: { app: 'fluentd', tier: 'logging' },
    targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 5, readyReplicas: 5, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Running', replicas: 4, readyReplicas: 4, lastUpdated: new Date().toISOString() },
      { cluster: 'eu-central-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 45 * MS_PER_DAY).toISOString(),
  },
  {
    name: 'ml-training',
    namespace: 'ml-workloads',
    type: 'Job',
    status: 'Pending',
    replicas: 1,
    readyReplicas: 0,
    image: 'company/ml-trainer:latest',
    labels: { app: 'ml-training', team: 'data-science' },
    targetClusters: ['gpu-cluster-1'],
    deployments: [
      { cluster: 'gpu-cluster-1', status: 'Pending', replicas: 1, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString(),
  },
  {
    name: 'payment-service',
    namespace: 'payments',
    type: 'Deployment',
    status: 'Failed',
    replicas: 2,
    readyReplicas: 0,
    image: 'company/payment-service:v1.8.0',
    labels: { app: 'payment-service', tier: 'backend' },
    targetClusters: ['us-east-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Failed', replicas: 2, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 2 * MS_PER_DAY).toISOString(),
  },
]

export const DEMO_STATS: WorkloadStats = {
  totalWorkloads: 24,
  uniqueWorkloads: 24,
  runningCount: 18,
  degradedCount: 3,
  pendingCount: 2,
  failedCount: 1,
  totalClusters: 5,
}

export const statusColors: Record<WorkloadStatus, string> = {
  Running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  Degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-muted-foreground',
}

export const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'status' as const, label: 'Status' },
  { value: 'type' as const, label: 'Type' },
]

export const workloadStatusOrder: Record<string, number> = {
  Failed: 0,
  Degraded: 1,
  Pending: 2,
  Running: 3,
  Unknown: 4,
}

export const WORKLOAD_TYPES: (WorkloadType | 'All')[] = ['All', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']
export const WORKLOAD_STATUSES: (WorkloadStatus | 'All')[] = ['All', 'Running', 'Degraded', 'Pending', 'Failed']

export const worseStatus = (a: WorkloadStatus, b: WorkloadStatus): WorkloadStatus =>
  (workloadStatusOrder[a] ?? 4) < (workloadStatusOrder[b] ?? 4) ? a : b

export async function scaleViaAgent(
  cluster: string,
  namespace: string,
  name: string,
  replicas: number,
): Promise<{ success: boolean; message?: string }> {
  if (isAgentUnavailable()) {
    throw new Error('Agent unavailable')
  }

  const clusterEntry = clusterCacheRef.clusters.find(c => c.name === cluster && c.reachable !== false)
  const context = clusterEntry?.context || cluster

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), MCP_HOOK_TIMEOUT_MS)

  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      signal: ctrl.signal,
      body: JSON.stringify({ cluster: context, namespace, name, replicas }),
    })

    if (!res.ok) {
      throw new Error(`Agent ${res.status}`)
    }

    const data: { success?: boolean; message?: string; error?: string } = await res.json()

    if (data && typeof data === 'object') {
      if (data.error) {
        return { success: false, message: data.error }
      }

      if (typeof data.success === 'boolean') {
        return { success: data.success, message: data.message }
      }
    }

    return { success: false, message: 'Unexpected agent response from scale endpoint' }
  } finally {
    clearTimeout(tid)
  }
}

export const getStatusIconClassName = (status: WorkloadStatus) => {
  switch (status) {
    case 'Running':
      return CheckCircle2
    case 'Degraded':
      return AlertTriangle
    case 'Pending':
      return Clock
    case 'Failed':
      return XCircle
    default:
      return Gauge
  }
}

export const getTypeIconComponent = (type: WorkloadType) => {
  switch (type) {
    case 'Deployment':
      return Box
    case 'StatefulSet':
      return Database
    case 'DaemonSet':
      return Layers
    case 'Job':
    case 'CronJob':
      return Server
    default:
      return Box
  }
}

export function mapApiWorkloads(realWorkloads: ApiWorkload[] | undefined, importedWorkloads: Workload[]): Workload[] {
  if (!realWorkloads || realWorkloads.length === 0) {
    return [...importedWorkloads]
  }

  const mapped = (realWorkloads || []).map((workload: ApiWorkload) => {
    const clusters = workload.targetClusters || (workload.cluster ? [workload.cluster] : [])
    const deployments: ClusterDeployment[] = workload.deployments
      ? (workload.deployments || []).map(deployment => ({
          cluster: deployment.cluster,
          status: deployment.status as WorkloadStatus,
          replicas: deployment.replicas,
          readyReplicas: deployment.readyReplicas,
          lastUpdated: deployment.lastUpdated,
        }))
      : (clusters || []).map(cluster => ({
          cluster,
          status: workload.status as WorkloadStatus,
          replicas: workload.replicas,
          readyReplicas: workload.readyReplicas,
          lastUpdated: workload.createdAt,
        }))

    return {
      name: workload.name,
      namespace: workload.namespace,
      type: workload.type as WorkloadType,
      status: workload.status as WorkloadStatus,
      replicas: workload.replicas || 0,
      readyReplicas: workload.readyReplicas || 0,
      image: workload.image,
      labels: workload.labels || {},
      targetClusters: clusters,
      deployments,
      createdAt: workload.createdAt,
    }
  })

  const grouped = new Map<string, Workload>()
  for (const workload of mapped) {
    const key = `${workload.namespace}/${workload.name}`
    const existing = grouped.get(key)

    if (existing) {
      existing.targetClusters = [...new Set([...(existing.targetClusters || []), ...(workload.targetClusters || [])])]
      existing.deployments = [...(existing.deployments || []), ...(workload.deployments || [])]
      existing.replicas += workload.replicas || 0
      existing.readyReplicas += workload.readyReplicas || 0
      existing.status = worseStatus(existing.status, workload.status)
    } else {
      grouped.set(key, { ...workload })
    }
  }

  return [...Array.from(grouped.values()), ...importedWorkloads]
}

export function getAvailableClusters(isDemo: boolean, deduplicatedClusters: AvailableCluster[], demoWorkloads: Workload[]) {
  if (isDemo) {
    const demoClusterNames = new Set((demoWorkloads || []).flatMap(workload => workload.targetClusters || []))
    return Array.from(demoClusterNames).map(name => ({ name, reachable: true }))
  }

  return (deduplicatedClusters || []).filter(cluster => cluster.reachable !== false)
}

export function getWorkloadStats(
  isDemo: boolean,
  realWorkloads: ApiWorkload[] | undefined,
  workloads: Workload[],
): WorkloadStats {
  if (isDemo) {
    return DEMO_STATS
  }

  return {
    totalWorkloads: realWorkloads?.length ?? workloads.length,
    uniqueWorkloads: workloads.length,
    runningCount: (workloads || []).filter(workload => workload.status === 'Running').length,
    degradedCount: (workloads || []).filter(workload => workload.status === 'Degraded').length,
    pendingCount: (workloads || []).filter(workload => workload.status === 'Pending').length,
    failedCount: (workloads || []).filter(workload => workload.status === 'Failed').length,
    totalClusters: new Set((workloads || []).flatMap(workload => workload.targetClusters || [])).size,
  }
}

export function filterWorkloads(
  workloads: Workload[],
  typeFilter: WorkloadType | 'All',
  statusFilter: WorkloadStatus | 'All',
  localClusterFilter: string[],
  availableClusters: AvailableCluster[],
) {
  let result = workloads

  if (typeFilter !== 'All') {
    result = (result || []).filter(workload => workload.type === typeFilter)
  }

  if (statusFilter !== 'All') {
    result = (result || []).filter(workload => workload.status === statusFilter)
  }

  const availableClusterNames = new Set((availableClusters || []).map(cluster => cluster.name))
  const validClusterFilter = (localClusterFilter || []).filter(cluster => availableClusterNames.has(cluster))

  if (validClusterFilter.length > 0) {
    result = (result || []).filter(workload =>
      (workload.targetClusters || []).some(cluster => validClusterFilter.includes(cluster)),
    )
  }

  return result
}
