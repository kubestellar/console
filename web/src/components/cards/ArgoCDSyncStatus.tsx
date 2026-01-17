import { useMemo } from 'react'
import { GitBranch, CheckCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'

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
  const { clusters, isLoading, refetch } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const filteredClusterCount = useMemo(() => {
    if (isAllClustersSelected) return clusters.length
    return selectedClusters.length
  }, [clusters, selectedClusters, isAllClustersSelected])

  const stats = useMemo(() => {
    return getMockSyncStatusData(filteredClusterCount)
  }, [filteredClusterCount])

  const total = stats.synced + stats.outOfSync + stats.unknown
  const syncedPercent = total > 0 ? (stats.synced / total) * 100 : 0
  const outOfSyncPercent = total > 0 ? (stats.outOfSync / total) * 100 : 0

  if (isLoading) {
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Sync Status</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
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
            <span className="text-xl font-bold text-white">{total}</span>
            <span className="text-xs text-muted-foreground">Apps</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-white">Synced</span>
          </div>
          <span className="text-sm font-bold text-green-400">{stats.synced}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-500/10">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-white">Out of Sync</span>
          </div>
          <span className="text-sm font-bold text-yellow-400">{stats.outOfSync}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-white">Unknown</span>
          </div>
          <span className="text-sm font-bold text-gray-400">{stats.unknown}</span>
        </div>
      </div>
    </div>
  )
}
