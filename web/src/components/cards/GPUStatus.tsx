import { useMemo } from 'react'
import { RefreshCw, Cpu, Activity } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'

interface GPUStatusProps {
  config?: Record<string, unknown>
}

export function GPUStatus({ config }: GPUStatusProps) {
  const cluster = config?.cluster as string | undefined
  const { nodes: rawNodes, isLoading, refetch } = useGPUNodes(cluster)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter nodes by global cluster selection
  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes
    return rawNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">GPU Status</span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-white font-medium">No GPU Data</p>
          <p className="text-sm text-muted-foreground">GPU metrics not available</p>
        </div>
      </div>
    )
  }

  // Calculate cluster-level stats
  const clusterStats = nodes.reduce((acc, node) => {
    if (!acc[node.cluster]) {
      acc[node.cluster] = { total: 0, used: 0, types: new Set<string>() }
    }
    acc[node.cluster].total += node.gpuCount
    acc[node.cluster].used += node.gpuAllocated
    acc[node.cluster].types.add(node.gpuType)
    return acc
  }, {} as Record<string, { total: number; used: number; types: Set<string> }>)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">GPU Status</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Cluster GPU status */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {Object.entries(clusterStats).map(([clusterName, stats]) => {
          const utilization = stats.total > 0 ? (stats.used / stats.total) * 100 : 0
          const gpuTypes = Array.from(stats.types).join(', ')

          return (
            <div
              key={clusterName}
              className="p-3 rounded-lg bg-secondary/30"
            >
              <div className="flex items-center justify-between mb-2">
                <ClusterBadge cluster={clusterName} size="sm" />
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  utilization > 80 ? 'bg-red-500/20 text-red-400' :
                  utilization > 50 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {utilization.toFixed(0)}% used
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>{gpuTypes}</span>
                <span>{stats.used}/{stats.total} GPUs</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    utilization > 80 ? 'bg-red-500' :
                    utilization > 50 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${utilization}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
