import { Bell, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { formatStat } from '../../../lib/formatStats'
import type { ClusterEvent } from '../../../hooks/mcp/types'
import { getTimeAgo, getEventIcon } from './helpers'
import type { EventFilter, EventsStats, GroupedEvents, TimelineGroupKey, TranslateFn } from './types'

export interface EventsListTabProps {
  t: TranslateFn
  stats: EventsStats
  filter: EventFilter
  onFilterChange: (filter: EventFilter) => void
  namespaces: string[]
  reasons: string[]
  selectedNamespace: string
  onNamespaceChange: (namespace: string) => void
  selectedReason: string
  onReasonChange: (reason: string) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
  visibleListEventsCount: number
  totalFilteredEventsCount: number
  isLoading: boolean
  showLoadError: boolean
  eventsError: string | null | undefined
  refreshingAll: boolean
  onRetry: () => void
  filteredEvents: ClusterEvent[]
  isAllClustersSelected: boolean
  globalSelectedClusters: string[]
  listTabVisibleGroups: Partial<GroupedEvents>
}

/** List tab: filterable, groupable event list with namespace/reason/search filters. */
export function EventsListTab({
  t,
  stats,
  filter,
  onFilterChange,
  namespaces,
  reasons,
  selectedNamespace,
  onNamespaceChange,
  selectedReason,
  onReasonChange,
  searchQuery,
  onSearchQueryChange,
  hasActiveFilters,
  onClearFilters,
  visibleListEventsCount,
  totalFilteredEventsCount,
  isLoading,
  showLoadError,
  eventsError,
  refreshingAll,
  onRetry,
  filteredEvents,
  isAllClustersSelected,
  globalSelectedClusters,
  listTabVisibleGroups,
}: EventsListTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <button onClick={() => onFilterChange('all')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'all' ? 'ring-2 ring-purple-500' : 'hover:bg-secondary/30')}>
          <div className="text-3xl font-bold text-foreground">{formatStat(stats.total)}</div>
          <div className="text-sm text-muted-foreground">{t('events.stats.total')}</div>
        </button>
        <button onClick={() => onFilterChange('warning')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'warning' ? 'ring-2 ring-yellow-500' : 'hover:bg-secondary/30')}>
          <div className="text-3xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div>
          <div className="text-sm text-muted-foreground">{t('events.stats.warnings')}</div>
        </button>
        <button onClick={() => onFilterChange('normal')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'normal' ? 'ring-2 ring-green-500' : 'hover:bg-secondary/30')}>
          <div className="text-3xl font-bold text-green-400">{formatStat(stats.normal)}</div>
          <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
        </button>
      </div>

      <div className="glass p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="events-namespace-filter" className="block text-xs text-muted-foreground mb-1">{t('common.namespace')}</label>
            <Select id="events-namespace-filter" value={selectedNamespace} onChange={(e) => onNamespaceChange(e.target.value)} className="bg-secondary">
              <option value="">{t('events.allNamespaces')}</option>
              {namespaces.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="events-reason-filter" className="block text-xs text-muted-foreground mb-1">{t('common.reason')}</label>
            <Select id="events-reason-filter" value={selectedReason} onChange={(e) => onReasonChange(e.target.value)} className="bg-secondary">
              <option value="">{t('events.allReasons')}</option>
              {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="events-search" className="block text-xs text-muted-foreground mb-1">{t('events.search')}</label>
            <Input type="text" id="events-search" placeholder={t('common.searchEvents')} value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)} className="bg-secondary" />
          </div>
          {hasActiveFilters && (
            <div>
              <label className="block text-xs text-transparent mb-1">{t('common.clear')}</label>
              <button onClick={onClearFilters} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors">{t('events.clearFiltersButton')}</button>
            </div>
          )}
        </div>
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {/*
             * Bug see issue 9041: denominator counts events from currently-selected
             * clusters (globalFilteredAllEvents), not raw allEvents. When a timeline
             * group context is active, the filtered count reflects that narrowed view.
             */}
            {t('events.showingFiltered', { filtered: visibleListEventsCount, total: totalFilteredEventsCount })}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" /></div>
      ) : showLoadError ? (
        <div className="glass p-6 rounded-lg border border-red-500/30 bg-red-500/5 text-center" role="alert" aria-live="polite">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-400" />
          <p className="text-sm font-medium text-foreground mb-1">{t('events.loadError.title')}</p>
          <p className="text-xs text-muted-foreground mb-4">
            {eventsError || t('events.loadError.fallback')}
          </p>
          <button
            onClick={onRetry}
            disabled={refreshingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', refreshingAll && 'animate-spin')} />
            {t('events.loadError.retry')}
          </button>
        </div>
      ) : (filteredEvents || []).length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{t('events.empty.noEventsFound')}</p>
          {!isAllClustersSelected && <p className="text-sm text-muted-foreground mt-1">{t('events.empty.showingFrom', { clusters: (globalSelectedClusters || []).join(', ') })}</p>}
          {hasActiveFilters && <button onClick={onClearFilters} className="mt-2 text-sm text-primary hover:underline">{t('events.empty.clearFilters')}</button>}
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(listTabVisibleGroups) as TimelineGroupKey[]).map((groupKey) => {
            const groupEvents = listTabVisibleGroups[groupKey]
            if (!groupEvents || groupEvents.length === 0) return null
            const groupLabel = t(`events.groups.${groupKey}`)
            return (
              <div key={groupKey}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('events.groupHeading', { group: groupLabel, count: groupEvents.length })}</h3>
                <div className="space-y-2">
                  {groupEvents.map((event, index) => (
                    <div key={`${event.object}-${event.reason}-${index}`} className={`glass p-4 rounded-lg border-l-4 ${event.type === 'Warning' ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-1">{getEventIcon(event.type, event.reason)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${event.type === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{event.reason}</span>
                            <span className="text-xs text-muted-foreground">{event.namespace}/{event.object}</span>
                            {/*
                             * Bug see issue 9044: use the same Unicode multiplication
                             * sign (×) as the Timeline tab so the symbol is consistent
                             * across tabs for the same data.
                             */}
                            {event.count > 1 && <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">{t('events.repeatCount', { count: event.count })}</span>}
                            {event.cluster && <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />}
                          </div>
                          <p className="text-sm text-foreground mt-1 wrap-break-word">{event.message}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground"><span>{getTimeAgo(event.lastSeen, t)}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
