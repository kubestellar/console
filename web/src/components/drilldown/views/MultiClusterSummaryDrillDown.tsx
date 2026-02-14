import { useState, useMemo } from 'react'
import { Search, Server, Layers, Rocket, Box, Settings as SettingsIcon, AlertCircle, HardDrive, Cpu, Ship, Zap, CheckCircle, XCircle, AlertTriangle, Activity, Filter, ChevronRight } from 'lucide-react'
import { useClusterData } from '../../../hooks/useClusterData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import type { DrillDownViewType } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'

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
        getStatus: (item: { healthy?: boolean; status?: string }) => item.healthy ? 'healthy' : (item.status || 'unknown'),
      }
    case 'all-namespaces':
      return {
        icon: Layers,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'namespaces',
        nameKey: 'namespace',
        getStatus: () => 'active',
      }
    case 'all-deployments':
      return {
        icon: Rocket,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'deployments',
        nameKey: 'name',
        getStatus: (item: { readyReplicas?: number; replicas?: number }) =>
          item.readyReplicas === item.replicas ? 'healthy' : 'unhealthy',
      }
    case 'all-pods':
      return {
        icon: Box,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/20',
        dataKey: 'pods',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown',
      }
    case 'all-services':
      return {
        icon: Activity,
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/20',
        dataKey: 'services',
        nameKey: 'name',
        getStatus: () => 'active',
      }
    case 'all-nodes':
      return {
        icon: Server,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        dataKey: 'nodes',
        nameKey: 'name',
        getStatus: (item: { status?: string; ready?: boolean }) =>
          item.ready !== false && item.status !== 'NotReady' ? 'Ready' : 'NotReady',
      }
    case 'all-events':
      return {
        icon: Zap,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        dataKey: 'events',
        nameKey: 'reason',
        getStatus: (item: { type?: string }) => item.type || 'Normal',
      }
    case 'all-alerts':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'alerts',
        nameKey: 'name',
        getStatus: (item: { severity?: string; state?: string }) => item.severity || item.state || 'unknown',
      }
    case 'all-helm':
      return {
        icon: Ship,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'helmReleases',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown',
      }
    case 'all-operators':
      return {
        icon: SettingsIcon,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'operators',
        nameKey: 'name',
        getStatus: (item: { state?: string; phase?: string }) => item.state || item.phase || 'unknown',
      }
    case 'all-security':
      return {
        icon: AlertTriangle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'securityIssues',
        nameKey: 'pod',
        getStatus: (item: { severity?: string; type?: string }) => item.severity || item.type || 'warning',
      }
    case 'all-gpu':
      return {
        icon: Cpu,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'gpuNodes',
        nameKey: 'name',
        getStatus: (item: { available?: number }) => item.available && item.available > 0 ? 'available' : 'busy',
      }
    case 'all-storage':
      return {
        icon: HardDrive,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20',
        dataKey: 'pvcs',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown',
      }
    case 'all-jobs':
      return {
        icon: Activity,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'jobs',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown',
      }
    default:
      return {
        icon: Layers,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20',
        dataKey: 'items',
        nameKey: 'name',
        getStatus: () => 'unknown',
      }
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
  return { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-500/20' }
}

export function MultiClusterSummaryDrillDown({ data, viewType }: MultiClusterSummaryDrillDownProps) {
  const { t } = useTranslation()
  const { clusters, pods, deployments, events, helmReleases, operatorSubscriptions, securityIssues } = useClusterData()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  const {
    drillToCluster, drillToNamespace, drillToDeployment, drillToPod,
    drillToNode, drillToEvents, drillToHelm, drillToOperator
  } = useDrillDownActions()

  const filter = data.filter as string | undefined
  const config = getViewConfig(viewType)
  const Icon = config.icon

  // Get items based on view type
  const allItems = useMemo(() => {
    switch (viewType) {
      case 'all-clusters':
        return clusters.map(c => ({
          ...c,
          name: c.name,
          cluster: c.name,
          status: c.healthy ? 'healthy' : 'unhealthy',
        }))
      case 'all-namespaces':
        // Flatten namespaces across all clusters
        return clusters.flatMap(c =>
          (c.namespaces || []).map((ns: string) => ({
            namespace: ns,
            cluster: c.name,
            status: 'active',
          }))
        )
      case 'all-deployments':
        return deployments.map(d => ({
          ...d,
          status: d.readyReplicas === d.replicas ? 'healthy' : 'unhealthy',
        }))
      case 'all-pods':
        return pods.map(p => ({
          ...p,
          status: p.status || 'Unknown',
        }))
      case 'all-services':
        // Build services from deployments (rough approximation)
        return deployments.map(d => ({
          name: d.name,
          namespace: d.namespace,
          cluster: d.cluster || '',
          type: 'ClusterIP',
          status: 'active',
        }))
      case 'all-nodes':
        // Build nodes from cluster node counts
        return clusters.flatMap(c => {
          const nodeCount = c.nodeCount || 0
          return Array.from({ length: Math.min(nodeCount, 10) }, (_, i) => ({
            name: `node-${i + 1}`,
            cluster: c.name,
            status: c.healthy ? 'Ready' : 'NotReady',
            cpuCores: Math.round((c.cpuCores || 0) / Math.max(nodeCount, 1)),
            memoryGB: Math.round((c.memoryGB || 0) / Math.max(nodeCount, 1)),
          }))
        })
      case 'all-events':
        return events.map(e => ({
          ...e,
          status: e.type || 'Normal',
        }))
      case 'all-alerts':
        // Mock alerts from security issues and pod issues
        return pods
          .filter(p => p.status !== 'Running')
          .map(p => ({
            name: `Pod ${p.name} ${p.status}`,
            namespace: p.namespace,
            cluster: p.cluster || '',
            severity: p.status === 'Failed' ? 'critical' : 'warning',
            status: p.status,
          }))
      case 'all-helm':
        return helmReleases.map(h => ({
          ...h,
          status: h.status || 'deployed',
        }))
      case 'all-operators':
        return operatorSubscriptions.map(o => ({
          ...o,
          status: o.pendingUpgrade ? 'PendingUpgrade' : 'Running',
        }))
      case 'all-security':
        return securityIssues.map(s => ({
          ...s,
          name: s.name,
          status: s.severity || 'warning',
        }))
      case 'all-gpu':
        // GPU nodes - from clusters with GPU info
        return clusters
          .filter(c => c.nodeCount && c.nodeCount > 0)
          .map(c => ({
            name: `${c.name}-gpu-node`,
            cluster: c.name,
            gpuCount: 0, // Placeholder - actual GPU data would come from GPU nodes hook
            status: 'available',
          }))
      case 'all-storage':
        // Storage from clusters with storage info
        return clusters
          .filter(c => c.storageGB && c.storageGB > 0)
          .map(c => ({
            name: `pvc-${c.name}`,
            cluster: c.name,
            status: 'Bound',
            storageGB: c.storageGB,
          }))
      case 'all-jobs':
        // Jobs approximation from pods
        return pods
          .filter(p => p.status === 'Succeeded' || p.status === 'Failed')
          .slice(0, 20)
          .map(p => ({
            name: p.name,
            namespace: p.namespace,
            cluster: p.cluster || '',
            status: p.status || 'Running',
          }))
      default:
        return []
    }
  }, [viewType, clusters, pods, deployments, events, helmReleases, operatorSubscriptions, securityIssues])

  // Apply initial filter from data prop
  const preFilteredItems = useMemo(() => {
    if (!filter) return allItems
    return allItems.filter(item => {
      const status = config.getStatus(item as Record<string, unknown>)?.toLowerCase() || ''
      return status === filter.toLowerCase() ||
             (filter === 'issues' && !['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(status))
    })
  }, [allItems, filter, config])

  // Get unique statuses and clusters for filtering
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(preFilteredItems.map(item => config.getStatus(item as Record<string, unknown>)))
    return ['all', ...Array.from(statuses).filter(Boolean)]
  }, [preFilteredItems, config])

  const uniqueClusters = useMemo(() => {
    const clusterNames = new Set(preFilteredItems.map(item => (item as Record<string, string>).cluster).filter(Boolean))
    return ['all', ...Array.from(clusterNames)]
  }, [preFilteredItems])

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
      case 'all-helm':
        drillToHelm(cluster, namespace, name, item)
        break
      case 'all-operators':
        drillToOperator(cluster, namespace, name, item)
        break
      case 'all-security':
        drillToPod(cluster, namespace, (item.pod as string) || name, item)
        break
      default:
        // Generic fallback - try pod if nothing else matches
        if (namespace && name) {
          drillToPod(cluster, namespace, name, item)
        }
    }
  }

  // Summary stats
  const stats = useMemo(() => {
    const total = filteredItems.length
    const healthy = filteredItems.filter(item => {
      const status = config.getStatus(item as Record<string, unknown>)?.toLowerCase() || ''
      return ['running', 'healthy', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'].includes(status)
    }).length
    const issues = total - healthy

    return { total, healthy, issues }
  }, [filteredItems, config])

  return (
    <div className="space-y-6">
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
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-muted-foreground">Issues</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats.issues}</div>
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
            className="w-full pl-10 pr-4 py-2 bg-card/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
              className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          <div className="text-center py-8 text-muted-foreground">
            No items found
          </div>
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
