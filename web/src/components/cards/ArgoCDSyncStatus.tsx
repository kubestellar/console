import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, RefreshCw, AlertTriangle, ExternalLink, AlertCircle, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'

interface ArgoCDSyncStatusProps {
  config?: Record<string, unknown>
}

// Mock sync status data
function getMockSyncStatusData(clusterCount: number) {
  return {
    synced: Math.floor(clusterCount * 4.2),
    outOfSync: Math.floor(clusterCount * 1.3),
    unknown: Math.floor(clusterCount * 0.3),
  }
}

export function ArgoCDSyncStatus({ config: _config }: ArgoCDSyncStatusProps) {
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,

    clusterFilterBtnRef,

    dropdownStyle,
  } = useChartFilters({
    storageKey: 'argocd-sync-status',
  })

  const filteredClusterCount = useMemo(() => {
    let count = isAllClustersSelected ? clusters.length : selectedClusters.length
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      count = localClusterFilter.length
    }
    return count
  }, [clusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const stats = useMemo(() => {
    return getMockSyncStatusData(filteredClusterCount)
  }, [filteredClusterCount])

  const total = stats.synced + stats.outOfSync + stats.unknown
  const syncedPercent = total > 0 ? (stats.synced / total) * 100 : 0
  const outOfSyncPercent = total > 0 ? (stats.outOfSync / total) * 100 : 0
  const showSkeleton = isLoading && total === 0

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={100} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={20} />
          <Skeleton variant="rounded" height={20} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-1">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
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
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && dropdownStyle && createPortal(
                <div className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
                  style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
                  onMouseDown={e => e.stopPropagation()}>
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>,
              document.body
              )}
            </div>
          )}

          <a
            href="https://argo-cd.readthedocs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="ArgoCD Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">ArgoCD Integration</p>
          <p className="text-muted-foreground">
            Install ArgoCD for GitOps-based sync.{' '}
            <a href="https://argo-cd.readthedocs.io/en/stable/getting_started/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Donut chart placeholder */}
      <div className="flex justify-center mb-4">
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-secondary"
            />
            {/* Synced segment */}
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${syncedPercent * 3.02} 302`}
              className="text-green-500"
            />
            {/* Out of sync segment */}
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${outOfSyncPercent * 3.02} 302`}
              strokeDashoffset={`${-syncedPercent * 3.02}`}
              className="text-yellow-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">Apps</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-foreground">Synced</span>
          </div>
          <span className="text-sm font-bold text-green-400">{stats.synced}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-500/10">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-foreground">Out of Sync</span>
          </div>
          <span className="text-sm font-bold text-yellow-400">{stats.outOfSync}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-foreground">Unknown</span>
          </div>
          <span className="text-sm font-bold text-gray-400">{stats.unknown}</span>
        </div>
      </div>
    </div>
  )
}
