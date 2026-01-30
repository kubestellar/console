import { AlertTriangle, Info, XCircle, ChevronRight } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import type { ClusterEvent } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import {
  useCardData, commonComparators,
  CardSkeleton, CardSearchInput,
  CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'

type SortByOption = 'time' | 'count' | 'type'

const SORT_OPTIONS = [
  { value: 'time' as const, label: 'Time' },
  { value: 'count' as const, label: 'Count' },
  { value: 'type' as const, label: 'Type' },
]

export function EventStream() {
  // Fetch more events from API to enable pagination (using cached data hook)
  const {
    events: rawEvents,
    isLoading: hookLoading,
    error,
  } = useCachedEvents(undefined, undefined, { limit: 100, category: 'realtime' })

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawEvents.length === 0

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: events,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<ClusterEvent, SortByOption>(rawEvents, {
    filter: {
      searchFields: ['message', 'object', 'namespace', 'type'],
      clusterField: 'cluster',
      customPredicate: (event, query) =>
        (event.cluster?.toLowerCase() || '').includes(query),
      storageKey: 'event-stream',
    },
    sort: {
      defaultField: 'time',
      defaultDirection: 'desc',
      comparators: {
        time: () => 0, // Keep original order (already sorted by time desc)
        count: commonComparators.number('count'),
        type: commonComparators.string('type'),
      },
    },
    defaultLimit: 5,
  })

  const { drillToEvents, drillToPod, drillToDeployment } = useDrillDownActions()

  const handleEventClick = (event: ClusterEvent) => {
    // Parse object to get resource type and name
    const [resourceType, resourceName] = event.object.split('/')
    const cluster = event.cluster || 'default'

    if (resourceType.toLowerCase() === 'pod') {
      drillToPod(cluster, event.namespace, resourceName, { fromEvent: true })
    } else if (resourceType.toLowerCase() === 'deployment' || resourceType.toLowerCase() === 'replicaset') {
      drillToDeployment(cluster, event.namespace, resourceName, { fromEvent: true })
    } else {
      // Generic events view for other resources
      drillToEvents(cluster, event.namespace, event.object)
    }
  }

  const getEventStyle = (type: string) => {
    if (type === 'Warning') {
      return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', tooltip: 'Warning event - Potential issue detected' }
    }
    if (type === 'Error') {
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', tooltip: 'Error event - Action required' }
    }
    return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', tooltip: 'Informational event' }
  }

  if (isLoading) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={60} />
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2" />
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          }}
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search events..."
        className="mb-3"
      />

      {/* Event list */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No recent events
          </div>
        ) : (
          events.map((event, idx) => {
            const style = getEventStyle(event.type)
            const EventIcon = style.icon

            return (
              <div
                key={`${event.object}-${idx}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer group"
                onClick={() => handleEventClick(event)}
                title={`Click to view details for ${event.object}`}
              >
                <div className={`p-1.5 rounded ${style.bg} flex-shrink-0`} title={style.tooltip}>
                  <EventIcon className={`w-3.5 h-3.5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 min-w-0">
                    <ClusterBadge cluster={event.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground truncate min-w-0" title={`Namespace: ${event.namespace}`}>{event.namespace}</span>
                  </div>
                  <p className="text-sm text-foreground truncate" title={event.message}>{event.message}</p>
                  <p className="text-xs text-muted-foreground truncate" title={`Resource: ${event.object}`}>
                    {event.object}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {event.count > 1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground" title={`Event occurred ${event.count} times`}>
                      x{event.count}
                    </span>
                  )}
                  <span title="Click to view details"><ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 1000}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      <LimitedAccessWarning hasError={!!error} className="mt-2" />
    </div>
  )
}
