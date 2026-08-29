import { useTranslation } from 'react-i18next'
import { Server, Check, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { ClusterInfo } from '../../../hooks/mcp/types'

interface ClusterCheckboxListProps {
  availableClusters: string[]
  selectedClusters: string[]
  isAllClustersSelected: boolean
  clusterInfoMap: Record<string, ClusterInfo>
  selectAllClusters: () => void
  deselectAllClusters: () => void
  toggleCluster: (cluster: string) => void
  getClusterStatusTooltip: (clusterName: string) => string
}

export function ClusterCheckboxList({
  availableClusters,
  selectedClusters,
  isAllClustersSelected,
  clusterInfoMap,
  selectAllClusters,
  deselectAllClusters,
  toggleCluster,
  getClusterStatusTooltip,
}: ClusterCheckboxListProps) {
  const { t } = useTranslation()

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-foreground">{t('common:filters.clusters', 'Clusters')}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAllClusters}
            className="text-xs text-purple-400 hover:text-purple-300"
            aria-label={t('common:filters.selectAllInSection', { defaultValue: 'Select all clusters' })}
          >
            {t('common.all')}
          </button>
          <button
            onClick={deselectAllClusters}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label={t('common:filters.clearSection', { defaultValue: 'Clear clusters' })}
          >
            {t('common.none')}
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {availableClusters.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('common:filters.noClusters', 'No clusters available')}
          </p>
        ) : (
          availableClusters.map((cluster) => {
            const isSelected = isAllClustersSelected || selectedClusters.includes(cluster)
            const info = clusterInfoMap[cluster]
            const isHealthy = info?.healthy === true
            const statusTooltip = getClusterStatusTooltip(cluster)
            const isUnreachable = info
              ? (info.reachable === false ||
                  (!info.nodeCount || info.nodeCount === 0) ||
                  (info.errorType && ['timeout', 'network', 'certificate'].includes(info.errorType)))
              : false
            const isLoading = !info || (info.nodeCount === undefined && info.reachable === undefined)
            return (
              <button
                key={cluster}
                onClick={() => toggleCluster(cluster)}
                aria-pressed={isSelected}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                  isSelected
                    ? 'bg-purple-500/20 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
                title={statusTooltip}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                  isSelected
                    ? 'bg-purple-500 border-purple-500'
                    : 'border-muted-foreground'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                {isLoading ? (
                  <div className="w-3 h-3 border border-muted-foreground/50 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : isUnreachable ? (
                  <WifiOff className="w-3 h-3 text-yellow-400 shrink-0" />
                ) : isHealthy ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className={cn('text-sm truncate', isUnreachable ? 'text-yellow-400' : !isHealthy && !isLoading && 'text-red-400')}>{cluster}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
