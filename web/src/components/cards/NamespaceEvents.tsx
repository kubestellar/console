import { useMemo, useEffect } from 'react'
import { AlertTriangle, Info, AlertCircle, Clock, ChevronRight } from 'lucide-react'
import { useClusters, useWarningEvents, useNamespaces, type ClusterEvent } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useCardData, useCascadingSelection, commonComparators,
  CardSkeleton, CardSearchInput, CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'

interface NamespaceEventsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

type SortByOption = 'time' | 'type' | 'object' | 'count'

const SORT_OPTIONS = [
  { value: 'time' as const, label: 'Time' },
  { value: 'type' as const, label: 'Type' },
  { value: 'object' as const, label: 'Object' },
  { value: 'count' as const, label: 'Count' },
]

const EVENT_SORT_COMPARATORS: Record<SortByOption, (a: ClusterEvent, b: ClusterEvent) => number> = {
  time: (a, b) => {
    const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
    const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
    return timeA - timeB
  },
  type: commonComparators.string('type'),
  object: commonComparators.string('object'),
  count: (a, b) => a.count - b.count,
}

export function NamespaceEvents({ config }: NamespaceEventsProps) {
  const { isLoading: clustersLoading } = useClusters()
  const { events: allEvents, isLoading: eventsLoading } = useWarningEvents()
  const { drillToEvents } = useDrillDownActions()

  // Use cascading selection hook for cluster -> namespace
  const {
    selectedFirst: selectedCluster,
    setSelectedFirst: setSelectedCluster,
    selectedSecond: selectedNamespace,
    setSelectedSecond: setSelectedNamespace,
    availableFirstLevel: clusters,
  } = useCascadingSelection({
    storageKey: 'namespace-events',
  })

  // Apply config overrides (e.g., from drill-down navigation)
  useEffect(() => {
    if (config?.cluster && config.cluster !== selectedCluster) {
      setSelectedCluster(config.cluster)
    }
    if (config?.namespace && config.namespace !== selectedNamespace) {
      setSelectedNamespace(config.namespace)
    }
    // Only run on mount - config changes shouldn't override user selections
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch namespaces for the selected cluster
  const { namespaces } = useNamespaces(selectedCluster || undefined)

  // Pre-filter by selected cluster/namespace (card-specific cascading selection)
  const preFilteredEvents = useMemo(() => {
    let events = allEvents
    if (selectedCluster) {
      events = events.filter(e => e.cluster === selectedCluster)
    }
    if (selectedNamespace) {
      events = events.filter(e => e.namespace === selectedNamespace)
    }
    return events
  }, [allEvents, selectedCluster, selectedNamespace])

  // useCardData for search/cluster filter/sort/pagination
  const {
    items: filteredEvents,
    totalItems,
    currentPage,
    totalPages,
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
      availableClusters: availableClustersForFilter,
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
  } = useCardData<ClusterEvent, SortByOption>(preFilteredEvents, {
    filter: {
      searchFields: ['message', 'object', 'namespace', 'type', 'reason'],
      clusterField: 'cluster',
      storageKey: 'namespace-events',
    },
    sort: {
      defaultField: 'time',
      defaultDirection: 'desc',
      comparators: EVENT_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const isLoading = clustersLoading || eventsLoading
  const showSkeleton = isLoading && allEvents.length === 0

  const getEventIcon = (type: string) => {
    if (type === 'Warning') return AlertTriangle
    if (type === 'Error') return AlertCircle
    return Info
  }

  const getEventColor = (type: string) => {
    if (type === 'Warning') return 'orange'
    if (type === 'Error') return 'red'
    return 'blue'
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={3} showHeader showSearch rowHeight={60} />
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {totalItems} events
            </span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClustersForFilter.length,
          }}
          clusterFilter={{
            availableClusters: availableClustersForFilter,
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

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">All clusters</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Scope badge (if selected) */}
      {selectedCluster && (
        <div className="flex items-center gap-2 mb-4 min-w-0 overflow-hidden">
          <div className="shrink-0"><ClusterBadge cluster={selectedCluster} /></div>
          {selectedNamespace && (
            <>
              <span className="text-muted-foreground shrink-0">/</span>
              <span className="text-sm text-foreground truncate min-w-0">{selectedNamespace}</span>
            </>
          )}
        </div>
      )}

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search events..."
        className="mb-4"
      />

      {/* Events list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-foreground">No Warning Events</p>
            <p className="text-xs text-muted-foreground">All systems operating normally</p>
          </div>
        ) : (
          filteredEvents.map((event, idx) => {
            const Icon = getEventIcon(event.type)
            const color = getEventColor(event.type)

            return (
              <div
                key={`${event.cluster}-${event.namespace}-${event.object}-${idx}`}
                onClick={() => drillToEvents(event.cluster || '', event.namespace, event.object)}
                className={`p-3 rounded-lg bg-${color}-500/10 border border-${color}-500/20 cursor-pointer hover:bg-${color}-500/20 transition-colors group overflow-hidden`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className={`w-4 h-4 text-${color}-400 mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                      {event.cluster && (
                        <div className="shrink-0"><ClusterBadge cluster={event.cluster} size="sm" /></div>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">{event.namespace}</span>
                      <span className="text-xs text-muted-foreground shrink-0">/</span>
                      <span className="text-sm text-foreground truncate min-w-0 flex-1 group-hover:text-orange-400">{event.object}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.message}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{event.lastSeen ? formatTime(event.lastSeen) : 'Unknown'}</span>
                      {event.count > 1 && (
                        <span className="ml-2">({event.count}x)</span>
                      )}
                    </div>
                  </div>
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
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {totalItems} warning events{selectedNamespace ? ` in ${selectedNamespace}` : ''}
      </div>
    </div>
  )
}
