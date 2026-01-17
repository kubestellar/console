import { useState, useMemo } from 'react'
import { Server, CheckCircle, XCircle, Cpu, RefreshCw } from 'lucide-react'
import { useClusters, useGPUNodes, ClusterInfo } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { ClusterStatusDot, getClusterState, ClusterState } from '../ui/ClusterStatusBadge'
import { classifyError } from '../../lib/errorClassifier'

type SortByOption = 'status' | 'name' | 'nodes' | 'pods'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'nodes' as const, label: 'Nodes' },
  { value: 'pods' as const, label: 'Pods' },
]

// Helper to get cluster state from ClusterInfo
function getClusterStateFromInfo(cluster: ClusterInfo): ClusterState {
  // If cluster has error info (from health check)
  if (cluster.errorType || cluster.errorMessage) {
    const classified = cluster.errorType
      ? { type: cluster.errorType }
      : classifyError(cluster.errorMessage || '')
    return getClusterState(false, false, cluster.nodeCount, undefined, classified.type)
  }

  // Check if healthy
  return getClusterState(cluster.healthy, true, cluster.nodeCount, cluster.nodeCount)
}

export function ClusterHealth() {
  const { clusters: rawClusters, isLoading, isRefreshing, lastUpdated, error, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCluster } = useDrillDownActions()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>('unlimited')

  // Calculate GPU counts per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Filter by global cluster selection, then sort and limit
  const clusters = useMemo(() => {
    // Apply global cluster filter
    const filtered = isAllClustersSelected
      ? rawClusters
      : rawClusters.filter(c => selectedClusters.includes(c.name))

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') {
        if (a.healthy !== b.healthy) result = a.healthy ? 1 : -1 // unhealthy first
        else result = a.name.localeCompare(b.name)
      } else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'nodes') result = (b.nodeCount || 0) - (a.nodeCount || 0)
      else if (sortBy === 'pods') result = (b.podCount || 0) - (a.podCount || 0)
      return sortDirection === 'asc' ? result : -result
    })
    if (limit === 'unlimited') return sorted
    return sorted.slice(0, limit)
  }, [rawClusters, sortBy, sortDirection, limit, selectedClusters, isAllClustersSelected])

  // Stats based on filtered clusters
  const filteredForStats = isAllClustersSelected
    ? rawClusters
    : rawClusters.filter(c => selectedClusters.includes(c.name))
  const healthyClusters = filteredForStats.filter((c) => c.healthy).length
  const unhealthyClusters = filteredForStats.filter((c) => !c.healthy).length
  const totalNodes = filteredForStats.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalCPUs = filteredForStats.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalPods = filteredForStats.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const filteredGPUNodes = isAllClustersSelected
    ? gpuNodes
    : gpuNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  const totalGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)

  // Show skeleton structure during loading to prevent layout shift
  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton variant="text" width={80} height={16} />
          </div>
          <Skeleton variant="rounded" width={120} height={28} />
        </div>
        {/* Stats skeleton */}
        <SkeletonStats className="mb-4" />
        {/* List skeleton */}
        <SkeletonList items={4} className="flex-1" />
        {/* Footer skeleton */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <Skeleton variant="text" width="60%" height={12} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span title="Kubernetes clusters"><Server className="w-4 h-4 text-purple-400" /></span>
          <span className="text-sm font-medium text-muted-foreground" title={`${rawClusters.length} total clusters configured`}>
            {rawClusters.length} Clusters
          </span>
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Refresh cluster health status"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20" title={`${healthyClusters} clusters are healthy and responding`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Healthy</span>
          </div>
          <span className="text-2xl font-bold text-white">{healthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20" title={`${unhealthyClusters} clusters have issues or are unreachable`}>
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">Unhealthy</span>
          </div>
          <span className="text-2xl font-bold text-white">{unhealthyClusters}</span>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusters.map((cluster) => {
          const clusterState = getClusterStateFromInfo(cluster)
          const statusTooltip = cluster.healthy
            ? `Cluster is healthy with ${cluster.nodeCount || 0} nodes`
            : cluster.errorMessage || 'Cluster has issues - click to view details'
          return (
            <div
              key={cluster.name}
              className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => drillToCluster(cluster.name, {
                healthy: cluster.healthy,
                nodeCount: cluster.nodeCount,
                podCount: cluster.podCount,
                server: cluster.server,
              })}
              title={`Click to view details for ${cluster.name}`}
            >
              <div className="flex items-center gap-2" title={statusTooltip}>
                <ClusterStatusDot state={clusterState} />
                <span className="text-sm text-white">{cluster.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span title={`${cluster.nodeCount || 0} worker nodes in cluster`}>{cluster.nodeCount || 0} nodes</span>
                {(cluster.cpuCores || 0) > 0 && (
                  <span title={`${cluster.cpuCores} total CPU cores available`}>{cluster.cpuCores} CPUs</span>
                )}
                <span title={`${cluster.podCount || 0} pods running in cluster`}>{cluster.podCount || 0} pods</span>
                {(gpuByCluster[cluster.name] || 0) > 0 && (
                  <span className="flex items-center gap-1 text-purple-400" title={`${gpuByCluster[cluster.name]} GPUs available for workloads`}>
                    <Cpu className="w-3 h-3" />
                    {gpuByCluster[cluster.name]} GPUs
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer totals */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span title="Total worker nodes across all filtered clusters">{totalNodes} total nodes</span>
        {totalCPUs > 0 && <span title="Total CPU cores across all filtered clusters">{totalCPUs} CPUs</span>}
        {totalGPUs > 0 && (
          <span className="flex items-center gap-1 text-purple-400" title="Total GPUs available across all filtered clusters">
            <Cpu className="w-3 h-3" />
            {totalGPUs} GPUs
          </span>
        )}
        <span title="Total pods running across all filtered clusters">{totalPods} total pods</span>
      </div>

      {error && (
        <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20" title="Check your kubeconfig and network connectivity">
          <div className="text-xs text-yellow-400">
            Unable to connect to clusters - showing demo data
          </div>
        </div>
      )}

      {/* Show unreachable clusters summary if any */}
      {!error && rawClusters.some(c => !c.healthy) && (
        <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/20" title="Click on individual clusters above to see specific issues">
          <div className="text-xs text-orange-400">
            {rawClusters.filter(c => !c.healthy).length} cluster(s) have issues
          </div>
        </div>
      )}
    </div>
  )
}
