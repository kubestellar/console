import { createPortal } from 'react-dom'
import { Cpu, Filter, RefreshCw, Server, ChevronDown } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { ClusterStatusDot, getClusterState } from '../../../ui/ClusterStatusBadge'

interface ClusterOption {
  name: string
  healthy: boolean
  reachable?: boolean
  nodeCount?: number
  errorType?: string
}

interface InferenceStatsProps {
  t: (key: string, options?: Record<string, unknown>) => string
  healthyComponents: number
  totalComponents: number
  stackHealth: string
  statusBadge: Record<string, string>
  availableClusters: ClusterOption[]
  localClusterFilter: string[]
  showClusterFilter: boolean
  setShowClusterFilter: (show: boolean) => void
  clusterFilterRef: React.RefObject<HTMLDivElement | null>
  clusterFilterBtnRef: React.RefObject<HTMLButtonElement | null>
  dropdownStyle: { top: number; left: number } | null
  toggleClusterFilter: (cluster: string) => void
  clearClusterFilter: () => void
  handleRefresh: () => void
  isRefreshing: boolean
}

export function InferenceStats({
  t,
  healthyComponents,
  totalComponents,
  stackHealth,
  statusBadge,
  availableClusters,
  localClusterFilter,
  showClusterFilter,
  setShowClusterFilter,
  clusterFilterRef,
  clusterFilterBtnRef,
  dropdownStyle,
  toggleClusterFilter,
  clearClusterFilter,
  handleRefresh,
  isRefreshing,
}: InferenceStatsProps) {
  return (
    <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
      <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
      <span className="text-sm font-medium text-foreground">llm-d Stack</span>
      <span
        className="text-xs text-muted-foreground cursor-default"
        title={`${healthyComponents} healthy components out of ${totalComponents} total`}
      >
        {healthyComponents}/{totalComponents} components
      </span>
      <span className={cn('text-xs px-1.5 py-0.5 rounded ml-auto', statusBadge[stackHealth] || statusBadge.unknown)}>
        {stackHealth}
      </span>
      {availableClusters.length >= 1 && (
        <div ref={clusterFilterRef} className="relative">
          <button
            ref={clusterFilterBtnRef}
            onClick={() => setShowClusterFilter(!showClusterFilter)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
              localClusterFilter.length > 0
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
            title="Filter by cluster"
          >
            <Filter className="w-3 h-3" />
            {localClusterFilter.length > 0 && (
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3" />
                {localClusterFilter.length}/{availableClusters.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showClusterFilter && dropdownStyle && createPortal(
            <div
              className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
              style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="p-1">
                <button
                  onClick={clearClusterFilter}
                  className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                    localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  All clusters
                </button>
                {availableClusters.map(cluster => {
                  const clusterState = getClusterState(
                    cluster.healthy,
                    cluster.reachable,
                    cluster.nodeCount,
                    undefined,
                    cluster.errorType,
                  )
                  const stateLabel = clusterState === 'healthy' ? '' :
                    clusterState === 'degraded' ? 'degraded' :
                      clusterState === 'unreachable-auth' ? 'needs auth' :
                        clusterState === 'unreachable-timeout' ? 'offline' :
                          'offline'
                  return (
                    <button
                      key={cluster.name}
                      onClick={() => toggleClusterFilter(cluster.name)}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                        localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                      title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                    >
                      <ClusterStatusDot state={clusterState} size="sm" />
                      <span className="flex-1 truncate">{cluster.name}</span>
                      {stateLabel && (
                        <span className="text-2xs text-muted-foreground shrink-0">{stateLabel}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="p-1 rounded hover:bg-secondary transition-colors"
        title={t('common.refresh')}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'text-purple-400 animate-spin' : 'text-muted-foreground'}`} />
      </button>
    </div>
  )
}
