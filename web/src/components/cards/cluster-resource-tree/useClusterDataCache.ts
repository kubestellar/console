import { useEffect, useState } from 'react'
import {
  useCachedConfigMaps,
  useCachedCronJobs,
  useCachedDaemonSets,
  useCachedDeployments,
  useCachedHPAs,
  useCachedIngresses,
  useCachedJobs,
  useCachedNamespaces,
  useCachedNetworkPolicies,
  useCachedNodes,
  useCachedPVCs,
  useCachedPodIssues,
  useCachedPods,
  useCachedReplicaSets,
  useCachedSecrets,
  useCachedServiceAccounts,
  useCachedServices,
  useCachedStatefulSets,
} from '../../../hooks/useCachedData'
import { MAX_CACHED_PER_TYPE } from './ClusterResourceTree.constants'
import {
  evictOfflineClusterCacheEntries,
  hasAnyClusterResourceData,
  hasCrossClusterTagMismatch,
  normalizeClusterDataCache,
} from './ClusterResourceTree.utils'
import type { ClusterInfo } from '../../../hooks/mcp/types'
import type { ClusterDataCache } from './types'

interface UseClusterDataCacheParams {
  clusters: ClusterInfo[]
}

export function useClusterDataCache({ clusters }: UseClusterDataCacheParams) {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())
  const [clusterDataCache, setClusterDataCache] = useState<Map<string, ClusterDataCache>>(new Map())

  const { issues: podIssues, isRefreshing: podIssuesRefreshing } = useCachedPodIssues(selectedCluster || undefined)
  const { nodes: allNodes, isLoading: nodesLoading, isRefreshing: nodesRefreshing, isDemoFallback: nodesDemoFallback } = useCachedNodes(selectedCluster || undefined)
  const { namespaces: allNamespaces, isLoading: namespacesLoading, isRefreshing: namespacesRefreshing, isDemoFallback: namespacesDemoFallback } = useCachedNamespaces(selectedCluster || undefined)
  const { deployments: allDeployments, isRefreshing: deploymentsRefreshing, isDemoFallback: deploymentsDemoFallback } = useCachedDeployments(selectedCluster || undefined)
  const { services: allServices, isRefreshing: servicesRefreshing, isDemoFallback: servicesDemoFallback } = useCachedServices(selectedCluster || undefined)
  const { pvcs: allPVCs, isRefreshing: pvcsRefreshing, isDemoFallback: pvcsDemoFallback } = useCachedPVCs(selectedCluster || undefined)
  const { pods: allPods, isRefreshing: podsRefreshing, isDemoFallback: podsDemoFallback } = useCachedPods(selectedCluster || undefined, undefined, { limit: 500 })
  const { configmaps: allConfigMaps, isRefreshing: configmapsRefreshing, isDemoFallback: configmapsDemoFallback } = useCachedConfigMaps(selectedCluster || undefined)
  const { secrets: allSecrets, isRefreshing: secretsRefreshing, isDemoFallback: secretsDemoFallback } = useCachedSecrets(selectedCluster || undefined)
  const { serviceAccounts: allServiceAccounts, isRefreshing: serviceAccountsRefreshing, isDemoFallback: serviceAccountsDemoFallback } = useCachedServiceAccounts(selectedCluster || undefined)
  const { jobs: allJobs, isRefreshing: jobsRefreshing, isDemoFallback: jobsDemoFallback } = useCachedJobs(selectedCluster || undefined)
  const { hpas: allHPAs, isRefreshing: hpasRefreshing, isDemoFallback: hpasDemoFallback } = useCachedHPAs(selectedCluster || undefined)
  const { replicasets: allReplicaSets, isRefreshing: replicasetsRefreshing, isDemoFallback: replicasetsDemoFallback } = useCachedReplicaSets(selectedCluster || undefined)
  const { statefulsets: allStatefulSets, isRefreshing: statefulsetsRefreshing, isDemoFallback: statefulsetsDemoFallback } = useCachedStatefulSets(selectedCluster || undefined)
  const { daemonsets: allDaemonSets, isRefreshing: daemonsetsRefreshing, isDemoFallback: daemonsetsDemoFallback } = useCachedDaemonSets(selectedCluster || undefined)
  const { cronjobs: allCronJobs, isRefreshing: cronjobsRefreshing, isDemoFallback: cronjobsDemoFallback } = useCachedCronJobs(selectedCluster || undefined)
  const { ingresses: allIngresses, isRefreshing: ingressesRefreshing, isDemoFallback: ingressesDemoFallback } = useCachedIngresses(selectedCluster || undefined)
  const { networkpolicies: allNetworkPolicies, isRefreshing: networkpoliciesRefreshing, isDemoFallback: networkpoliciesDemoFallback } = useCachedNetworkPolicies(selectedCluster || undefined)

  const isDemoData = nodesDemoFallback || namespacesDemoFallback || deploymentsDemoFallback ||
    servicesDemoFallback || pvcsDemoFallback || podsDemoFallback || configmapsDemoFallback ||
    secretsDemoFallback || serviceAccountsDemoFallback || jobsDemoFallback || hpasDemoFallback ||
    replicasetsDemoFallback || statefulsetsDemoFallback || daemonsetsDemoFallback ||
    cronjobsDemoFallback || ingressesDemoFallback || networkpoliciesDemoFallback

  const isRefreshing = podIssuesRefreshing || nodesRefreshing || namespacesRefreshing ||
    deploymentsRefreshing || servicesRefreshing || pvcsRefreshing || podsRefreshing || configmapsRefreshing ||
    secretsRefreshing || serviceAccountsRefreshing || jobsRefreshing || hpasRefreshing || replicasetsRefreshing ||
    statefulsetsRefreshing || daemonsetsRefreshing || cronjobsRefreshing || ingressesRefreshing ||
    networkpoliciesRefreshing

  useEffect(() => {
    const cluster = selectedCluster
    if (!cluster) return

    const anyHookFinished = !nodesLoading || !namespacesLoading
    if (!anyHookFinished) return
    if (!hasAnyClusterResourceData({ allNodes, allNamespaces, allDeployments, allPods })) return
    if (hasCrossClusterTagMismatch(cluster, { allNodes, allDeployments, allPods, allServices })) return

    const normalizedClusterData = normalizeClusterDataCache({
      maxItems: MAX_CACHED_PER_TYPE,
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
    })

    setClusterDataCache(previousCache => {
      const nextCache = new Map(previousCache)
      nextCache.set(cluster, normalizedClusterData)
      return nextCache
    })

    setLoadingClusters(previousLoading => {
      const nextLoading = new Set(previousLoading)
      nextLoading.delete(cluster)
      return nextLoading
    })
  }, [selectedCluster, nodesLoading, namespacesLoading, allNodes, allNamespaces, allDeployments, allServices, allPVCs, allPods, allConfigMaps, allSecrets, allServiceAccounts, allJobs, allHPAs, allReplicaSets, allStatefulSets, allDaemonSets, allCronJobs, allIngresses, allNetworkPolicies, podIssues])

  useEffect(() => {
    setClusterDataCache(previousCache => evictOfflineClusterCacheEntries(previousCache, clusters) || previousCache)
  }, [clusters])

  const getClusterData = (clusterName: string): ClusterDataCache | null => clusterDataCache.get(clusterName) || null

  return {
    selectedCluster,
    setSelectedCluster,
    loadingClusters,
    setLoadingClusters,
    clusterDataCache,
    getClusterData,
    isDemoData,
    isRefreshing,
  }
}
