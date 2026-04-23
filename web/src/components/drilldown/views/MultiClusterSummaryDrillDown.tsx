import { useState, useMemo } from 'react'
import { Search, Server, Layers, Rocket, Box, Settings as SettingsIcon, AlertCircle, HardDrive, Cpu, Ship, Zap, CheckCircle, XCircle, AlertTriangle, Activity, Filter, ChevronRight } from 'lucide-react'
import { useClusterData } from '../../../hooks/useClusterData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import type { DrillDownViewType } from '../../../hooks/useDrillDown'
import { useCachedAllNodes, useCachedPVCs } from '../../../hooks/useCachedData'
import { useAlerts } from '../../../hooks/useAlerts'
import { useTranslation } from 'react-i18next'
import { formatRelativeTime } from '../../../lib/formatters'

interface MultiClusterSummaryDrillDownProps {
  data: Record<string, unknown>
  viewType: DrillDownViewType
}

// Get configuration for each summary view type
function getViewConfig(viewType: DrillDownViewType) {
  switch (viewType) {
    case 'all-clusters':
      return {
        icon: Server,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'clusters',
        nameKey: 'name',
        getStatus: (item: { healthy?: boolean; status?: string }) => item.healthy ? 'healthy' : (item.status || 'unknown') }
    case 'all-namespaces':
      return {
        icon: Layers,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'namespaces',
        nameKey: 'namespace',
        getStatus: () => 'active' }
    case 'all-deployments':
      return {
        icon: Rocket,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'deployments',
        nameKey: 'name',
        getStatus: (item: { readyReplicas?: number; replicas?: number }) =>
          item.readyReplicas === item.replicas ? 'healthy' : 'unhealthy' }
    case 'all-pods':
      return {
        icon: Box,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/20',
        dataKey: 'pods',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown' }
    case 'all-services':
      return {
        icon: Activity,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'services',
        nameKey: 'name',
        getStatus: () => 'active' }
    case 'all-nodes':
      return {
        icon: Server,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        dataKey: 'nodes',
        nameKey: 'name',
        getStatus: (item: { status?: string; ready?: boolean }) =>
          item.ready !== false && item.status !== 'NotReady' ? 'Ready' : 'NotReady' }
    case 'all-events':
      return {
        icon: Zap,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'events',
        nameKey: 'reason',
        getStatus: (item: { type?: string }) => item.type || 'Normal' }
    case 'all-alerts':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'alerts',
        nameKey: 'name',
        // Issue 8844 — The alerts drill-down is opened with filter='firing' or
        // filter='resolved' from the Alerts dashboard stat blocks. Those
        // filters are compared against this getStatus() result, so it must
        // return the alert's lifecycle status (firing | resolved), not its
        // severity. Otherwise the preFilter drops every item and the
        // drill-down list appears empty even though the stat block shows a
        // non-zero count.
        getStatus: (item: { status?: string; severity?: string; state?: string }) =>
          item.status || item.severity || item.state || 'unknown' }
    case 'all-helm':
      return {
        icon: Ship,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'helmReleases',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown' }
    case 'all-operators':
      return {
        icon: SettingsIcon,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'operators',
        nameKey: 'name',
        getStatus: (item: { state?: string; phase?: string }) => item.state || item.phase || 'unknown' }
    case 'all-security':
      return {
        icon: AlertTriangle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'securityIssues',
        nameKey: 'pod',
        getStatus: (item: { severity?: string; type?: string }) => item.severity || item.type || 'warning' }
    case 'all-gpu':
      return {
        icon: Cpu,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'gpuNodes',
        nameKey: 'name',
        getStatus: (item: { available?: number }) => item.available && item.available > 0 ? 'available' : 'busy' }
    case 'all-storage':
      return {
        icon: HardDrive,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'pvcs',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown' }
    case 'all-jobs':
      return {
        icon: Activity,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'jobs',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown' }
    default:
      return {
        icon: Layers,
        color: 'text-muted-foreground',
        bgColor: 'bg-secondary',
        dataKey: 'items',
        nameKey: 'name',
        getStatus: () => 'unknown' }
  }
}

// Get status badge styling
function getStatusBadge(status: string) {
  const lower = status?.toLowerCase() || ''
  if (['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(lower)) {
    return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' }
  }
  if (['pending', 'progressing', 'waiting', 'busy', 'warning'].includes(lower)) {
    return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
  }
  if (['failed', 'error', 'unhealthy', 'notready', 'critical', 'crashloopbackoff', 'imagepullbackoff'].includes(lower)) {
    return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' }
  }
  return { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-secondary' }
}

export function MultiClusterSummaryDrillDown({ data, viewType }: MultiClusterSummaryDrillDownProps) {
  const { t } = useTranslation()
  const {
    clusters,
    deduplicatedClusters,
    pods,
    // Per-cluster errors emitted by the pods SSE stream (Issue 9353). Used
    // below to render an RBAC- vs transient-failure-aware warning when
    // the all-pods drill-down list is empty but the cluster summary
    // reports a non-zero pod count.
    podClusterErrors,
    deployments,
    events,
    helmReleases,
    operatorSubscriptions,
    securityIssues,
  } = useClusterData()
  // Issue 8844 — The all-alerts drill-down must read from the same AlertsContext
  // source that powers the Alerts dashboard stat blocks (firing / resolved
  // counts). Sourcing alerts from pods (non-Running pods were used as a
  // synthetic stand-in) diverged from the stat counts: the "Resolved" block
  // could show e.g. 18 while the drill-down list was always empty because
  // synthetic pod-alerts never carry status='resolved'. Using the real
  // alerts list here keeps the count and the list in lock-step.
  const { alerts: contextAlerts } = useAlerts()
  // Use useCachedAllNodes (not useCachedNodes) for the cumulative,
  // cross-cluster drill-down list so the UI never substitutes four
  // hard-coded demo nodes for a real-but-empty live result (Issue 8840).
  // useCachedNodes() without a cluster has demoWhenEmpty=true, which made
  // the landing-dashboard Nodes stat block drill-down masquerade demo data
  // as real. The per-cluster drill-down always passed a cluster name, so
  // it bypassed that fallback — that's why it worked. useCachedAllNodes
  // additionally iterates DeduplicatedClusters() to avoid double-counting
  // nodes when multiple contexts point to the same API server.
  const {
    nodes: rawCachedNodes,
    lastRefresh: nodesLastRefresh,
    isLoading: nodesIsLoading,
    isFailed: nodesIsFailed,
    isDemoFallback: nodesIsDemoFallback,
    // Per-cluster errors emitted by the cross-cluster nodes REST fan-out
    // (Issue 9355). Used below to render an RBAC- vs transient-failure-aware
    // warning when the all-nodes drill-down list is empty but the cluster
    // summary reports a non-zero node count. Guarded against undefined to
    // keep older test mocks and mid-upgrade hook shapes crash-safe (see
    // MEMORY.md: "ALWAYS guard `.join()` and `for...of` against undefined").
    clusterErrors: rawNodeClusterErrors,
  } = useCachedAllNodes()
  const nodeClusterErrors = rawNodeClusterErrors || []
  const { pvcs: cachedPVCs } = useCachedPVCs()
  // Guard against undefined to prevent crashes when APIs return 404/500/empty
  const cachedNodes = rawCachedNodes || []
  // For the all-nodes view: the overview stat block sums cluster.nodeCount,
  // but the detail list is fetched from a separate endpoint that may return
  // empty when the caller lacks list-nodes RBAC on some clusters (#8312).
  // Track the expected count so we can explain the discrepancy instead of
  // showing a blank "No items found".
  const expectedNodeCountFromClusters = (clusters || []).reduce(
    (sum, c) => sum + (c.nodeCount || 0),
    0,
  )
  // The same pattern applies to all-pods: the overview stat sums
  // cluster.podCount (from the cluster summary) while the detail list is
  // fetched via useAllPods() which can return empty on RBAC / network
  // failures, so the drill-down "Total" showed 0 while the parent stat
  // block showed e.g. 28 (#8380).
  const expectedPodCountFromClusters = (clusters || []).reduce(
    (sum, c) => sum + (c.podCount || 0),
    0,
  )
  // Convert epoch ms to ISO string for the freshness indicator
  const nodesDataAge = (() => {
    if (!nodesLastRefresh) return null
    return new Date(nodesLastRefresh).toISOString()
  })()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  const {
    drillToCluster, drillToNamespace, drillToDeployment, drillToPod,
    drillToNode, drillToEvents, drillToHelm, drillToOperator, drillToPVC,
    drillToAlert
  } = useDrillDownActions()

  const filter = data.filter as string | undefined
  const config = getViewConfig(viewType)
  const Icon = config.icon

  // Get items based on view type
  const allItems = useMemo(() => {
    switch (viewType) {
      case 'all-clusters':
        // Use deduplicated clusters to avoid showing duplicate contexts for the same server
        return (deduplicatedClusters || clusters).map(c => ({
          ...c,
          name: c.name,
          cluster: c.name,
          status: c.healthy ? 'healthy' : 'unhealthy' }))
      case 'all-namespaces':
        // Flatten namespaces across all clusters
        return clusters.flatMap(c =>
          (c.namespaces || []).map((ns: string) => ({
            namespace: ns,
            cluster: c.name,
            status: 'active' }))
        )
      case 'all-deployments':
        return deployments.map(d => ({
          ...d,
          status: d.readyReplicas === d.replicas ? 'healthy' : 'unhealthy' }))
      case 'all-pods':
        return pods.map(p => ({
          ...p,
          status: p.status || 'Unknown' }))
      case 'all-services':
        // Build services from deployments (rough approximation)
        return deployments.map(d => ({
          name: d.name,
          namespace: d.namespace,
          cluster: d.cluster || '',
          type: 'ClusterIP',
          status: 'active' }))
      case 'all-nodes':
        // Use real node data from the cached nodes hook (#7352)
        // Never fabricate synthetic nodes — show empty state until real data loads
        return cachedNodes.map(n => ({
          name: n.name,
          cluster: n.cluster || '',
          status: n.status || 'Unknown',
          roles: n.roles,
          cpuCapacity: n.cpuCapacity,
          memoryCapacity: n.memoryCapacity,
          kubeletVersion: n.kubeletVersion,
          internalIP: n.internalIP }))
      case 'all-events':
        return events.map(e => ({
          ...e,
          status: e.type || 'Normal' }))
      case 'all-alerts':
        // Issue 8844 — Use real alerts from AlertsContext so the drill-down list
        // matches the Alerts dashboard stat blocks (firing / resolved). The
        // previous implementation synthesized "alerts" from non-Running
        // pods, which never produced status='resolved' items and left the
        // Resolved drill-down permanently empty regardless of the count.
        return (contextAlerts || []).map(a => ({
          ...a,
          name: a.ruleName || a.message || a.id,
          namespace: a.namespace,
          cluster: a.cluster || '',
          severity: a.severity,
          status: a.status }))
      case 'all-helm':
        return helmReleases.map(h => ({
          ...h,
          status: h.status || 'deployed' }))
      case 'all-operators':
        return operatorSubscriptions.map(o => ({
          ...o,
          status: o.pendingUpgrade ? 'PendingUpgrade' : 'Running' }))
      case 'all-security':
        return securityIssues.map(s => ({
          ...s,
          name: s.name,
          status: s.severity || 'warning' }))
      case 'all-gpu':
        // GPU nodes — return empty until real data from GPU nodes hook is available (#7353)
        // Previously fabricated placeholder entries with gpuCount: 0 that were misleading
        return []
      case 'all-storage':
        // Use real PVC data from useCachedPVCs (#6813)
        return (cachedPVCs || []).map(pvc => ({
          name: pvc.name,
          namespace: pvc.namespace,
          cluster: pvc.cluster || '',
          status: pvc.status || 'Unknown',
          capacity: pvc.capacity,
          storageClass: pvc.storageClass,
          accessModes: pvc.accessModes,
          volumeName: pvc.volumeName }))
      case 'all-jobs':
        // Jobs approximation from pods
        return pods
          .filter(p => p.status === 'Succeeded' || p.status === 'Failed')
          .slice(0, 20)
          .map(p => ({
            name: p.name,
            namespace: p.namespace,
            cluster: p.cluster || '',
            status: p.status || 'Running' }))
      default:
        return []
    }
  }, [viewType, clusters, deduplicatedClusters, pods, deployments, events, helmReleases, operatorSubscriptions, securityIssues, cachedNodes, cachedPVCs, contextAlerts])

  // Apply initial filter from data prop
  const preFilteredItems = (() => {
    if (!filter) return allItems
    return allItems.filter(item => {
      const status = config.getStatus(item as Record<string, unknown>)?.toLowerCase() || ''
      return status === filter.toLowerCase() ||
             (filter === 'issues' && !['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(status))
    })
  })()

  // Get unique statuses and clusters for filtering
  const uniqueStatuses = (() => {
    const statuses = new Set(preFilteredItems.map(item => config.getStatus(item as Record<string, unknown>)))
    return ['all', ...Array.from(statuses).filter(Boolean)]
  })()

  const uniqueClusters = (() => {
    const clusterNames = new Set(preFilteredItems.map(item => (item as Record<string, string>).cluster).filter(Boolean))
    return ['all', ...Array.from(clusterNames)]
  })()

  // Filter items
  const filteredItems = useMemo(() => {
    let result = preFilteredItems

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item => {
        const name = ((item as Record<string, unknown>)[config.nameKey] as string) || ''
        const cluster = ((item as Record<string, unknown>).cluster as string) || ''
        const ns = ((item as Record<string, unknown>).namespace as string) || ''
        return name.toLowerCase().includes(query) ||
               cluster.toLowerCase().includes(query) ||
               ns.toLowerCase().includes(query)
      })
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(item => {
        const status = config.getStatus(item as Record<string, unknown>)?.toLowerCase() || ''
        return status === statusFilter.toLowerCase()
      })
    }

    // Apply cluster filter
    if (clusterFilter !== 'all') {
      result = result.filter(item =>
        ((item as Record<string, unknown>).cluster as string) === clusterFilter
      )
    }

    return result
  }, [preFilteredItems, searchQuery, statusFilter, clusterFilter, config])

  // Handle item click - navigate to appropriate single-resource view
  const handleItemClick = (item: Record<string, unknown>) => {
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
        // Generic fallback - try pod if nothing else matches
        if (namespace && name) {
          drillToPod(cluster, namespace, name, item)
        }
    }
  }

  // Summary stats
  //
  // When the detail list is empty for all-nodes / all-pods but the per-cluster
  // summary says there are items, fall back to the summary count so the
  // drill-down "Total" tile agrees with the parent stat block (#8380).
  // The list below is still empty (and a warning is rendered separately),
  // but the Total number matches what the user saw on the dashboard tile,
  // which is the source-of-truth expectation.
  const stats = (() => {
    const listTotal = filteredItems.length
    const healthy = filteredItems.filter(item => {
      const status = config.getStatus(item as Record<string, unknown>)?.toLowerCase() || ''
      return ['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(status)
    }).length

    let total = listTotal
    if (listTotal === 0 && !searchQuery && statusFilter === 'all' && clusterFilter === 'all') {
      if (viewType === 'all-nodes' && expectedNodeCountFromClusters > 0) {
        total = expectedNodeCountFromClusters
      } else if (viewType === 'all-pods' && expectedPodCountFromClusters > 0) {
        total = expectedPodCountFromClusters
      }
    }
    // If we fell back to the summary count, we can't classify healthy vs
    // issues (we don't have per-item statuses), so treat them as unknown.
    const issues = total - healthy

    return { total, healthy, issues }
  })()

  return (
    <div className="space-y-6">
      {/* Freshness indicator for cached data */}
      {viewType === 'all-nodes' && (nodesDataAge || nodesIsDemoFallback) && (
        <div className="flex items-center justify-end gap-2">
          {nodesIsDemoFallback && !nodesIsLoading && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              Demo
            </span>
          )}
          {nodesDataAge && (
            <span className="text-2xs text-muted-foreground" title={new Date(nodesLastRefresh!).toLocaleString()}>
              Updated {formatRelativeTime(nodesDataAge)}
            </span>
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
            <span className="text-sm text-muted-foreground">{t('common.total')}</span>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="glass rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm text-muted-foreground">{t('common.healthy')}</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.healthy}</div>
        </div>
        <div className="glass rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-muted-foreground">Issues</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{stats.issues}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card/50 border border-border rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
          >
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>
                {status === 'all' ? 'All Statuses' : status}
              </option>
            ))}
          </select>
        </div>

        {/* Cluster Filter */}
        {viewType !== 'all-clusters' && uniqueClusters.length > 2 && (
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <select
              value={clusterFilter}
              onChange={e => setClusterFilter(e.target.value)}
              className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            >
              {uniqueClusters.map(cluster => (
                <option key={cluster} value={cluster}>
                  {cluster === 'all' ? 'All Clusters' : cluster.split('/').pop()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          viewType === 'all-nodes' && nodesIsLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading node details…
            </div>
          ) : viewType === 'all-nodes' &&
            cachedNodes.length === 0 &&
            expectedNodeCountFromClusters > 0 ? (
            <div className="glass rounded-lg p-6 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">
                    Cluster summary reports {expectedNodeCountFromClusters} node
                    {expectedNodeCountFromClusters === 1 ? '' : 's'}, but the
                    detailed list is empty.
                  </div>
                  {/*
                    Per-cluster error breakdown (Issue 9355). When the
                    `useCachedAllNodes` fan-out captures per-cluster
                    `/api/mcp/nodes` failures we show a typed list so the
                    user can see which clusters were denied by RBAC (auth)
                    vs. which failed transiently (timeout / network /
                    unknown). Without this block the warning conflated
                    every failure mode into a single message.
                  */}
                  {nodeClusterErrors.length > 0 ? (
                    <>
                      <div className="text-muted-foreground mt-1">
                        The nodes endpoint returned an error for
                        {' '}
                        {nodeClusterErrors.length}
                        {' '}
                        cluster{nodeClusterErrors.length === 1 ? '' : 's'}:
                      </div>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {nodeClusterErrors.map(err => {
                          const isAuth = err.errorType === 'auth'
                          const isTimeout = err.errorType === 'timeout'
                          const kindLabel = isAuth
                            ? 'RBAC denied (list-nodes)'
                            : isTimeout
                              ? 'Transient timeout'
                              : `Endpoint failure (${err.errorType})`
                          return (
                            <li key={`${err.cluster}-${err.errorType}`} className="flex items-start gap-2">
                              <Server className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>
                                <span className="font-mono">{err.cluster.split('/').pop()}</span>
                                {' — '}
                                <span className={isAuth ? 'text-red-400' : 'text-yellow-400'}>
                                  {kindLabel}
                                </span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  ) : (
                    <div className="text-muted-foreground mt-1">
                      {nodesIsFailed
                        ? 'The node list endpoint is currently unreachable.'
                        : 'This usually means the current user lacks list-nodes RBAC on one or more clusters, so the detail view can\'t enumerate nodes even though the per-cluster summary includes their count.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : viewType === 'all-pods' &&
            expectedPodCountFromClusters > 0 ? (
            <div className="glass rounded-lg p-6 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">
                    Cluster summary reports {expectedPodCountFromClusters} pod
                    {expectedPodCountFromClusters === 1 ? '' : 's'}, but the
                    detailed list is empty.
                  </div>
                  {/*
                    Per-cluster error breakdown (Issue 9353). When the backend
                    emits `cluster_error` SSE events we show a typed list
                    so the user can see which clusters were denied by
                    RBAC (auth) vs. which failed transiently (timeout /
                    network / unknown). Without this block the warning
                    conflated every failure mode into a single message.
                  */}
                  {podClusterErrors.length > 0 ? (
                    <>
                      <div className="text-muted-foreground mt-1">
                        The pods endpoint returned an error for
                        {' '}
                        {podClusterErrors.length}
                        {' '}
                        cluster{podClusterErrors.length === 1 ? '' : 's'}:
                      </div>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {podClusterErrors.map(err => {
                          const isAuth = err.errorType === 'auth'
                          const isTimeout = err.errorType === 'timeout'
                          const kindLabel = isAuth
                            ? 'RBAC denied (list-pods)'
                            : isTimeout
                              ? 'Transient timeout'
                              : `Endpoint failure (${err.errorType})`
                          return (
                            <li key={`${err.cluster}-${err.errorType}`} className="flex items-start gap-2">
                              <Server className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>
                                <span className="font-mono">{err.cluster.split('/').pop()}</span>
                                {' — '}
                                <span className={isAuth ? 'text-red-400' : 'text-yellow-400'}>
                                  {kindLabel}
                                </span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  ) : (
                    <div className="text-muted-foreground mt-1">
                      This usually means the current user lacks list-pods RBAC on one or more clusters, or the pods endpoint is temporarily unreachable — the per-cluster summary includes the count but the detail view can&apos;t enumerate individual pods.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No items found
            </div>
          )
        ) : (
          filteredItems.slice(0, 100).map((item, idx) => {
            const name = (item as Record<string, unknown>)[config.nameKey] as string || (item as Record<string, unknown>).name as string || 'Unknown'
            const cluster = (item as Record<string, unknown>).cluster as string || ''
            const namespace = (item as Record<string, unknown>).namespace as string
            const status = config.getStatus(item as Record<string, unknown>)
            const statusBadge = getStatusBadge(status)
            const StatusIcon = statusBadge.icon

            return (
              <button
                key={`${cluster}-${namespace}-${name}-${idx}`}
                onClick={() => handleItemClick(item as Record<string, unknown>)}
                className="w-full flex items-center justify-between p-3 glass rounded-lg hover:bg-card/70 transition-colors text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg ${config.bgColor}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {cluster && (
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          {cluster.split('/').pop()}
                        </span>
                      )}
                      {namespace && (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {namespace}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${statusBadge.bg} ${statusBadge.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            )
          })
        )}
        {filteredItems.length > 100 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Showing 100 of {filteredItems.length} items. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  )
}
