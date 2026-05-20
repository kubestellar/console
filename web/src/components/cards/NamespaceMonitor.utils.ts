import type { ClusterInfo } from '../../hooks/useMCP'
import { Box, Clock, Container, FileKey, FileText, HardDrive, Network, type LucideIcon } from 'lucide-react'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import type {
  ChangeType,
  ConfigMapItem,
  DeploymentItem,
  JobItem,
  NamespaceData,
  PVCItem,
  PodItem,
  ResourceChange,
  ResourceChangeCounts,
  ResourceSnapshot,
  ResourceType,
  SecretItem,
  ServiceItem,
} from './NamespaceMonitor.types'

export const ResourceIcons: Record<ResourceType, LucideIcon> = {
  pods: Container,
  deployments: Box,
  services: Network,
  configmaps: FileText,
  secrets: FileKey,
  pvcs: HardDrive,
  jobs: Clock,
}

export const ResourceColors: Record<ResourceType, string> = {
  pods: 'text-cyan-400',
  deployments: 'text-green-400',
  services: 'text-blue-400',
  configmaps: 'text-orange-400',
  secrets: 'text-red-400',
  pvcs: 'text-green-400',
  jobs: 'text-yellow-400',
}

export const ChangeAnimations: Record<Exclude<ChangeType, null>, string> = {
  added: 'animate-pulse bg-green-500/20 border-green-500/50',
  modified: 'animate-pulse bg-yellow-500/20 border-yellow-500/50',
  deleted: 'animate-pulse bg-red-500/20 border-red-500/50 opacity-50',
  error: 'animate-pulse bg-red-500/30 border-red-500/60',
}

/**
 * Hard cap on the number of namespace rows rendered per cluster (#6208).
 *
 * Each namespace row triggers 7 separate `.filter()` passes over the full
 * pods/deployments/services/configmaps/secrets/PVCs/jobs lists. With 80+
 * namespaces and 500 pods, every state update was triggering an
 * O(namespaces × resources) recomputation across all of them at once and
 * dropping frames. Capping at 30 keeps the worst case to 30 × 7 × N
 * filters per refresh, while still showing all the namespaces for
 * realistically-sized clusters. The "more namespaces filtered out" hint
 * below the list tells the user to use the search box to narrow down.
 */
export const MAX_NAMESPACES_RENDERED_PER_CLUSTER = 30

export const MAX_VISIBLE_ITEMS = 10
export const MAX_RECENT_CHANGES = 50
export const MAX_VISIBLE_CHANGES = 20
export const RECENT_CHANGE_WINDOW_MS = 5000

export const EMPTY_NAMESPACE_DATA: Map<string, NamespaceData> = new Map()

interface FilterClustersOptions {
  clusters: ClusterInfo[]
  selectedClusters: string[]
  isAllClustersSelected: boolean
  searchFilter: string
}

interface BuildSnapshotsOptions {
  selectedCluster: string
  pods?: PodItem[]
  deployments?: DeploymentItem[]
  services?: ServiceItem[]
  pvcs?: PVCItem[]
  configmaps?: ConfigMapItem[]
  secrets?: SecretItem[]
  jobs?: JobItem[]
}

interface BuildNamespaceDataOptions {
  selectedCluster: string | null
  namespaces?: string[]
  pods?: PodItem[]
  deployments?: DeploymentItem[]
  services?: ServiceItem[]
  configmaps?: ConfigMapItem[]
  secrets?: SecretItem[]
  pvcs?: PVCItem[]
  jobs?: JobItem[]
  searchFilter: string
}

function groupByNamespace<T extends { namespace: string }>(items?: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const item of (items || [])) {
    const namespaceItems = grouped.get(item.namespace)
    if (namespaceItems) {
      namespaceItems.push(item)
    } else {
      grouped.set(item.namespace, [item])
    }
  }

  return grouped
}

export function getFilteredClusters({
  clusters,
  selectedClusters,
  isAllClustersSelected,
  searchFilter,
}: FilterClustersOptions): ClusterInfo[] {
  let filtered = (clusters || []).filter(cluster => cluster.reachable !== false)

  if (!isAllClustersSelected) {
    filtered = filtered.filter(cluster => selectedClusters.includes(cluster.name))
  }

  if (!searchFilter) {
    return filtered
  }

  const query = searchFilter.toLowerCase()
  return filtered.filter(cluster => cluster.name.toLowerCase().includes(query))
}

export function buildCurrentSnapshots({
  selectedCluster,
  pods,
  deployments,
  services,
  pvcs,
  configmaps,
  secrets,
  jobs,
}: BuildSnapshotsOptions): Map<string, ResourceSnapshot> {
  const currentSnapshots = new Map<string, ResourceSnapshot>()

  ;(pods || []).forEach(pod => {
    const key = `${selectedCluster}:${pod.namespace}:pod:${pod.name}`
    currentSnapshots.set(key, {
      key,
      name: pod.name,
      namespace: pod.namespace,
      cluster: selectedCluster,
      status: pod.status,
    })
  })

  ;(deployments || []).forEach(deployment => {
    const key = `${selectedCluster}:${deployment.namespace}:deployment:${deployment.name}`
    currentSnapshots.set(key, {
      key,
      name: deployment.name,
      namespace: deployment.namespace,
      cluster: selectedCluster,
      status: deployment.status,
      replicas: deployment.replicas,
      readyReplicas: deployment.readyReplicas,
    })
  })

  ;(services || []).forEach(service => {
    const key = `${selectedCluster}:${service.namespace}:service:${service.name}`
    currentSnapshots.set(key, {
      key,
      name: service.name,
      namespace: service.namespace,
      cluster: selectedCluster,
    })
  })

  ;(pvcs || []).forEach(pvc => {
    const key = `${selectedCluster}:${pvc.namespace}:pvc:${pvc.name}`
    currentSnapshots.set(key, {
      key,
      name: pvc.name,
      namespace: pvc.namespace,
      cluster: selectedCluster,
      status: pvc.status,
    })
  })

  ;(configmaps || []).forEach(configMap => {
    const key = `${selectedCluster}:${configMap.namespace}:configmap:${configMap.name}`
    currentSnapshots.set(key, {
      key,
      name: configMap.name,
      namespace: configMap.namespace,
      cluster: selectedCluster,
    })
  })

  ;(secrets || []).forEach(secret => {
    const key = `${selectedCluster}:${secret.namespace}:secret:${secret.name}`
    currentSnapshots.set(key, {
      key,
      name: secret.name,
      namespace: secret.namespace,
      cluster: selectedCluster,
    })
  })

  ;(jobs || []).forEach(job => {
    const key = `${selectedCluster}:${job.namespace}:job:${job.name}`
    currentSnapshots.set(key, {
      key,
      name: job.name,
      namespace: job.namespace,
      cluster: selectedCluster,
      status: job.status,
    })
  })

  return currentSnapshots
}

export function detectResourceChanges(
  currentSnapshots: Map<string, ResourceSnapshot>,
  previousSnapshots: Map<string, ResourceSnapshot>,
): ResourceChange[] {
  const newChanges: ResourceChange[] = []

  currentSnapshots.forEach((currentSnapshot, key) => {
    const previousSnapshot = previousSnapshots.get(key)
    const resourceType = key.split(':')[2] as ResourceType

    if (!previousSnapshot) {
      newChanges.push({
        type: 'added',
        timestamp: Date.now(),
        resourceType,
        name: currentSnapshot.name,
        namespace: currentSnapshot.namespace,
        cluster: currentSnapshot.cluster,
        details: 'New resource created',
      })
      return
    }

    if (
      currentSnapshot.status !== previousSnapshot.status ||
      currentSnapshot.replicas !== previousSnapshot.replicas ||
      currentSnapshot.readyReplicas !== previousSnapshot.readyReplicas
    ) {
      const isError =
        currentSnapshot.status === 'CrashLoopBackOff' ||
        currentSnapshot.status === 'Error' ||
        currentSnapshot.status === 'Failed' ||
        (currentSnapshot.readyReplicas !== undefined &&
          currentSnapshot.readyReplicas < (currentSnapshot.replicas || 0))

      newChanges.push({
        type: isError ? 'error' : 'modified',
        timestamp: Date.now(),
        resourceType,
        name: currentSnapshot.name,
        namespace: currentSnapshot.namespace,
        cluster: currentSnapshot.cluster,
        details: `Status: ${previousSnapshot.status} → ${currentSnapshot.status}`,
      })
    }
  })

  previousSnapshots.forEach((previousSnapshot, key) => {
    if (!currentSnapshots.has(key)) {
      const resourceType = key.split(':')[2] as ResourceType
      newChanges.push({
        type: 'deleted',
        timestamp: Date.now(),
        resourceType,
        name: previousSnapshot.name,
        namespace: previousSnapshot.namespace,
        cluster: previousSnapshot.cluster,
        details: 'Resource deleted',
      })
    }
  })

  return newChanges
}

export function buildNamespaceData({
  selectedCluster,
  namespaces,
  pods,
  deployments,
  services,
  configmaps,
  secrets,
  pvcs,
  jobs,
  searchFilter,
}: BuildNamespaceDataOptions): Map<string, NamespaceData> {
  if (!selectedCluster) {
    return new Map()
  }

  let filteredNamespaces = namespaces || []
  if (searchFilter) {
    const query = searchFilter.toLowerCase()
    filteredNamespaces = filteredNamespaces.filter(namespace => namespace.toLowerCase().includes(query))
  }

  const podsByNamespace = groupByNamespace(pods)
  const deploymentsByNamespace = groupByNamespace(deployments)
  const servicesByNamespace = groupByNamespace(services)
  const configMapsByNamespace = groupByNamespace(configmaps)
  const secretsByNamespace = groupByNamespace(secrets)
  const pvcsByNamespace = groupByNamespace(pvcs)
  const jobsByNamespace = groupByNamespace(jobs)

  const namespaceData = new Map<string, NamespaceData>()
  filteredNamespaces.forEach(namespace => {
    const namespacePods = podsByNamespace.get(namespace) || []
    const namespaceDeployments = deploymentsByNamespace.get(namespace) || []
    const namespaceServices = servicesByNamespace.get(namespace) || []
    const namespaceConfigMaps = configMapsByNamespace.get(namespace) || []
    const namespaceSecrets = secretsByNamespace.get(namespace) || []
    const namespacePvcs = pvcsByNamespace.get(namespace) || []
    const namespaceJobs = jobsByNamespace.get(namespace) || []

    const hasIssues =
      namespacePods.some(pod => pod.status !== 'Running' && pod.status !== 'Succeeded') ||
      namespaceDeployments.some(deployment => deployment.readyReplicas < deployment.replicas)

    namespaceData.set(namespace, {
      pods: namespacePods,
      deployments: namespaceDeployments,
      services: namespaceServices,
      configmaps: namespaceConfigMaps,
      secrets: namespaceSecrets,
      pvcs: namespacePvcs,
      jobs: namespaceJobs,
      hasIssues,
    })
  })

  return namespaceData
}

export function getResourceChange(
  recentChanges: ResourceChange[],
  cluster: string,
  namespace: string,
  type: ResourceType,
  name: string,
): ChangeType {
  const change = (recentChanges || []).find(
    recentChange =>
      recentChange.cluster === cluster &&
      recentChange.namespace === namespace &&
      recentChange.resourceType === type &&
      recentChange.name === name,
  )

  if (change && Date.now() - change.timestamp < RECENT_CHANGE_WINDOW_MS) {
    return change.type
  }

  return null
}

export function getChangeCountsByType(recentChanges: ResourceChange[]): ResourceChangeCounts {
  const counts: ResourceChangeCounts = { added: 0, modified: 0, deleted: 0, error: 0 }
  const recentTime = Date.now() - MS_PER_MINUTE

  ;(recentChanges || []).forEach(change => {
    if (change.timestamp > recentTime && change.type) {
      counts[change.type]++
    }
  })

  return counts
}
