import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { usePods } from '../../hooks/useMCP'
import { ClusterBadge } from '../ui/ClusterBadge'

interface TopPodsProps {
  config?: {
    cluster?: string
    namespace?: string
    sortBy?: 'restarts' | 'name'
    limit?: number
  }
}

export function TopPods({ config }: TopPodsProps) {
  const cluster = config?.cluster
  const namespace = config?.namespace
  const sortBy = config?.sortBy || 'restarts'
  const limit = config?.limit || 10

  const { pods, isLoading, error, refetch } = usePods(cluster, namespace, sortBy, limit)

  if (isLoading && pods.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && pods.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    )
  }

  // Find the max restarts for visual scaling
  const maxRestarts = Math.max(...pods.map(p => p.restarts), 1)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">
          Top Pods by {sortBy === 'restarts' ? 'Restarts' : 'Name'}
        </span>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Pods list */}
      {pods.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No pods found
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {pods.map((pod, index) => (
            <div
              key={`${pod.cluster}-${pod.namespace}-${pod.name}`}
              className="group p-2 rounded-lg bg-secondary/30 border border-border/50 hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                  <span className="text-sm font-medium text-white truncate" title={pod.name}>
                    {pod.name}
                  </span>
                </div>
                {pod.restarts > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle className={`w-3 h-3 ${
                      pod.restarts >= 10 ? 'text-red-400' :
                      pod.restarts >= 5 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`} />
                    <span className={`text-xs font-medium ${
                      pod.restarts >= 10 ? 'text-red-400' :
                      pod.restarts >= 5 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>
                      {pod.restarts}
                    </span>
                  </div>
                )}
                {pod.restarts === 0 && (
                  <span className="text-xs text-green-400 font-medium">0</span>
                )}
              </div>

              {/* Progress bar for restarts visualization */}
              {sortBy === 'restarts' && pod.restarts > 0 && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all duration-300 ${
                      pod.restarts >= 10 ? 'bg-red-500' :
                      pod.restarts >= 5 ? 'bg-orange-500' :
                      'bg-yellow-500'
                    }`}
                    style={{ width: `${(pod.restarts / maxRestarts) * 100}%` }}
                  />
                </div>
              )}

              {/* Cluster and namespace - prominent */}
              <div className="flex items-center gap-2 mt-1 mb-1">
                <ClusterBadge cluster={pod.cluster || 'default'} />
                <span className="text-xs text-muted-foreground truncate">{pod.namespace}</span>
              </div>

              {/* Details row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex-shrink-0">{pod.status}</span>
                <span className="flex-shrink-0">{pod.ready}</span>
                <span className="flex-shrink-0">{pod.age}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
