import { AlertTriangle, Info, XCircle, ChevronRight, Radio } from 'lucide-react'
import { useMemo } from 'react'
import { useCachedEvents } from '../../hooks/useCachedData'
import type { ClusterEvent } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { CardSkeleton, CardSearchInput, CardControlsRow, CardPaginationFooter, CardEmptyState } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'

type SortByOption = 'time' | 'count' | 'type'

const SORT_OPTIONS = [
  { value: 'time' as const, label: 'Time' },
  { value: 'count' as const, label: 'Count' },
  { value: 'type' as const, label: 'Type' },
]

/** Default API fetch ceiling — large enough to give pagination headroom but
 * not so large that the JSON payload becomes wasteful. Used when the user
 * has not configured a `limit` for this card. */
const DEFAULT_API_FETCH_LIMIT = 100

/** Default page size for the in-card "show N" dropdown when the user has
 * not configured a `limit` for this card. */
const DEFAULT_DISPLAY_LIMIT = 5

interface EventStreamConfig {
  /** User-configurable max events from the Configure Card modal. Drives BOTH
   * the API fetch ceiling and the initial in-card "show N" dropdown
   * selection. Without this wiring (#6070) EventStream silently dropped the
   * user's preference and rendered with the hardcoded defaults. */
  limit?: number
  /** Filter to warning/error events only. Surfaced in the same modal section. */
  warningsOnly?: boolean
}

function EventStreamInternal({ config }: { config?: EventStreamConfig }) {
  const { t } = useTranslation()
  const { isDemoMode } = useDemoMode()
  const userLimit =
    typeof config?.limit === 'number' && config.limit > 0 ? config.limit : null
  const apiFetchLimit = userLimit ?? DEFAULT_API_FETCH_LIMIT
  const displayLimit = userLimit ?? DEFAULT_DISPLAY_LIMIT
  // Fetch more events from API to enable pagination (using cached data hook)
  const {
    events: rawEvents,
    isLoading: hookLoading,
    isDemoFallback,
    isRefreshing,
    lastRefresh,
    error,
    isFailed,
    consecutiveFailures,
  } = useCachedEvents(undefined, undefined, { limit: apiFetchLimit, category: 'realtime' })

  // Apply the warningsOnly user-config filter (#6070 follow-up — same modal
  // section, also previously dropped because EventStream ignored its config).
  const filteredRawEvents = useMemo(
    () =>
      config?.warningsOnly
        ? rawEvents.filter(e => e.type === 'Warning' || e.type === 'Error')
        : rawEvents,
    [rawEvents, config?.warningsOnly],
  )

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading,
    isDemoData: isDemoMode || isDemoFallback,
    hasAnyData: filteredRawEvents.length > 0,
    isFailed,
    consecutiveFailures,
    isRefreshing,
  })

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
    containerRef,
    containerStyle,
  } = useCardData<ClusterEvent, SortByOption>(filteredRawEvents, {
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
        time: (a, b) => {
          const timeA = a.lastSeen || a.firstSeen || ''
          const timeB = b.lastSeen || b.firstSeen || ''
          return timeA.localeCompare(timeB)
        },
        count: commonComparators.number('count'),
        type: commonComparators.string('type'),
      },
    },
    defaultLimit: displayLimit,
  })

  const { drillToEvents, drillToPod, drillToDeployment, drillToReplicaSet } = useDrillDownActions()

  const handleEventClick = (event: ClusterEvent) => {
    // Parse object to get resource type and name
    const [resourceType, resourceName] = event.object.split('/')
    const cluster = event.cluster

    if (!cluster) {
      // Can't drill down without a cluster
      return
    }

    if (resourceType.toLowerCase() === 'pod') {
      drillToPod(cluster, event.namespace, resourceName, { fromEvent: true })
    } else if (resourceType.toLowerCase() === 'replicaset') {
      drillToReplicaSet(cluster, event.namespace, resourceName, { fromEvent: true })
    } else if (resourceType.toLowerCase() === 'deployment') {
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

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={60} />
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={Radio}
        title="No events"
        message="Cluster events will appear here when activity is detected."
      />
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
        </div>
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
        placeholder={t('common.searchEvents')}
        className="mb-3"
      />

      {/* Event list */}
      <div ref={containerRef} className="flex-1 space-y-1.5 overflow-y-auto min-h-card-content" style={containerStyle}>
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
                key={`${event.cluster || 'unknown'}-${event.object}-${event.lastSeen || event.firstSeen || ''}-${event.reason}`}
                className={`flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/40 transition-colors cursor-pointer group ${idx % 2 === 0 ? 'bg-secondary/10' : 'bg-secondary/25'}`}
                onClick={() => handleEventClick(event)}
                title={`Click to view details for ${event.object}`}
              >
                <div className={`p-1.5 rounded ${style.bg} flex-shrink-0`} title={style.tooltip}>
                  <EventIcon className={`w-3.5 h-3.5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 min-w-0">
                    <ClusterBadge cluster={event.cluster || 'unknown'} />
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

export function EventStream({ config }: { config?: Record<string, unknown> } = {}) {
  return (
    <DynamicCardErrorBoundary cardId="EventStream">
      <EventStreamInternal config={config as EventStreamConfig | undefined} />
    </DynamicCardErrorBoundary>
  )
}
