import { useMemo } from 'react'
import { Clock, AlertTriangle, CheckCircle2, Activity } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import type { ClusterEvent } from '../../lib/kubectlProxy'

const ONE_HOUR_MS = 60 * 60 * 1000

type SortByOption = 'time' | 'reason' | 'object'

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

  // Pre-filter to events within the last hour (before handing to useCardData)
  const recentEventsCandidates = useMemo(() => {
    const cutoff = Date.now() - ONE_HOUR_MS
    return filterByCluster(events).filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= cutoff
    })
  }, [events, filterByCluster])

  const {
    items: paginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<ClusterEvent, SortByOption>(recentEventsCandidates, {
    filter: {
      searchFields: ['reason', 'object', 'message', 'namespace'],
      clusterField: 'cluster',
      storageKey: 'recent-events',
    },
    sort: {
      defaultField: 'time',
      defaultDirection: 'desc',
      comparators: {
        time: commonComparators.date<ClusterEvent>('lastSeen'),
        reason: commonComparators.string<ClusterEvent>('reason'),
        object: commonComparators.string<ClusterEvent>('object'),
      },
    },
    defaultLimit: 5,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const warningCount = recentEventsCandidates.filter(e => e.type === 'Warning').length

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-muted-foreground">
            {totalItems} event{totalItems !== 1 ? 's' : ''} in last hour
            {warningCount > 0 && (
              <span className="text-yellow-400 ml-1">({warningCount} warning{warningCount !== 1 ? 's' : ''})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterFilter={{
              availableClusters: filters.availableClusters,
              selectedClusters: filters.localClusterFilter,
              onToggle: filters.toggleClusterFilter,
              onClear: filters.clearClusterFilter,
              isOpen: filters.showClusterFilter,
              setIsOpen: filters.setShowClusterFilter,
              containerRef: filters.clusterFilterRef,
            }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy: sorting.sortBy,
              sortOptions: [
                { value: 'time', label: 'Time' },
                { value: 'reason', label: 'Reason' },
                { value: 'object', label: 'Object' },
              ],
              onSortChange: (v) => sorting.setSortBy(v as SortByOption),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection,
            }}
          />
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
      {totalItems === 0 ? (
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
                        x{event.count}
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
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
