import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Activity, Server, ChevronDown, AlertCircle } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

export function EventSummary() {
  const { t } = useTranslation()
  const {
    events,
    isLoading,
    isRefreshing,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedEvents(undefined, undefined, { limit: 100, category: 'realtime' })
  const { filterByCluster } = useGlobalFilters()

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: events.length > 0,
    isFailed: isFailed && events.length === 0,
    consecutiveFailures,
  })

  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'event-summary',
  })

  const filteredEvents = useMemo(() => {
    let result = filterByCluster(events)
    if (localClusterFilter.length > 0) {
      result = result.filter(e => e.cluster && localClusterFilter.includes(e.cluster))
    }
    return result
  }, [events, filterByCluster, localClusterFilter])

  const summary = useMemo(() => {
    const warnings = filteredEvents.filter(e => e.type === 'Warning').length
    const normal = filteredEvents.filter(e => e.type === 'Normal').length

    const reasonCounts: Record<string, number> = {}
    filteredEvents.forEach(e => {
      reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1
    })
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const clusterCounts: Record<string, number> = {}
    filteredEvents.forEach(e => {
      if (e.cluster) {
        const name = e.cluster.split('/').pop() || e.cluster
        clusterCounts[name] = (clusterCounts[name] || 0) + 1
      }
    })
    const topClusters = Object.entries(clusterCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { warnings, normal, topReasons, topClusters }
  }, [filteredEvents])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No events</p>
        <p className="text-xs mt-1">Cluster events will appear here</p>
      </div>
    )
  }

  const total = filteredEvents.length

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {total} event{total !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          {/* Cluster filter */}
          {availableClusters.length > 1 && (
            <div className="relative" ref={clusterFilterRef}>
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 transition-colors"
              >
                <Server className="w-3 h-3" />
                {localClusterFilter.length > 0 ? `${localClusterFilter.length} cluster${localClusterFilter.length > 1 ? 's' : ''}` : 'All'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showClusterFilter && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px]">
                  <button onClick={clearClusterFilter} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary text-muted-foreground">
                    All Clusters
                  </button>
                  {availableClusters.map(cluster => (
                    <button
                      key={cluster.name}
                      onClick={() => toggleClusterFilter(cluster.name)}
                      className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary ${localClusterFilter.includes(cluster.name) ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                    >
                      {localClusterFilter.includes(cluster.name) ? '✓ ' : ''}{cluster.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <RefreshButton
            isRefreshing={isRefreshing}
            onRefresh={refetch}
            lastRefresh={lastRefresh ?? undefined}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
          />
        </div>
      </div>

      {/* Error Display */}
      {isFailed && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-400">Error loading events</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Failed to fetch event data ({consecutiveFailures} attempts)</p>
          </div>
        </div>
      )}

      {/* Type breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <div>
            <div className="text-lg font-bold text-yellow-400">{summary.warnings}</div>
            <div className="text-xs text-muted-foreground">Warnings</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <div>
            <div className="text-lg font-bold text-green-400">{summary.normal}</div>
            <div className="text-xs text-muted-foreground">{t('common.normal')}</div>
          </div>
        </div>
      </div>

      {/* Top reasons */}
      {summary.topReasons.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Top Reasons</div>
          <div className="space-y-1">
            {summary.topReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate mr-2">{reason}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-500"
                      style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster distribution */}
      {summary.topClusters.length > 1 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">By Cluster</div>
          <div className="space-y-1">
            {summary.topClusters.map(([cluster, count]) => (
              <div key={cluster} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate mr-2">{cluster}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="text-center py-4">
          <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No events</p>
        </div>
      )}
    </div>
  )
}
