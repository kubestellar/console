import { useState, useMemo } from 'react'
import { Server, CheckCircle, AlertTriangle, XCircle, RefreshCw, Cpu } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardControls, SortDirection } from '../ui/CardControls'

type SortByOption = 'status' | 'name' | 'nodes' | 'pods'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'nodes' as const, label: 'Nodes' },
  { value: 'pods' as const, label: 'Pods' },
]

export function ClusterHealth() {
  const { clusters: rawClusters, isLoading, error, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCluster } = useDrillDownActions()
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

  // Sort and limit clusters
  const clusters = useMemo(() => {
    const sorted = [...rawClusters].sort((a, b) => {
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
  }, [rawClusters, sortBy, sortDirection, limit])

  const healthyClusters = rawClusters.filter((c) => c.healthy).length
  const unhealthyClusters = rawClusters.filter((c) => !c.healthy).length
  const totalNodes = rawClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalCPUs = rawClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalPods = rawClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">
            {rawClusters.length} Clusters
          </span>
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
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Healthy</span>
          </div>
          <span className="text-2xl font-bold text-white">{healthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">Unhealthy</span>
          </div>
          <span className="text-2xl font-bold text-white">{unhealthyClusters}</span>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusters.map((cluster) => (
          <div
            key={cluster.name}
            className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
            onClick={() => drillToCluster(cluster.name, {
              healthy: cluster.healthy,
              nodeCount: cluster.nodeCount,
              podCount: cluster.podCount,
              server: cluster.server,
            })}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  cluster.healthy ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-white">{cluster.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{cluster.nodeCount || 0} nodes</span>
              {(cluster.cpuCores || 0) > 0 && (
                <span>{cluster.cpuCores} CPUs</span>
              )}
              <span>{cluster.podCount || 0} pods</span>
              {(gpuByCluster[cluster.name] || 0) > 0 && (
                <span className="flex items-center gap-1 text-purple-400">
                  <Cpu className="w-3 h-3" />
                  {gpuByCluster[cluster.name]} GPUs
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer totals */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{totalNodes} total nodes</span>
        {totalCPUs > 0 && <span>{totalCPUs} CPUs</span>}
        {totalGPUs > 0 && (
          <span className="flex items-center gap-1 text-purple-400">
            <Cpu className="w-3 h-3" />
            {totalGPUs} GPUs
          </span>
        )}
        <span>{totalPods} total pods</span>
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}
