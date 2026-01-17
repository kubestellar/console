import { Server, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'

export function ClusterHealth() {
  const { clusters, isLoading, error, refetch } = useClusters()
  const { drillToCluster } = useDrillDownActions()

  const healthyClusters = clusters.filter((c) => c.healthy).length
  const unhealthyClusters = clusters.filter((c) => !c.healthy).length
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)

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
            {clusters.length} Clusters
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
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
              <span>{cluster.podCount || 0} pods</span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer totals */}
      <div className="mt-4 pt-3 border-t border-border/50 flex justify-between text-xs text-muted-foreground">
        <span>{totalNodes} total nodes</span>
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
