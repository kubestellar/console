import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, AlertTriangle, Clock, Bell, ChevronRight, CheckCircle2, Calendar, Zap, RefreshCw } from 'lucide-react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { ClusterBadge } from '../ui/ClusterBadge'
import { DonutChart } from '../charts/PieChart'
import { BarChart } from '../charts/BarChart'
import { cn } from '../../lib/cn'
import { formatStat } from '../../lib/formatStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { getChartColor, getChartColorByName } from '../../lib/chartColors'
import { StatusBadge } from '../ui/StatusBadge'

// Event-related constants
const EVENT_LIMIT = 100 // Maximum number of events to fetch
const HOURS_IN_DAY = 24 // Number of hours to display in timeline
const MAX_PREVIEW_EVENTS = 10 // Maximum events shown in preview before "View more"
const MAX_RECENT_WARNINGS_PREVIEW = 5 // Max recent warnings shown on overview
const MILLISECONDS_PER_MINUTE = 60 * 1000 // Milliseconds in a minute
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE // Milliseconds in an hour
const MAX_TOP_REASONS = 6 // Top reasons shown in donut chart
const DONUT_COLOR_BUCKETS = 6 // Number of palette slots for charts
const DONUT_SIZE = 150 // Donut chart diameter in px
const DONUT_THICKNESS = 20 // Donut ring thickness in px
const DONUT_EMPTY_HEIGHT = 150 // Empty-state placeholder height in px
const BAR_CHART_HEIGHT = 200 // Bar chart height in px
// Threshold for treating a cached hook as "failed" so we can render an
// explicit error state with a retry button instead of an indefinite spinner.
const EVENTS_FAILURE_THRESHOLD = 1

const EVENTS_CARDS_KEY = 'kubestellar-events-cards'

// Default cards for the events dashboard
const DEFAULT_EVENTS_CARDS = getDefaultCards('events')

// Module-level cache for events stats (persists across navigation)
interface EventsStatsCache {
  total: number
  warnings: number
  errors: number
  normal: number
  recentCount: number
}
let eventsStatsCache: EventsStatsCache | null = null

type EventFilter = 'all' | 'warning' | 'normal'
type ViewTab = 'overview' | 'timeline' | 'list'
// Timeline buckets. `unknownTime` captures events missing a lastSeen timestamp
// so they don't get falsely bucketed as recent (bug #9039).
type TimelineGroupKey = 'lastHour' | 'today' | 'older' | 'unknownTime'

function getTimeAgo(timestamp: string | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!timestamp) return t('events.timeAgo.unknown')
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / MILLISECONDS_PER_MINUTE)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / HOURS_IN_DAY)
  if (diffDays > 0) return t('events.timeAgo.days', { count: diffDays })
  if (diffHours > 0) return t('events.timeAgo.hours', { count: diffHours })
  if (diffMins > 0) return t('events.timeAgo.minutes', { count: diffMins })
  return t('events.timeAgo.justNow')
}

function getEventIcon(type: string, reason: string): React.ReactNode {
  if (type === 'Warning') {
    return <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  }
  if (reason === 'Scheduled' || reason === 'Created') {
    return <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
  }
  if (reason === 'Started' || reason === 'Pulled') {
    return <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
  if (reason === 'Killing' || reason === 'Deleted') {
    return <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
  }
  return <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}

// Loose translator type for dynamic key lookup (group labels computed from a union).
// i18next's strict `TFunction` generics don't play well with `events.groups.${key}`
// concatenation, so we narrow to the runtime contract we actually rely on.
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

export function Events() {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, filterBySeverity, customFilter: globalCustomFilter } = useGlobalFilters()
  const { drillToAllEvents } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

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
  const warningEvents = (allEvents || []).filter(e => e.type === 'Warning')
  const lastUpdated = allUpdated ? new Date(allUpdated) : null
  // Show the explicit error banner once the cache layer has given up and
  // there's no usable cached data to display. We don't want to flash this
  // while the cache is still serving stale data in the background.
  const showLoadError =
    (eventsFailed || eventsConsecutiveFailures >= EVENTS_FAILURE_THRESHOLD) &&
    !isLoading &&
    (allEvents || []).length === 0

  // Local state
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [filter, setFilter] = useState<EventFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  // Group context preserved when the user clicks "View X more events" (bug #9040).
  const [timelineGroupContext, setTimelineGroupContext] = useState<TimelineGroupKey | null>(null)

  // Events after global filter
  const globalFilteredAllEvents = useMemo(() => {
    let result = allEvents || []
    if (!isAllClustersSelected) {
      result = result.filter(e => e.cluster && globalSelectedClusters.includes(e.cluster))
    }
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(e =>
        e.reason.toLowerCase().includes(query) || e.message.toLowerCase().includes(query) ||
        e.object.toLowerCase().includes(query) || e.namespace.toLowerCase().includes(query) ||
        (e.cluster && e.cluster.toLowerCase().includes(query))
      )
    }
    return result
  }, [allEvents, isAllClustersSelected, globalSelectedClusters, globalCustomFilter])

  const globalFilteredWarningEvents = useMemo(
    () => globalFilteredAllEvents.filter(e => e.type === 'Warning'),
    [globalFilteredAllEvents]
  )
  const globalFilteredErrorEvents = useMemo(
    () => globalFilteredAllEvents.filter(e => e.type === 'Error'),
    [globalFilteredAllEvents]
  )

  // Extract unique namespaces and reasons
  const { namespaces, reasons } = useMemo(() => {
    const nsSet = new Set<string>()
    const reasonSet = new Set<string>()
    globalFilteredAllEvents.forEach(e => {
      if (e.namespace) nsSet.add(e.namespace)
      if (e.reason) reasonSet.add(e.reason)
    })
    return { namespaces: Array.from(nsSet).sort(), reasons: Array.from(reasonSet).sort() }
  }, [globalFilteredAllEvents])

  // Helper: parse an event's timestamp as a Date, or return null for missing/invalid.
  // Events without a valid lastSeen should never be falsely bucketed as recent (bug #9039).
  const parseEventTime = (ts: string | undefined): Date | null => {
    if (!ts) return null
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  // Filtered events for list/timeline views
  const filteredEvents = useMemo(() => {
    let result = filter === 'warning' ? warningEvents : (allEvents || [])
    if (!isAllClustersSelected) {
      result = result.filter(e => e.cluster && globalSelectedClusters.includes(e.cluster))
    }
    result = filterBySeverity(result.map(e => ({ ...e, severity: e.type === 'Warning' ? 'high' : 'info' }))).map(e => {
      const { severity: _severity, ...rest } = e as typeof e & { severity: string }
      return rest
    })
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(e =>
        e.reason.toLowerCase().includes(query) || e.message.toLowerCase().includes(query) ||
        e.object.toLowerCase().includes(query) || e.namespace.toLowerCase().includes(query) ||
        (e.cluster && e.cluster.toLowerCase().includes(query))
      )
    }
    if (selectedNamespace) result = result.filter(e => e.namespace === selectedNamespace)
    if (selectedReason) result = result.filter(e => e.reason === selectedReason)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.reason.toLowerCase().includes(query) || e.message.toLowerCase().includes(query) ||
        e.object.toLowerCase().includes(query) || e.namespace.toLowerCase().includes(query)
      )
    }
    return result
  }, [filter, allEvents, warningEvents, searchQuery, selectedNamespace, selectedReason, globalSelectedClusters, isAllClustersSelected, filterBySeverity, globalCustomFilter])

  // Stats calculation
  const stats = useMemo(() => {
    const warnings = globalFilteredWarningEvents.length
    const errors = globalFilteredErrorEvents.length
    const normal = globalFilteredAllEvents.filter(e => e.type === 'Normal').length
    const reasonCounts = globalFilteredAllEvents.reduce((acc, e) => { acc[e.reason] = (acc[e.reason] || 0) + 1; return acc }, {} as Record<string, number>)
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, MAX_TOP_REASONS).map(([name, value], i) => ({
      name, value, color: getChartColor((i % DONUT_COLOR_BUCKETS) + 1)
    }))
    const clusterCounts = globalFilteredAllEvents.reduce((acc, e) => {
      if (e.cluster) { const name = e.cluster.split('/').pop() || e.cluster; acc[name] = (acc[name] || 0) + 1 }
      return acc
    }, {} as Record<string, number>)
    const clusterData = Object.entries(clusterCounts).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({
      name, value, color: getChartColor((i % DONUT_COLOR_BUCKETS) + 1)
    }))
    const now = new Date()
    const hourlyData: { name: string; value: number; color?: string }[] = []
    for (let i = HOURS_IN_DAY - 1; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * MILLISECONDS_PER_HOUR)
      const hourEnd = new Date(hourStart.getTime() + MILLISECONDS_PER_HOUR)
      const hourTotal = globalFilteredAllEvents.filter(e => {
        const ts = parseEventTime(e.lastSeen)
        return ts !== null && ts >= hourStart && ts < hourEnd
      }).length
      const hourWarnings = globalFilteredAllEvents.filter(e => {
        const ts = parseEventTime(e.lastSeen)
        return ts !== null && ts >= hourStart && ts < hourEnd && e.type === 'Warning'
      }).length
      hourlyData.push({ name: hourStart.getHours().toString().padStart(2, '0') + ':00', value: hourTotal, color: hourWarnings > hourTotal / 2 ? getChartColorByName('warning') : getChartColorByName('primary') })
    }
    const oneHourAgo = new Date(now.getTime() - MILLISECONDS_PER_HOUR)
    const recentCount = globalFilteredAllEvents.filter(e => {
      const ts = parseEventTime(e.lastSeen)
      return ts !== null && ts >= oneHourAgo
    }).length
    return {
      total: globalFilteredAllEvents.length, warnings, errors, normal, recentCount, topReasons, clusterData, hourlyData,
      typeChartData: [{ name: t('events.stats.warnings'), value: warnings, color: getChartColorByName('warning') }, { name: t('common.normal'), value: normal, color: getChartColorByName('success') }].filter(d => d.value > 0)
    }
  }, [globalFilteredAllEvents, globalFilteredWarningEvents, globalFilteredErrorEvents, t])

  // Update cache
  useEffect(() => {
    if (!refreshingAll && stats.total > 0) {
      eventsStatsCache = { total: stats.total, warnings: stats.warnings, errors: stats.errors, normal: stats.normal, recentCount: stats.recentCount }
    }
  }, [refreshingAll, stats.total, stats.warnings, stats.errors, stats.normal, stats.recentCount])

  const displayStats = (stats.total === 0 && eventsStatsCache && eventsStatsCache.total > 0) ? { ...stats, ...eventsStatsCache } : stats

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

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  // Group events by time. Events with missing/invalid timestamps go to "unknownTime"
  // so they never inflate the "Last Hour" bucket (bug #9039).
  const groupedEvents = useMemo(() => {
    const groups: Record<TimelineGroupKey, typeof filteredEvents> = {
      lastHour: [],
      today: [],
      older: [],
      unknownTime: [],
    }
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - MILLISECONDS_PER_HOUR)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    filteredEvents.forEach(event => {
      const eventTime = parseEventTime(event.lastSeen)
      if (eventTime === null) {
        groups.unknownTime.push(event)
      } else if (eventTime >= oneHourAgo) {
        groups.lastHour.push(event)
      } else if (eventTime >= todayStart) {
        groups.today.push(event)
      } else {
        groups.older.push(event)
      }
    })
    return groups
  }, [filteredEvents])

  // Events visible in the list tab, narrowed to the timeline group when the user
  // arrived via "View X more events" (bug #9040).
  const listTabVisibleGroups = useMemo(() => {
    if (timelineGroupContext) {
      return { [timelineGroupContext]: groupedEvents[timelineGroupContext] } as Partial<Record<TimelineGroupKey, typeof filteredEvents>>
    }
    return groupedEvents
  }, [groupedEvents, timelineGroupContext])

  // Flattened list for the "Showing N of M events" counter (bug #9041).
  // Denominator MUST reflect cluster-filtered events, not raw allEvents.
  const visibleListEvents = useMemo(() => {
    const groupsToShow = listTabVisibleGroups
    const out: typeof filteredEvents = []
    ;(Object.keys(groupsToShow) as TimelineGroupKey[]).forEach(key => {
      const list = groupsToShow[key]
      if (list) out.push(...list)
    })
    return out
  }, [listTabVisibleGroups])

  const clearFilters = () => {
    setSelectedNamespace('')
    setSelectedReason('')
    setFilter('all')
    setSearchQuery('')
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
      getStatValue={getStatValue}
      onRefresh={refetchAll}
      isLoading={isLoading}
      isRefreshing={refreshingAll}
      lastUpdated={lastUpdated}
      hasData={displayStats.total > 0}
      isDemoData={eventsIsDemoFallback}
      beforeCards={tabsContent}
      emptyState={{ title: t('events.dashboardTitle'), description: t('events.dashboardDescription') }}
    >
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <button onClick={() => { handleTabSwitch('list'); setFilter('all') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20"><Bell className="w-5 h-5 text-purple-400" /></div>
                <div><div className="text-2xl font-bold text-foreground">{formatStat(stats.total)}</div><div className="text-xs text-muted-foreground">{t('events.stats.total')}</div></div>
              </div>
            </button>
            <button onClick={() => { handleTabSwitch('list'); setFilter('warning') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>
                <div><div className="text-2xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div><div className="text-xs text-muted-foreground">{t('events.stats.warnings')}</div></div>
              </div>
            </button>
            <button onClick={() => { handleTabSwitch('list'); setFilter('normal') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
                <div><div className="text-2xl font-bold text-green-400">{formatStat(stats.normal)}</div><div className="text-xs text-muted-foreground">{t('common.normal')}</div></div>
              </div>
            </button>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20"><Zap className="w-5 h-5 text-blue-400" /></div>
                <div><div className="text-2xl font-bold text-blue-400">{formatStat(stats.recentCount)}</div><div className="text-xs text-muted-foreground">{t('events.stats.lastHour')}</div></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="glass p-4 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.eventTypes')}</div>
              {stats.typeChartData.length > 0 ? <DonutChart data={stats.typeChartData} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noEvents')}</div>}
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.topReasons')}</div>
              {stats.topReasons.length > 0 ? <DonutChart data={stats.topReasons} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noEvents')}</div>}
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.byCluster')}</div>
              {stats.clusterData.length > 0 ? <DonutChart data={stats.clusterData} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noClusterData')}</div>}
            </div>
          </div>

          <div className="glass p-4 rounded-lg">
            <h4 className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.activityLast24h')}</h4>
            <BarChart data={stats.hourlyData} height={BAR_CHART_HEIGHT} color={getChartColorByName('primary')} showGrid={true} />
          </div>

          <div className="glass p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('events.sections.recentWarnings')}</h3>
              <button onClick={() => { handleTabSwitch('list'); setFilter('warning') }} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 px-3 py-2 min-h-11 min-w-11">{t('events.viewAll')} <ChevronRight className="w-3 h-3" /></button>
            </div>
            {globalFilteredWarningEvents.slice(0, MAX_RECENT_WARNINGS_PREVIEW).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />{t('events.empty.noWarnings')}</div>
            ) : (
              <div className="space-y-2">
                {globalFilteredWarningEvents.slice(0, MAX_RECENT_WARNINGS_PREVIEW).map((event, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge color="yellow">{event.reason}</StatusBadge>
                        <span className="text-sm text-foreground truncate">{event.object}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{event.message}</div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen, t)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="glass p-6 rounded-lg">
            <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2"><Calendar className="w-5 h-5" />{t('events.sections.eventTimeline')}</h3>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12"><Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" /><p className="text-muted-foreground">{t('events.empty.noEventsToDisplay')}</p></div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                {(Object.keys(groupedEvents) as TimelineGroupKey[]).map((groupKey) => {
                  const groupEvents = groupedEvents[groupKey]
                  if (groupEvents.length === 0) return null
                  const groupLabel = t(`events.groups.${groupKey}`)
                  return (
                    <div key={groupKey} className="mb-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center z-10"><Clock className="w-4 h-4 text-purple-400" /></div>
                        <h4 className="text-sm font-medium text-foreground">{groupLabel}</h4>
                        <span className="text-xs text-muted-foreground">{t('events.groupCount', { count: groupEvents.length })}</span>
                      </div>
                      <div className="ml-12 space-y-3">
                        {groupEvents.slice(0, MAX_PREVIEW_EVENTS).map((event, i) => (
                          <div key={`${event.object}-${event.reason}-${i}`} className={cn('relative p-4 rounded-lg border-l-4', event.type === 'Warning' ? 'bg-yellow-500/5 border-l-yellow-500' : 'bg-green-500/5 border-l-green-500')}>
                            <div className={cn('absolute -left-8.5 top-5 w-2 h-2 rounded-full', event.type === 'Warning' ? 'bg-yellow-400' : 'bg-green-400')} />
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={cn('text-xs px-2 py-0.5 rounded font-medium', event.type === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>{event.reason}</span>
                                  <span className="text-sm font-medium text-foreground">{event.object}</span>
                                  {event.count > 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted-foreground">{t('events.repeatCount', { count: event.count })}</span>}
                                </div>
                                <p className="text-sm text-muted-foreground">{event.message}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs text-muted-foreground">{event.namespace}</span>
                                  {event.cluster && <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />}
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen, t)}</span>
                            </div>
                          </div>
                        ))}
                        {groupEvents.length > MAX_PREVIEW_EVENTS && (
                          <button
                            onClick={() => {
                              setTimelineGroupContext(groupKey)
                              setActiveTab('list')
                            }}
                            className="text-sm text-purple-400 hover:text-purple-300 ml-4"
                          >
                            {t('events.viewMore', { count: groupEvents.length - MAX_PREVIEW_EVENTS })}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <button onClick={() => setFilter('all')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'all' ? 'ring-2 ring-purple-500' : 'hover:bg-secondary/30')}>
              <div className="text-3xl font-bold text-foreground">{formatStat(stats.total)}</div>
              <div className="text-sm text-muted-foreground">{t('events.stats.total')}</div>
            </button>
            <button onClick={() => setFilter('warning')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'warning' ? 'ring-2 ring-yellow-500' : 'hover:bg-secondary/30')}>
              <div className="text-3xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div>
              <div className="text-sm text-muted-foreground">{t('events.stats.warnings')}</div>
            </button>
            <button onClick={() => setFilter('normal')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'normal' ? 'ring-2 ring-green-500' : 'hover:bg-secondary/30')}>
              <div className="text-3xl font-bold text-green-400">{formatStat(stats.normal)}</div>
              <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
            </button>
          </div>

          <div className="glass p-4 rounded-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label htmlFor="events-namespace-filter" className="block text-xs text-muted-foreground mb-1">{t('common.namespace')}</label>
                <select id="events-namespace-filter" value={selectedNamespace} onChange={(e) => setSelectedNamespace(e.target.value)} className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary">
                  <option value="">{t('events.allNamespaces')}</option>
                  {namespaces.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="events-reason-filter" className="block text-xs text-muted-foreground mb-1">{t('common.reason')}</label>
                <select id="events-reason-filter" value={selectedReason} onChange={(e) => setSelectedReason(e.target.value)} className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary">
                  <option value="">{t('events.allReasons')}</option>
                  {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="events-search" className="block text-xs text-muted-foreground mb-1">{t('events.search')}</label>
                <input type="text" id="events-search" placeholder={t('common.searchEvents')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary" />
              </div>
              {hasActiveFilters && (
                <div>
                  <label className="block text-xs text-transparent mb-1">{t('common.clear')}</label>
                  <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors">{t('events.clearFiltersButton')}</button>
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
                {t('events.showingFiltered', { filtered: visibleListEvents.length, total: globalFilteredAllEvents.length })}
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
                onClick={() => { void refetchAll() }}
                disabled={refreshingAll}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={cn('w-4 h-4', refreshingAll && 'animate-spin')} />
                {t('events.loadError.retry')}
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{t('events.empty.noEventsFound')}</p>
              {!isAllClustersSelected && <p className="text-sm text-muted-foreground mt-1">{t('events.empty.showingFrom', { clusters: (globalSelectedClusters || []).join(', ') })}</p>}
              {hasActiveFilters && <button onClick={clearFilters} className="mt-2 text-sm text-primary hover:underline">{t('events.empty.clearFilters')}</button>}
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
      )}
    </DashboardPage>
  )
}
