import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardSkeleton, CardAIActions } from '../../lib/cards/CardComponents'
import type { ClusterEvent } from '../../hooks/useMCP'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'

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
  const { t } = useTranslation()
  const {
    events,
    isLoading,
    isRefreshing,
    isDemoFallback,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh } = useCachedEvents(undefined, undefined, { limit: 100, category: 'realtime' })

  // Pre-filter to only warning events before passing to useCardData
  const warningOnly = events.filter(e => e.type === 'Warning')

  // Report data state to CardWrapper for failure badge rendering
  const hasData = events.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData: isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

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
      clusterFilterRef },
    sorting,
    containerRef,
    containerStyle } = useCardData<ClusterEvent, SortByOption>(warningOnly, {
    filter: {
      searchFields: ['reason', 'message', 'object', 'namespace'],
      clusterField: 'cluster',
      storageKey: 'warning-events' },
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
        reason: commonComparators.string<ClusterEvent>('reason') } },
    defaultLimit: 5 })

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={3} showHeader showSearch />
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No warnings</p>
        <p className="text-xs mt-1">Warning events will appear here</p>
      </div>
    )
  }

  /* If there are no warning events at all, show a clean empty state without filters */
  if (warningOnly.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />
          <p className="text-sm text-foreground font-medium">{t('warningEvents.noWarnings')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('warningEvents.noWarningsHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        {/* Bug #9043: use i18n plural keys so non-English languages get correct pluralization */}
        <span className="text-xs text-muted-foreground">
          {t('warningEvents.count', { count: totalItems })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <CardControlsRow
            clusterFilter={{
              availableClusters,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy: sorting.sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: (v) => sorting.setSortBy(v as SortByOption),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection }}
            className="!mb-0"
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

      {/* Error Display — bug #9043: error strings must respect language setting */}
      {isFailed && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-400">{t('warningEvents.errorLoading')}</p>
            <p className="text-2xs text-muted-foreground mt-0.5">{t('warningEvents.errorFetchAttempts', { count: consecutiveFailures })}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common.searchWarnings')}
      />

      {/* Warning events list — filtered by search/cluster may yield 0 even when warningOnly > 0 */}
      {totalItems === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />
          <p className="text-sm text-muted-foreground">{t('warningEvents.noMatchingWarnings')}</p>
        </div>
      ) : (
        <div ref={containerRef} className="space-y-2" style={containerStyle}>
          {displayedEvents.map((event) => (
            <div
              key={`${event.cluster}-${event.namespace}-${event.object}-${event.reason}-${event.lastSeen}`}
              className="p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge color="yellow">
                      {event.reason}
                    </StatusBadge>
                    <span className="text-xs text-foreground truncate">{event.object}</span>
                    {/* Bug #9044: use × (Unicode multiplication) consistently across tabs */}
                    {event.count > 1 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-card text-muted-foreground">
                        {t('warningEvents.repeatCount', { count: event.count })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{event.message}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 min-w-0">
                    <span className="text-xs text-muted-foreground truncate">{event.namespace}</span>
                    {event.cluster && (
                      <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" className="shrink min-w-0" />
                    )}
                    <CardAIActions
                      resource={{ kind: 'Event', name: event.object, namespace: event.namespace, cluster: event.cluster, status: 'Warning' }}
                      issues={[{ name: event.reason, message: event.message }]}
                      showRepair={false}
                      className="flex-shrink-0"
                    />
                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap flex-shrink-0">{getTimeAgo(event.lastSeen)}</span>
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
