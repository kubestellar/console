import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Clock, Bell } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { cn } from '../../lib/cn'
import { formatStat } from '../../lib/formatStats'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import type { StatBlockValue } from '../ui/StatsOverview'
import {
  EVENT_LIMIT,
  EVENTS_FAILURE_THRESHOLD,
  EVENTS_CARDS_KEY,
  EventsOverviewTab,
  EventsTimelineTab,
  EventsListTab,
  useEventsData,
} from './events-page'
import type { EventFilter, TimelineGroupKey, TranslateFn, ViewTab } from './events-page/types'

// Default cards for the events dashboard
const DEFAULT_EVENTS_CARDS = getDefaultCards('events')

export function Events() {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, filterBySeverity, customFilter: globalCustomFilter } = useGlobalFilters()
  const { drillToAllEvents } = useDrillDownActions()

  // Get events
  const {
    events: allEvents,
    isLoading,
    isRefreshing: refreshingAll,
    lastRefresh: allUpdated,
    refetch: refetchAll,
    isFailed: eventsFailed,
    consecutiveFailures: eventsConsecutiveFailures,
    isDemoFallback: eventsIsDemoFallback,
    error: eventsError,
  } = useCachedEvents(undefined, undefined, { limit: EVENT_LIMIT })
  const lastUpdated = allUpdated ? new Date(allUpdated) : null
  // Show the explicit error banner once the cache layer has given up and
  // there's no usable cached data to display. We don't want to flash this
  // while the cache is still serving stale data in the background.
  const showLoadError =
    (eventsFailed || eventsConsecutiveFailures >= EVENTS_FAILURE_THRESHOLD) &&
    !isLoading &&
    (allEvents || []).length === 0

  // Local filter state, bundled into a single object to keep hook count low.
  const [filters, setFilters] = useState({
    selectedNamespace: '',
    selectedReason: '',
    filter: 'all' as EventFilter,
    searchQuery: '',
  })
  const { selectedNamespace, selectedReason, filter, searchQuery } = filters
  const setSelectedNamespace = (value: string) => setFilters(prev => ({ ...prev, selectedNamespace: value }))
  const setSelectedReason = (value: string) => setFilters(prev => ({ ...prev, selectedReason: value }))
  const setFilter = (value: EventFilter) => setFilters(prev => ({ ...prev, filter: value }))
  const setSearchQuery = (value: string) => setFilters(prev => ({ ...prev, searchQuery: value }))
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  // Group context preserved when the user clicks "View X more events" (bug #9040).
  const [timelineGroupContext, setTimelineGroupContext] = useState<TimelineGroupKey | null>(null)

  const {
    globalFilteredAllEvents,
    globalFilteredWarningEvents,
    namespaces,
    reasons,
    filteredEvents,
    stats,
    displayStats,
    groupedEvents,
    listTabVisibleGroups,
    visibleListEvents,
  } = useEventsData({
    allEvents,
    isAllClustersSelected,
    globalSelectedClusters,
    filterBySeverity,
    globalCustomFilter,
    filter,
    selectedNamespace,
    selectedReason,
    searchQuery,
    timelineGroupContext,
    isLoading,
    refreshingAll,
    t,
  })

  const formatEventStat = (count: number) => {
    const formatted = formatStat(count)
    return count >= EVENT_LIMIT ? `${formatted}+` : formatted
  }

  // Stats value getter
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total': return { value: formatEventStat(displayStats.total), sublabel: t('events.stats.totalSublabel'), onClick: () => drillToAllEvents(), isClickable: displayStats.total > 0 }
      case 'warnings': return { value: formatEventStat(displayStats.warnings), sublabel: t('events.stats.warningsSublabel'), onClick: () => drillToAllEvents('warning'), isClickable: displayStats.warnings > 0 }
      case 'normal': return { value: formatEventStat(displayStats.normal), sublabel: t('events.stats.normalSublabel'), onClick: () => drillToAllEvents('normal'), isClickable: displayStats.normal > 0 }
      case 'recent': return { value: formatEventStat(displayStats.recentCount), sublabel: t('events.stats.lastHourSublabel'), onClick: () => drillToAllEvents('recent'), isClickable: displayStats.recentCount > 0 }
      case 'errors': return { value: formatEventStat(displayStats.errors), sublabel: t('events.stats.errorsSublabel'), onClick: () => drillToAllEvents('error'), isClickable: displayStats.errors > 0 }
      default: return { value: '-', sublabel: '' }
    }
  }

  const clearFilters = () => {
    setFilters({ selectedNamespace: '', selectedReason: '', filter: 'all', searchQuery: '' })
    setTimelineGroupContext(null)
  }
  const hasActiveFilters = Boolean(selectedNamespace || selectedReason || filter !== 'all' || searchQuery || timelineGroupContext)

  // Tabs config (translated labels, defined inside render so i18n updates reactively)
  const TAB_CONFIG: { id: ViewTab; labelKey: string; icon: typeof Activity; showCount?: boolean }[] = [
    { id: 'overview', labelKey: 'events.tabs.overview', icon: Activity },
    { id: 'timeline', labelKey: 'events.tabs.timeline', icon: Clock },
    { id: 'list', labelKey: 'events.tabs.allEvents', icon: Bell, showCount: true },
  ]

  const handleTabSwitch = (tabId: ViewTab) => {
    setActiveTab(tabId)
    // Switching away from the list tab (or back to overview/timeline) clears any
    // group context so it doesn't leak into a fresh list view.
    if (tabId !== 'list') setTimelineGroupContext(null)
  }

  const handleOverviewFilterSelect = (nextFilter: EventFilter) => {
    handleTabSwitch('list')
    setFilter(nextFilter)
  }

  const handleTimelineViewMore = (groupKey: TimelineGroupKey) => {
    setTimelineGroupContext(groupKey)
    setActiveTab('list')
  }

  // Tabs - rendered before cards
  const tabsContent = (
    <div className="flex gap-1 mb-6 border-b border-border">
      {TAB_CONFIG.map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => handleTabSwitch(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
              activeTab === tab.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {t(tab.labelKey)}
            {tab.showCount && <span className="px-1.5 py-0.5 text-xs rounded-full bg-card text-muted-foreground">{displayStats.total}</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <DashboardPage
      title={t('common.events')}
      subtitle={t('events.subtitle')}
      icon="Activity"
      rightExtra={<RotatingTip page="events" />}
      storageKey={EVENTS_CARDS_KEY}
      defaultCards={DEFAULT_EVENTS_CARDS}
      statsType="events"
      getStatValue={getDashboardStatValue}
      onRefresh={refetchAll}
      isLoading={isLoading}
      isRefreshing={refreshingAll}
      lastUpdated={lastUpdated}
      hasData={displayStats.total > 0}
      isDemoData={eventsIsDemoFallback}
      beforeCards={tabsContent}
      emptyState={{ title: t('events.dashboardTitle'), description: t('events.dashboardDescription') }}
    >
      {activeTab === 'overview' && (
        <EventsOverviewTab
          t={t}
          stats={stats}
          globalFilteredWarningEvents={globalFilteredWarningEvents}
          onFilterSelect={handleOverviewFilterSelect}
        />
      )}

      {activeTab === 'timeline' && (
        <EventsTimelineTab
          t={t}
          filteredEvents={filteredEvents}
          groupedEvents={groupedEvents}
          onViewMore={handleTimelineViewMore}
        />
      )}

      {activeTab === 'list' && (
        <EventsListTab
          t={t}
          stats={stats}
          filter={filter}
          onFilterChange={setFilter}
          namespaces={namespaces}
          reasons={reasons}
          selectedNamespace={selectedNamespace}
          onNamespaceChange={setSelectedNamespace}
          selectedReason={selectedReason}
          onReasonChange={setSelectedReason}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          visibleListEventsCount={visibleListEvents.length}
          totalFilteredEventsCount={globalFilteredAllEvents.length}
          isLoading={isLoading}
          showLoadError={showLoadError}
          eventsError={eventsError}
          refreshingAll={refreshingAll}
          onRetry={() => { void refetchAll() }}
          filteredEvents={filteredEvents}
          isAllClustersSelected={isAllClustersSelected}
          globalSelectedClusters={globalSelectedClusters}
          listTabVisibleGroups={listTabVisibleGroups}
        />
      )}
    </DashboardPage>
  )
}
