import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import type { ClusterEvent } from '../../hooks/useMCP'

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

type SortByOption = 'time' | 'count' | 'reason'

const SORT_OPTIONS = [
  { value: 'time' as const, label: 'Time' },
  { value: 'count' as const, label: 'Count' },
  { value: 'reason' as const, label: 'Reason' },
]

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

  // Pre-filter to only warning events before passing to useCardData
  const warningOnly = useMemo(() => events.filter(e => e.type === 'Warning'), [events])

  const {
    items: displayedEvents,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting,
  } = useCardData<ClusterEvent, SortByOption>(warningOnly, {
    filter: {
      searchFields: ['reason', 'message', 'object', 'namespace'],
      clusterField: 'cluster',
      storageKey: 'warning-events',
    },
    sort: {
      defaultField: 'time',
      defaultDirection: 'desc',
      comparators: {
        time: (a, b) => {
          const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
          const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
          return aTime - bTime
        },
        count: commonComparators.number<ClusterEvent>('count'),
        reason: commonComparators.string<ClusterEvent>('reason'),
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

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {totalItems} warning{totalItems !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterFilter={{
              availableClusters,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
            }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy: sorting.sortBy,
              sortOptions: SORT_OPTIONS,
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

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search warnings..."
      />

      {/* Warning events list */}
      {totalItems === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />
          <p className="text-sm text-muted-foreground">No warnings</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedEvents.map((event, i) => (
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
                    <span className="text-xs text-muted-foreground ml-auto">{getTimeAgo(event.lastSeen)}</span>
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
