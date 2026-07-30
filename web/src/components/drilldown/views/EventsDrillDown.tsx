import { useMemo, useState, useEffect } from 'react'
import { ChevronLeft, Server, Layers, Search, Filter } from 'lucide-react'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'
import { useEventsDrillDown, TypeFilter } from './useEventsDrillDown'
import {
  EventsSkeleton,
  EventRow,
  KubectlFallback,
  ErrorState,
  Pagination,
  PAGE_SIZE,
} from './EventsDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function EventsDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const objectName = data.objectName as string | undefined
  const clusterShort = cluster.split('/').pop() || cluster
  const { state, pop, close } = useDrillDown()
  const { drillToCluster, drillToNamespace } = useDrillDownActions()

  const { events, isLoading, error, copied, refetch, copyCommand } = useEventsDrillDown(
    clusterShort,
    namespace,
    objectName
  )

  // Interactive controls
  const [currentPage, setCurrentPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Reset to page 1 when the viewed resource changes so stale page numbers
  // don't persist across drilldown navigations to different resources.
  useEffect(() => {
    setCurrentPage(1)
  }, [objectName, clusterShort, namespace])

  // Reset to page 1 when filters change so users always see results from the top.
  useEffect(() => {
    setCurrentPage(1)
  }, [typeFilter, searchQuery])

  // Full pre-paginated dataset: apply objectName, type, and search filters then sort.
  const allFilteredSortedEvents = useMemo(() => {
    let result = events

    if (objectName) {
      result = result.filter(e => e.object.toLowerCase().includes(objectName.toLowerCase()))
    }
    if (typeFilter !== 'all') {
      result = result.filter(e => e.type === typeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.reason.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.object.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) =>
      new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()
    )
  }, [events, objectName, typeFilter, searchQuery])

  // Paginated slice used only for rendering the event list
  const pagedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return allFilteredSortedEvents.slice(start, start + PAGE_SIZE)
  }, [allFilteredSortedEvents, currentPage])

  const totalPages = Math.max(1, Math.ceil(allFilteredSortedEvents.length / PAGE_SIZE))

  const warningCount = allFilteredSortedEvents.filter(e => e.type === 'Warning').length
  const normalCount = allFilteredSortedEvents.filter(e => e.type === 'Normal').length

  const hasActiveFilters = typeFilter !== 'all' || searchQuery !== ''

  const clearFilters = () => {
    setTypeFilter('all')
    setSearchQuery('')
  }

  if (isLoading && events.length === 0 && !error) {
    return <EventsSkeleton />
  }

  // Show error state with retry and kubectl fallback
  if (error || (events.length === 0 && !isLoading)) {
    return (
      <ErrorState
        error={error}
        clusterShort={clusterShort}
        namespace={namespace}
        objectName={objectName}
        isLoading={isLoading}
        copied={copied}
        onRefetch={() => refetch()}
        onCopyCommand={copyCommand}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Contextual Navigation */}
      <div className="flex items-center gap-6 text-sm">
        <button onClick={() => state.stack.length > 1 ? pop() : close()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11 px-2 py-2">
          <ChevronLeft className="w-4 h-4" />
          {t('drilldown.goBack', 'Back')}
        </button>
        {namespace && (
          <button
            onClick={() => drillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
          </button>
        )}
        <button
          onClick={() => drillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={clusterShort} size="sm" />
        </button>
      </div>

      {/* Stats — computed from the full filtered set, not from the current page */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-foreground">{allFilteredSortedEvents.length}</div>
          <div className="text-sm text-muted-foreground">{t('drilldown.events.totalEvents', 'Total Events')}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
          <div className="text-sm text-muted-foreground">{t('common.warnings', 'Warnings')}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-green-400">{normalCount}</div>
          <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
        </div>
      </div>

      {/* Search and type filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('common.search', 'Search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card/50 border border-border rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            data-testid="events-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            data-testid="events-type-filter"
          >
            <option value="all">{t('drilldown.events.allTypes', 'All Types')}</option>
            <option value="Warning">{t('common.warning', 'Warning')}</option>
            <option value="Normal">{t('common.normal', 'Normal')}</option>
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="events-clear-filters"
          >
            {t('common.clearFilters', 'Clear filters')}
          </button>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-2">
        {pagedEvents.map((event, i) => (
          <EventRow key={i} event={event} />
        ))}
      </div>

      {/* Empty state when filters produce no results */}
      {allFilteredSortedEvents.length === 0 && (
        <div className="space-y-4">
          <div className="text-center py-6">
            {hasActiveFilters ? (
              <>
                <p className="text-muted-foreground">
                  {t('drilldown.events.noEventsMatchFilters', 'No events match the active filters.')}
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {t('common.clearFilters', 'Clear filters')}
                </button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">{t('drilldown.events.noEventsFoundFor', { name: objectName || clusterShort, defaultValue: `No events found for ${objectName || clusterShort}` })}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('drilldown.events.eventsExpiredHint', 'Events may have expired or require authentication')}</p>
              </>
            )}
          </div>

          {/* Kubectl fallback — only shown when no active filters are hiding results */}
          {!hasActiveFilters && (
            <KubectlFallback
              clusterShort={clusterShort}
              namespace={namespace}
              objectName={objectName}
              copied={copied}
              onCopyCommand={copyCommand}
            />
          )}
        </div>
      )}

      {/* Pagination controls — shown only when there is more than one page */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={allFilteredSortedEvents.length}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  )
}
