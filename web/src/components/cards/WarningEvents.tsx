import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Server, ChevronDown } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

export function WarningEvents() {
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
    storageKey: 'warning-events',
  })

  const warningEvents = useMemo(() => {
    let result = filterByCluster(events).filter(e => e.type === 'Warning')
    if (localClusterFilter.length > 0) {
      result = result.filter(e => e.cluster && localClusterFilter.includes(e.cluster))
    }
    return result
  }, [events, filterByCluster, localClusterFilter])

  const { paginatedItems, currentPage, totalPages, goToPage, needsPagination, itemsPerPage, setPerPage } = usePagination(warningEvents, 5)

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {warningEvents.length} warning{warningEvents.length !== 1 ? 's' : ''}
        </span>
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

      {/* Warning events list */}
      {warningEvents.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />
          <p className="text-sm text-muted-foreground">No warnings</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedItems.map((event, i) => (
            <div
              key={`${event.object}-${event.reason}-${i}`}
              className="p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">
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
                    <span className="text-xs text-muted-foreground ml-auto">{getTimeAgo(event.lastSeen)}</span>
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
          totalItems={warningEvents.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setPerPage}
        />
      )}
    </div>
  )
}
