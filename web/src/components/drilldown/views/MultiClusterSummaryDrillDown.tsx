import { useMemo, useState } from 'react'
import { useAlerts } from '../../../hooks/useAlerts'
import { useCachedAllNodes, useCachedPVCs } from '../../../hooks/useCachedData'
import { useClusterData } from '../../../hooks/useClusterData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { formatTimeAgo } from '../../../lib/formatters'
import {
  AggregatedMetricsChart,
  computeSummaryStats,
  getViewConfig,
  MultiClusterFilters,
  MultiClusterItemsPanel,
  type MultiClusterSummaryDrillDownProps,
  type SummaryItem,
} from './multi-cluster-summary-drilldown'

export function MultiClusterSummaryDrillDown({ data, viewType }: MultiClusterSummaryDrillDownProps) {
  const {
    clusters,
    deduplicatedClusters,
    pods,
    podClusterErrors,
    deployments,
    events,
    warningEvents,
    helmReleases,
    operatorSubscriptions,
    securityIssues,
  } = useClusterData()
  const { deduplicatedAlerts } = useAlerts()
  const {
    nodes: rawCachedNodes,
    lastRefresh: nodesLastRefresh,
    isLoading: nodesIsLoading,
    isFailed: nodesIsFailed,
    isDemoFallback: nodesIsDemoFallback,
    clusterErrors: rawNodeClusterErrors,
  } = useCachedAllNodes()
  const { pvcs: cachedPVCs } = useCachedPVCs()

  const cachedNodes = rawCachedNodes || []
  const nodeClusterErrors = [...(rawNodeClusterErrors ?? [])]
  const expectedNodeCountFromClusters = (clusters || []).reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const expectedPodCountFromClusters = (clusters || []).reduce((sum, c) => sum + (c.podCount || 0), 0)
  const nodesDataAge = nodesLastRefresh ? new Date(nodesLastRefresh).toISOString() : null

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  const {
    drillToAlert,
    drillToCluster,
    drillToDeployment,
    drillToEvents,
    drillToHelm,
    drillToNamespace,
    drillToNode,
    drillToOperator,
    drillToPVC,
    drillToPod,
  } = useDrillDownActions()

  const filter = data.filter as string | undefined
  const config = getViewConfig(viewType)
  const Icon = config.icon

  const allItems = useMemo<SummaryItem[]>(() => {
    switch (viewType) {
      case 'all-clusters':
        return (deduplicatedClusters || clusters).map((c) => ({
          ...c,
          name: c.name,
          cluster: c.name,
          status: c.healthy ? 'healthy' : 'unhealthy',
        }))
      case 'all-namespaces':
        return clusters.flatMap((c) =>
          (c.namespaces || []).map((ns: string) => ({
            namespace: ns,
            cluster: c.name,
            status: 'active',
          })),
        )
      case 'all-deployments':
        return deployments.map((d) => ({
          ...d,
          status: d.readyReplicas === d.replicas ? 'healthy' : 'unhealthy',
        }))
      case 'all-pods':
        return pods.map((p) => ({ ...p, status: p.status || 'Unknown' }))
      case 'all-services':
        return deployments.map((d) => ({
          name: d.name,
          namespace: d.namespace,
          cluster: d.cluster || '',
          type: 'ClusterIP',
          status: 'active',
        }))
      case 'all-nodes':
        return cachedNodes.map((n) => ({
          name: n.name,
          cluster: n.cluster || '',
          status: n.status || 'Unknown',
          roles: n.roles,
          cpuCapacity: n.cpuCapacity,
          memoryCapacity: n.memoryCapacity,
          kubeletVersion: n.kubeletVersion,
          internalIP: n.internalIP,
        }))
      case 'all-events':
        return (filter === 'warning' ? warningEvents : events).map((e) => ({ ...e, status: e.type || 'Normal' }))
      case 'all-alerts':
        return (deduplicatedAlerts || []).map((a) => ({
          ...a,
          name: a.ruleName || a.message || a.id,
          namespace: a.namespace,
          cluster: a.cluster || '',
          severity: a.severity,
          status: a.status,
        }))
      case 'all-helm':
        return helmReleases.map((h) => ({ ...h, status: h.status || 'deployed' }))
      case 'all-operators':
        return operatorSubscriptions.map((o) => ({ ...o, status: o.pendingUpgrade ? 'PendingUpgrade' : 'Running' }))
      case 'all-security':
        return securityIssues.map((s) => ({ ...s, name: s.name, status: s.severity || 'warning' }))
      case 'all-gpu':
        return []
      case 'all-storage':
        return (cachedPVCs || []).map((pvc) => ({
          name: pvc.name,
          namespace: pvc.namespace,
          cluster: pvc.cluster || '',
          status: pvc.status || 'Unknown',
          capacity: pvc.capacity,
          storageClass: pvc.storageClass,
          accessModes: pvc.accessModes,
          volumeName: pvc.volumeName,
        }))
      case 'all-jobs':
        return pods
          .filter((p) => p.status === 'Succeeded' || p.status === 'Failed')
          .slice(0, 20)
          .map((p) => ({
            name: p.name,
            namespace: p.namespace,
            cluster: p.cluster || '',
            status: p.status || 'Running',
          }))
      default:
        return []
    }
  }, [
    viewType,
    deduplicatedClusters,
    clusters,
    deployments,
    pods,
    cachedNodes,
    filter,
    warningEvents,
    events,
    deduplicatedAlerts,
    helmReleases,
    operatorSubscriptions,
    securityIssues,
    cachedPVCs,
  ])

  const preFilteredItems = filter
    ? allItems.filter((item) => {
      const status = config.getStatus(item)?.toLowerCase() || ''
      return status === filter.toLowerCase() || (filter === 'issues' && !['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(status))
    })
    : allItems

  const uniqueStatuses = ['all', ...Array.from(new Set(preFilteredItems.map((item) => config.getStatus(item))).values()).filter(Boolean)]
  const uniqueClusters = ['all', ...Array.from(new Set(preFilteredItems.map((item) => item.cluster as string).filter(Boolean))).values()]

  const filteredItems = useMemo(() => {
    let result = preFilteredItems

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((item) => {
        const name = (item[config.nameKey] as string) || ''
        const cluster = (item.cluster as string) || ''
        const ns = (item.namespace as string) || ''
        return name.toLowerCase().includes(query) || cluster.toLowerCase().includes(query) || ns.toLowerCase().includes(query)
      })
    }

    if (statusFilter !== 'all') {
      result = result.filter((item) => (config.getStatus(item)?.toLowerCase() || '') === statusFilter.toLowerCase())
    }

    if (clusterFilter !== 'all') {
      result = result.filter((item) => (item.cluster as string) === clusterFilter)
    }

    return result
  }, [clusterFilter, config, preFilteredItems, searchQuery, statusFilter])

  const stats = computeSummaryStats(filteredItems, config.getStatus, {
    searchQuery,
    statusFilter,
    clusterFilter,
    viewType,
    expectedNodeCountFromClusters,
    expectedPodCountFromClusters,
  })

  const handleItemClick = (item: SummaryItem) => {
    const cluster = (item.cluster as string) || ''
    const namespace = (item.namespace as string) || ''
    const name = (item[config.nameKey] as string) || (item.name as string) || ''

    switch (viewType) {
      case 'all-clusters':
        drillToCluster(cluster, item)
        break
      case 'all-namespaces':
        drillToNamespace(cluster, namespace || name)
        break
      case 'all-deployments':
        drillToDeployment(cluster, namespace, name, item)
        break
      case 'all-pods':
        drillToPod(cluster, namespace, name, item)
        break
      case 'all-nodes':
      case 'all-gpu':
        drillToNode(cluster, name, item)
        break
      case 'all-events':
        drillToEvents(cluster, namespace, (item.involvedObject as string) || name)
        break
      case 'all-alerts':
        drillToAlert(cluster, namespace || undefined, name, item)
        break
      case 'all-helm':
        drillToHelm(cluster, namespace, name, item)
        break
      case 'all-operators':
        drillToOperator(cluster, namespace, name, item)
        break
      case 'all-security':
        drillToPod(cluster, namespace, (item.pod as string) || name, item)
        break
      case 'all-storage':
        drillToPVC(cluster, namespace, name, item)
        break
      default:
        if (namespace && name) {
          drillToPod(cluster, namespace, name, item)
        }
    }
  }

  return (
    <div className="space-y-6">
      {viewType === 'all-nodes' && (nodesDataAge || nodesIsDemoFallback) && (
        <div className="flex items-center justify-end gap-2">
          {nodesIsDemoFallback && !nodesIsLoading && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              Demo
            </span>
          )}
          {nodesDataAge && (
            <span className="text-2xs text-muted-foreground" title={new Date(nodesLastRefresh!).toLocaleString()}>
              Updated {formatTimeAgo(nodesDataAge)}
            </span>
          )}
        </div>
      )}

      <AggregatedMetricsChart iconClassName={config.color} Icon={Icon} stats={stats} viewType={viewType} />

      <MultiClusterFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        clusterFilter={clusterFilter}
        setClusterFilter={setClusterFilter}
        uniqueStatuses={uniqueStatuses}
        uniqueClusters={uniqueClusters}
        viewType={viewType}
      />

      <MultiClusterItemsPanel
        filteredItems={filteredItems}
        viewType={viewType}
        config={config}
        Icon={Icon}
        cachedNodesLength={cachedNodes.length}
        expectedNodeCountFromClusters={expectedNodeCountFromClusters}
        expectedPodCountFromClusters={expectedPodCountFromClusters}
        nodesIsLoading={nodesIsLoading}
        nodesIsFailed={nodesIsFailed}
        nodeClusterErrors={nodeClusterErrors}
        podClusterErrors={podClusterErrors || []}
        onItemClick={handleItemClick}
      />
    </div>
  )
}
