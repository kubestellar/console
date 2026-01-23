import { useState, useMemo } from 'react'
import { Activity, AlertTriangle, Info, AlertCircle, Clock, Search, ChevronRight } from 'lucide-react'
import { useClusters, useWarningEvents, useNamespaces } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

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

export function NamespaceEvents({ config }: NamespaceEventsProps) {
  const { clusters: allClusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { events: allEvents, isLoading: eventsLoading, isRefreshing: eventsRefreshing, refetch: refetchEvents } = useWarningEvents()
  const isRefreshing = clustersRefreshing || eventsRefreshing
  const { drillToEvents } = useDrillDownActions()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const [sortBy, setSortBy] = useState<SortByOption>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Fetch namespaces for the selected cluster
  const { namespaces } = useNamespaces(selectedCluster || undefined)

  // Filter and sort events by cluster and namespace
  const sortedEvents = useMemo(() => {
    let events = allEvents
    if (selectedCluster) {
      events = events.filter(e => e.cluster === selectedCluster)
    }
    if (selectedNamespace) {
      events = events.filter(e => e.namespace === selectedNamespace)
    }

    // Apply local search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      events = events.filter(e =>
        e.message.toLowerCase().includes(query) ||
        e.object.toLowerCase().includes(query) ||
        e.namespace.toLowerCase().includes(query) ||
        e.type.toLowerCase().includes(query) ||
        (e.reason?.toLowerCase() || '').includes(query)
      )
    }

    // Sort events
    const sorted = [...events].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'time':
          const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
          const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
          compare = timeA - timeB
          break
        case 'type':
          compare = a.type.localeCompare(b.type)
          break
        case 'object':
          compare = a.object.localeCompare(b.object)
          break
        case 'count':
          compare = a.count - b.count
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
    return sorted
  }, [allEvents, selectedCluster, selectedNamespace, sortBy, sortDirection, localSearch])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: filteredEvents,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedEvents, effectivePerPage)

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
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Namespace Events</span>
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {totalItems}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => { refetchClusters(); refetchEvents(); }}
            size="sm"
          />
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
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
        <div className="flex items-center gap-2 mb-4">
          <ClusterBadge cluster={selectedCluster} />
          {selectedNamespace && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm text-foreground">{selectedNamespace}</span>
            </>
          )}
        </div>
      )}

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search events..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

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
                className={`p-3 rounded-lg bg-${color}-500/10 border border-${color}-500/20 cursor-pointer hover:bg-${color}-500/20 transition-colors group`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 text-${color}-400 mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {event.cluster && (
                        <ClusterBadge cluster={event.cluster} size="sm" />
                      )}
                      <span className="text-xs text-muted-foreground">{event.namespace}</span>
                      <span className="text-xs text-muted-foreground">/</span>
                      <span className="text-sm text-foreground truncate group-hover:text-orange-400">{event.object}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
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
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {totalItems} warning events{selectedNamespace ? ` in ${selectedNamespace}` : ''}
      </div>
    </div>
  )
}
