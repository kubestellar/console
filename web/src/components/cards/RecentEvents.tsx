import { useMemo } from 'react'
import { Clock, AlertTriangle, CheckCircle2, Activity, Server, ChevronDown } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'

const ONE_HOUR_MS = 60 * 60 * 1000

function getMinutesAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  return `${Math.floor(diffMins / 60)}h ago`
}

export function RecentEvents() {
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

  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'recent-events',
  })

  const recentEvents = useMemo(() => {
    const cutoff = Date.now() - ONE_HOUR_MS
    let result = filterByCluster(events).filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= cutoff
    })
    if (localClusterFilter.length > 0) {
      result = result.filter(e => e.cluster && localClusterFilter.includes(e.cluster))
    }
    return result
  }, [events, filterByCluster, localClusterFilter])

  const { paginatedItems, currentPage, totalPages, goToPage, needsPagination, itemsPerPage, setPerPage } = usePagination(recentEvents, 5)

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const warningCount = recentEvents.filter(e => e.type === 'Warning').length

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-muted-foreground">
            {recentEvents.length} event{recentEvents.length !== 1 ? 's' : ''} in last hour
            {warningCount > 0 && (
              <span className="text-yellow-400 ml-1">({warningCount} warning{warningCount !== 1 ? 's' : ''})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Recent events list */}
      {recentEvents.length === 0 ? (
        <div className="text-center py-6">
          <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No events in the last hour</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedItems.map((event, i) => (
            <div
              key={`${event.object}-${event.reason}-${i}`}
              className={`p-2 rounded-lg border ${
                event.type === 'Warning'
                  ? 'bg-yellow-500/5 border-yellow-500/20'
                  : 'bg-green-500/5 border-green-500/20'
              }`}
            >
              <div className="flex items-start gap-2">
                {event.type === 'Warning' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      event.type === 'Warning'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {event.reason}
                    </span>
                    <span className="text-xs text-foreground truncate">{event.object}</span>
                    {event.count > 1 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-card text-muted-foreground">
                        ×{event.count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{event.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{event.namespace}</span>
                    {event.cluster && (
                      <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{getMinutesAgo(event.lastSeen)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {needsPagination && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={recentEvents.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setPerPage}
        />
      )}
    </div>
  )
}
