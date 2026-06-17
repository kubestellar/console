import { useEffect, useState, useMemo } from 'react'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaces, useNamespaceStats, useDeployments, useServices, useEvents, type ClusterInfo } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { LOADING_TIMEOUT_MS } from '../../../lib/constants/network'
import type { TreeLens } from './ClusterDrillDown.tree'

interface UseClusterDrillDownStateProps {
  clusterName: string
  clusterInfo: ClusterInfo | undefined
  effectiveClusterName: string
  activeLens: TreeLens
  searchFilter: string
}

export function useClusterDrillDownState({
  clusterName,
  clusterInfo,
  effectiveClusterName,
  activeLens,
  searchFilter,
}: UseClusterDrillDownStateProps) {
  // Safeguard timeout — show content after LOADING_TIMEOUT_MS (5 s) to prevent infinite loading
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    setLoadingTimedOut(false) // Reset on cluster change
    const timer = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [effectiveClusterName])

  const { health, isLoading: healthLoading } = useClusterHealth(effectiveClusterName)
  const isLoading = healthLoading && !loadingTimedOut

  const { issues: podIssues } = usePodIssues(effectiveClusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(effectiveClusterName)
  const { nodes: allGPUNodes } = useGPUNodes(effectiveClusterName)
  const { nodes: allNodes } = useNodes(effectiveClusterName)
  const { namespaces: allNamespaces } = useNamespaces(effectiveClusterName)
  const { stats: namespaceStats } = useNamespaceStats(effectiveClusterName)
  const { deployments: allDeployments } = useDeployments(effectiveClusterName)
  const { services: allServices } = useServices(effectiveClusterName)
  const { pvcs: allPVCs } = useCachedPVCs(effectiveClusterName)
  const { events: clusterEvents, isLoading: eventsLoading } = useEvents(effectiveClusterName, undefined, 10)

  const clusterLookupNames = useMemo(() => {
    const names = new Set<string>()
    if (clusterName) names.add(clusterName)
    if (effectiveClusterName) names.add(effectiveClusterName)
    ;(clusterInfo?.aliases || []).forEach((alias: string) => names.add(alias))
    return names
  }, [clusterInfo?.aliases, clusterName, effectiveClusterName])

  const clusterPrefix = useMemo(() => effectiveClusterName.split('/')[0], [effectiveClusterName])
  const normalizedSearchFilter = useMemo(() => searchFilter.trim().toLowerCase(), [searchFilter])

  const clusterGPUNodes = useMemo(() => {
    if (!effectiveClusterName) return []
    return (allGPUNodes || []).filter(node => clusterLookupNames.has(node.cluster) || node.cluster.includes(clusterPrefix))
  }, [allGPUNodes, clusterLookupNames, effectiveClusterName, clusterPrefix])

  const clusterDeploymentIssues = useMemo(() => {
    if (!effectiveClusterName) return []
    return (deploymentIssues || []).filter(issue => clusterLookupNames.has(issue.cluster || '') || issue.cluster?.includes(clusterPrefix))
  }, [clusterLookupNames, effectiveClusterName, clusterPrefix, deploymentIssues])

  const namespaces = useMemo(() => {
    const ns = new Set<string>()
    podIssues.forEach(p => ns.add(p.namespace))
    clusterDeploymentIssues.forEach(d => ns.add(d.namespace))
    return Array.from(ns).sort()
  }, [podIssues, clusterDeploymentIssues])

  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: number }> = {}
    clusterGPUNodes.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) map[type] = { total: 0, allocated: 0, nodes: 0 }
      map[type].total += node.gpuCount || 0
      map[type].allocated += node.gpuAllocated || 0
      map[type].nodes += 1
    })
    return map
  }, [clusterGPUNodes])

  const filteredNodes = useMemo(() => {
    let nodes = allNodes || []
    if (normalizedSearchFilter) {
      nodes = nodes.filter(n => n.name.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      nodes = nodes.filter(n => n.status !== 'Ready')
    }
    if (activeLens === 'nodes' || activeLens === 'all') return nodes
    return activeLens === 'issues' ? nodes : []
  }, [activeLens, allNodes, normalizedSearchFilter])

  const filteredNamespaceStats = useMemo(() => {
    const statsByName = new Map(namespaceStats.map(ns => [ns.name, ns]))
    const mergedNamespaceNames = Array.from(new Set([
      ...namespaceStats.map(ns => ns.name),
      ...(allNamespaces || []),
    ]))

    let nsList = mergedNamespaceNames.map(name => statsByName.get(name) || {
      name,
      podCount: 0,
      runningPods: 0,
      pendingPods: 0,
      failedPods: 0,
    })

    if (normalizedSearchFilter) {
      nsList = nsList.filter(ns => ns.name.toLowerCase().includes(normalizedSearchFilter))
    }

    if (!normalizedSearchFilter) {
      const nonSystemNs = nsList.filter(ns => !ns.name.startsWith('kube-') && ns.name !== 'default')
      if (nonSystemNs.length > 0) nsList = nonSystemNs
    }

    return nsList
  }, [allNamespaces, namespaceStats, normalizedSearchFilter])

  const filteredNamespaces = useMemo(
    () => filteredNamespaceStats.map(ns => ns.name),
    [filteredNamespaceStats],
  )

  const filteredDeployments = useMemo(() => {
    let deps = allDeployments || []
    if (normalizedSearchFilter) {
      deps = deps.filter(d => d.name.toLowerCase().includes(normalizedSearchFilter) || d.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') {
      deps = deps.filter(d => d.readyReplicas < d.replicas || d.status === 'failed')
    }
    if (activeLens === 'workloads' || activeLens === 'all' || activeLens === 'issues') return deps
    return []
  }, [activeLens, allDeployments, normalizedSearchFilter])

  const unhealthyDeployments = useMemo(
    () => filteredDeployments.filter(d => d.readyReplicas < d.replicas),
    [filteredDeployments],
  )

  const filteredServices = useMemo(() => {
    let svcs = allServices || []
    if (normalizedSearchFilter) {
      svcs = svcs.filter(s => s.name.toLowerCase().includes(normalizedSearchFilter) || s.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'network' || activeLens === 'all') return svcs
    return []
  }, [activeLens, allServices, normalizedSearchFilter])

  const filteredPVCs = useMemo(() => {
    let pvcs = allPVCs || []
    if (normalizedSearchFilter) {
      pvcs = pvcs.filter(p => p.name.toLowerCase().includes(normalizedSearchFilter) || p.namespace.toLowerCase().includes(normalizedSearchFilter))
    }
    if (activeLens === 'issues') pvcs = pvcs.filter(p => p.status !== 'Bound')
    if (activeLens === 'storage' || activeLens === 'all' || activeLens === 'issues') return pvcs
    return []
  }, [activeLens, allPVCs, normalizedSearchFilter])

  const namespaceResources = useMemo(() => {
    const podIssueCounts: Record<string, number> = {}
    const deploymentIssueCounts: Record<string, number> = {}
    podIssues.forEach(issue => {
      podIssueCounts[issue.namespace] = (podIssueCounts[issue.namespace] || 0) + 1
    })
    clusterDeploymentIssues.forEach(issue => {
      deploymentIssueCounts[issue.namespace] = (deploymentIssueCounts[issue.namespace] || 0) + 1
    })
    return { podIssueCounts, deploymentIssueCounts }
  }, [clusterDeploymentIssues, podIssues])

  const hasVisibleResourceData =
    filteredNodes.length > 0 ||
    filteredNamespaces.length > 0 ||
    filteredDeployments.length > 0 ||
    filteredServices.length > 0 ||
    filteredPVCs.length > 0

  const issueCounts = useMemo(() => {
    const nodes = (allNodes || []).filter(n => n.status !== 'Ready').length
    const deployments = (allDeployments || []).filter(d => d.readyReplicas < d.replicas).length
    const pods = podIssues.length
    const pvcs = (allPVCs || []).filter(p => p.status !== 'Bound').length
    return { nodes, deployments, pods, pvcs, total: nodes + deployments + pods + pvcs }
  }, [allDeployments, allNodes, allPVCs, podIssues])

  return {
    health,
    isLoading,
    eventsLoading,
    clusterEvents,
    podIssues,
    clusterDeploymentIssues,
    clusterGPUNodes,
    gpuByType,
    namespaces,
    filteredNodes,
    filteredNamespaces,
    filteredNamespaceStats,
    filteredPVCs,
    filteredServices,
    unhealthyDeployments,
    namespaceResources,
    hasVisibleResourceData,
    issueCounts,
  }
}
