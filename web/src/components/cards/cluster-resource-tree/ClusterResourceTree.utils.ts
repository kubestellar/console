import type { ClusterInfo } from '../../../hooks/mcp/types'
import type { ClusterDataCache, IssueCounts } from './types'

export { buildNamespaceResources, getVisibleNamespaces, getIssueCounts, getPodsForDeployment } from './TreeBuilder'

interface ClusterTaggedResource {
  cluster?: string
}

interface CachedNodeResource extends ClusterTaggedResource {
  name: string
  status: string
}

interface CachedDeploymentResource extends ClusterTaggedResource {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  status?: string
  image?: string
}

interface CachedServiceResource extends ClusterTaggedResource {
  name: string
  namespace: string
  type: string
}

interface CachedPVCResource {
  name: string
  namespace: string
  status: string
  capacity?: string
}

interface CachedPodResource extends ClusterTaggedResource {
  name: string
  namespace: string
  status: string
  restarts: number
}

interface CachedConfigMapResource {
  name: string
  namespace: string
  dataCount?: number
}

interface CachedSecretResource {
  name: string
  namespace: string
  type?: string
}

interface CachedServiceAccountResource {
  name: string
  namespace: string
}

interface CachedJobResource {
  name: string
  namespace: string
  status: string
  completions: string
  duration?: string
}

interface CachedHPAResource {
  name: string
  namespace: string
  reference: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
}

interface CachedReplicaSetResource {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  ownerName?: string
}

interface CachedStatefulSetResource {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  status: string
}

interface CachedDaemonSetResource {
  name: string
  namespace: string
  desiredScheduled: number
  ready: number
  status: string
}

interface CachedCronJobResource {
  name: string
  namespace: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule?: string
}

interface CachedIngressResource {
  name: string
  namespace: string
  class?: string
  hosts?: string[]
  address?: string
}

interface CachedNetworkPolicyResource {
  name: string
  namespace: string
  policyTypes?: string[]
  podSelector: string
}

interface CachedPodIssueResource {
  name: string
  namespace: string
  status: string
  reason?: string
}

interface FilterClustersParams {
  clusters: ClusterInfo[]
  isAllClustersSelected: boolean
  selectedClusters: string[]
  localClusterFilter: string[]
  searchFilter: string
}

interface NormalizeClusterDataParams {
  maxItems: number
  allNodes: CachedNodeResource[]
  allNamespaces?: string[]
  allDeployments?: CachedDeploymentResource[]
  allServices?: CachedServiceResource[]
  allPVCs?: CachedPVCResource[]
  allPods?: CachedPodResource[]
  allConfigMaps?: CachedConfigMapResource[]
  allSecrets?: CachedSecretResource[]
  allServiceAccounts?: CachedServiceAccountResource[]
  allJobs?: CachedJobResource[]
  allHPAs?: CachedHPAResource[]
  allReplicaSets?: CachedReplicaSetResource[]
  allStatefulSets?: CachedStatefulSetResource[]
  allDaemonSets?: CachedDaemonSetResource[]
  allCronJobs?: CachedCronJobResource[]
  allIngresses?: CachedIngressResource[]
  allNetworkPolicies?: CachedNetworkPolicyResource[]
  podIssues?: CachedPodIssueResource[]
}

interface ClusterFetchState {
  allNodes?: CachedNodeResource[]
  allNamespaces?: string[]
  allDeployments?: CachedDeploymentResource[]
  allPods?: CachedPodResource[]
}

interface ClusterTagValidationState {
  allNodes?: CachedNodeResource[]
  allDeployments?: CachedDeploymentResource[]
  allPods?: CachedPodResource[]
  allServices?: CachedServiceResource[]
}

function sliceResources<T>(items: T[] | undefined, maxItems: number): T[] {
  return (items || []).slice(0, maxItems)
}

export function filterClusters({
  clusters,
  isAllClustersSelected,
  selectedClusters,
  localClusterFilter,
  searchFilter,
}: FilterClustersParams): ClusterInfo[] {
  let filtered = clusters

  if (!isAllClustersSelected) {
    filtered = filtered.filter(cluster => selectedClusters.includes(cluster.name))
  }

  if (localClusterFilter.length > 0) {
    filtered = filtered.filter(cluster => localClusterFilter.includes(cluster.name))
  }

  if (searchFilter) {
    const query = searchFilter.toLowerCase()
    filtered = filtered.filter(cluster => cluster.name.toLowerCase().includes(query))
  }

  return filtered
}

export function hasAnyClusterResourceData({
  allNodes,
  allNamespaces,
  allDeployments,
  allPods,
}: ClusterFetchState): boolean {
  return Boolean(
    (allNodes && allNodes.length > 0) ||
    (allNamespaces && allNamespaces.length > 0) ||
    (allDeployments && allDeployments.length > 0) ||
    (allPods && allPods.length > 0),
  )
}

export function hasCrossClusterTagMismatch(
  cluster: string,
  { allNodes, allDeployments, allPods, allServices }: ClusterTagValidationState,
): boolean {
  const tagMismatch = (tag?: string) => tag !== undefined && tag !== cluster

  return Boolean(
    (allNodes && allNodes.length > 0 && tagMismatch(allNodes[0].cluster)) ||
    (allPods && allPods.length > 0 && tagMismatch(allPods[0].cluster)) ||
    (allDeployments && allDeployments.length > 0 && tagMismatch(allDeployments[0].cluster)) ||
    (allServices && allServices.length > 0 && tagMismatch(allServices[0].cluster)),
  )
}

export function normalizeClusterDataCache({
  maxItems,
  allNodes,
  allNamespaces,
  allDeployments,
  allServices,
  allPVCs,
  allPods,
  allConfigMaps,
  allSecrets,
  allServiceAccounts,
  allJobs,
  allHPAs,
  allReplicaSets,
  allStatefulSets,
  allDaemonSets,
  allCronJobs,
  allIngresses,
  allNetworkPolicies,
  podIssues,
}: NormalizeClusterDataParams): ClusterDataCache {
  return {
    nodes: sliceResources(allNodes, maxItems).map(node => ({ name: node.name, status: node.status })),
    namespaces: [...(allNamespaces || [])].slice(0, maxItems),
    deployments: sliceResources(allDeployments, maxItems).map(deployment => ({
      name: deployment.name,
      namespace: deployment.namespace,
      replicas: deployment.replicas,
      readyReplicas: deployment.readyReplicas,
      status: deployment.status,
      image: deployment.image,
    })),
    services: sliceResources(allServices, maxItems).map(service => ({
      name: service.name,
      namespace: service.namespace,
      type: service.type,
    })),
    pvcs: sliceResources(allPVCs, maxItems).map(pvc => ({
      name: pvc.name,
      namespace: pvc.namespace,
      status: pvc.status,
      capacity: pvc.capacity,
    })),
    pods: sliceResources(allPods, maxItems).map(pod => ({
      name: pod.name,
      namespace: pod.namespace,
      status: pod.status,
      restarts: pod.restarts,
    })),
    configmaps: sliceResources(allConfigMaps, maxItems).map(configMap => ({
      name: configMap.name,
      namespace: configMap.namespace,
      dataCount: configMap.dataCount || 0,
    })),
    secrets: sliceResources(allSecrets, maxItems).map(secret => ({
      name: secret.name,
      namespace: secret.namespace,
      type: secret.type || 'Opaque',
    })),
    serviceaccounts: sliceResources(allServiceAccounts, maxItems).map(serviceAccount => ({
      name: serviceAccount.name,
      namespace: serviceAccount.namespace,
    })),
    jobs: sliceResources(allJobs, maxItems).map(job => ({
      name: job.name,
      namespace: job.namespace,
      status: job.status,
      completions: job.completions,
      duration: job.duration,
    })),
    hpas: sliceResources(allHPAs, maxItems).map(hpa => ({
      name: hpa.name,
      namespace: hpa.namespace,
      reference: hpa.reference,
      minReplicas: hpa.minReplicas,
      maxReplicas: hpa.maxReplicas,
      currentReplicas: hpa.currentReplicas,
    })),
    replicasets: sliceResources(allReplicaSets, maxItems).map(replicaSet => ({
      name: replicaSet.name,
      namespace: replicaSet.namespace,
      replicas: replicaSet.replicas,
      readyReplicas: replicaSet.readyReplicas,
      ownerName: replicaSet.ownerName,
    })),
    statefulsets: sliceResources(allStatefulSets, maxItems).map(statefulSet => ({
      name: statefulSet.name,
      namespace: statefulSet.namespace,
      replicas: statefulSet.replicas,
      readyReplicas: statefulSet.readyReplicas,
      status: statefulSet.status,
    })),
    daemonsets: sliceResources(allDaemonSets, maxItems).map(daemonSet => ({
      name: daemonSet.name,
      namespace: daemonSet.namespace,
      desiredScheduled: daemonSet.desiredScheduled,
      ready: daemonSet.ready,
      status: daemonSet.status,
    })),
    cronjobs: sliceResources(allCronJobs, maxItems).map(cronJob => ({
      name: cronJob.name,
      namespace: cronJob.namespace,
      schedule: cronJob.schedule,
      suspend: cronJob.suspend,
      active: cronJob.active,
      lastSchedule: cronJob.lastSchedule,
    })),
    ingresses: sliceResources(allIngresses, maxItems).map(ingress => ({
      name: ingress.name,
      namespace: ingress.namespace,
      class: ingress.class,
      hosts: ingress.hosts || [],
      address: ingress.address,
    })),
    networkpolicies: sliceResources(allNetworkPolicies, maxItems).map(networkPolicy => ({
      name: networkPolicy.name,
      namespace: networkPolicy.namespace,
      policyTypes: networkPolicy.policyTypes || [],
      podSelector: networkPolicy.podSelector,
    })),
    podIssues: sliceResources(podIssues, maxItems).map(issue => ({
      name: issue.name,
      namespace: issue.namespace,
      status: issue.status,
      reason: issue.reason,
    })),
  }
}

export function getTotalIssueCounts(clusterDataCache: Map<string, ClusterDataCache>): IssueCounts {
  const counts: IssueCounts = { nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 }

  for (const clusterData of clusterDataCache.values()) {
    counts.nodes += clusterData.nodes.filter(node => node.status !== 'Ready').length
    counts.deployments += clusterData.deployments.filter(deployment => deployment.readyReplicas < deployment.replicas).length
    counts.pods += clusterData.podIssues.length
    counts.pvcs += clusterData.pvcs.filter(pvc => pvc.status !== 'Bound').length
  }

  counts.total = counts.nodes + counts.deployments + counts.pods + counts.pvcs
  return counts
}

export function evictOfflineClusterCacheEntries(
  currentCache: Map<string, ClusterDataCache>,
  clusters: ClusterInfo[],
): Map<string, ClusterDataCache> | null {
  const offlineClusterNames = clusters.filter(cluster => !cluster.healthy).map(cluster => cluster.name)
  if (offlineClusterNames.length === 0) return null

  let changed = false
  const nextCache = new Map(currentCache)

  for (const clusterName of offlineClusterNames) {
    if (nextCache.has(clusterName)) {
      nextCache.delete(clusterName)
      changed = true
    }
  }

  return changed ? nextCache : null
}
