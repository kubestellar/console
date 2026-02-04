import { useState, useMemo, useEffect, useCallback } from 'react'
import { Activity, AlertTriangle, Clock, Bell, ChevronRight, CheckCircle2, Calendar, Zap } from 'lucide-react'
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
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const EVENTS_CARDS_KEY = 'kubestellar-events-cards'

// Default cards for the events dashboard
const DEFAULT_EVENTS_CARDS = getDefaultCards('events')

// Module-level cache for events stats (persists across navigation)
interface EventsStatsCache {
  total: number
  warnings: number
  normal: number
  recentCount: number
}
let eventsStatsCache: EventsStatsCache | null = null

type EventFilter = 'all' | 'warning' | 'normal'
type ViewTab = 'overview' | 'timeline' | 'list'

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

export function Events() {
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, filterBySeverity, customFilter: globalCustomFilter } = useGlobalFilters()
  const { drillToAllEvents } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Get events
  const EVENT_LIMIT = 100
  const { events: allEvents, isLoading, isRefreshing: refreshingAll, lastRefresh: allUpdated, refetch: refetchAll } = useCachedEvents(undefined, undefined, { limit: EVENT_LIMIT })
  const warningEvents = useMemo(() => allEvents.filter(e => e.type === 'Warning'), [allEvents])
  const lastUpdated = allUpdated ? new Date(allUpdated) : null

  // Local state
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [filter, setFilter] = useState<EventFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')

  // Events after global filter
  const globalFilteredAllEvents = useMemo(() => {
    let result = allEvents
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
  }, [allEvents, globalSelectedClusters, isAllClustersSelected, globalCustomFilter])

  const globalFilteredWarningEvents = useMemo(() => globalFilteredAllEvents.filter(e => e.type === 'Warning'), [globalFilteredAllEvents])

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

  // Filtered events for list/timeline views
  const filteredEvents = useMemo(() => {
    let result = filter === 'warning' ? warningEvents : allEvents
    if (!isAllClustersSelected) {
      result = result.filter(e => e.cluster && globalSelectedClusters.includes(e.cluster))
    }
    result = filterBySeverity(result.map(e => ({ ...e, severity: e.type === 'Warning' ? 'high' : 'info' }))).map(e => {
      const { severity, ...rest } = e as typeof e & { severity: string }
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
    const normal = globalFilteredAllEvents.filter(e => e.type === 'Normal').length
    const reasonCounts = globalFilteredAllEvents.reduce((acc, e) => { acc[e.reason] = (acc[e.reason] || 0) + 1; return acc }, {} as Record<string, number>)
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value], i) => ({
      name, value, color: ['#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 6]
    }))
    const clusterCounts = globalFilteredAllEvents.reduce((acc, e) => {
      if (e.cluster) { const name = e.cluster.split('/').pop() || e.cluster; acc[name] = (acc[name] || 0) + 1 }
      return acc
    }, {} as Record<string, number>)
    const clusterData = Object.entries(clusterCounts).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({
      name, value, color: ['#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 6]
    }))
    const now = new Date()
    const hourlyData: { name: string; value: number; color?: string }[] = []
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000)
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000)
      const hourTotal = globalFilteredAllEvents.filter(e => e.lastSeen && new Date(e.lastSeen) >= hourStart && new Date(e.lastSeen) < hourEnd).length
      const hourWarnings = globalFilteredAllEvents.filter(e => e.lastSeen && new Date(e.lastSeen) >= hourStart && new Date(e.lastSeen) < hourEnd && e.type === 'Warning').length
      hourlyData.push({ name: hourStart.getHours().toString().padStart(2, '0') + ':00', value: hourTotal, color: hourWarnings > hourTotal / 2 ? '#f59e0b' : '#9333ea' })
    }
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const recentCount = globalFilteredAllEvents.filter(e => e.lastSeen && new Date(e.lastSeen) >= oneHourAgo).length
    return {
      total: globalFilteredAllEvents.length, warnings, normal, recentCount, topReasons, clusterData, hourlyData,
      typeChartData: [{ name: 'Warnings', value: warnings, color: '#f59e0b' }, { name: 'Normal', value: normal, color: '#10b981' }].filter(d => d.value > 0)
    }
  }, [globalFilteredAllEvents, globalFilteredWarningEvents])

  // Update cache
  useEffect(() => {
    if (!refreshingAll && stats.total > 0) {
      eventsStatsCache = { total: stats.total, warnings: stats.warnings, normal: stats.normal, recentCount: stats.recentCount }
    }
  }, [refreshingAll, stats.total, stats.warnings, stats.normal, stats.recentCount])

  const displayStats = (stats.total === 0 && eventsStatsCache && eventsStatsCache.total > 0) ? { ...stats, ...eventsStatsCache } : stats

  const formatEventStat = useCallback((count: number) => {
    const formatted = formatStat(count)
    return count >= EVENT_LIMIT ? `${formatted}+` : formatted
  }, [])

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total': return { value: formatEventStat(displayStats.total), sublabel: 'events', onClick: () => drillToAllEvents(), isClickable: displayStats.total > 0 }
      case 'warnings': return { value: formatEventStat(displayStats.warnings), sublabel: 'warning events', onClick: () => drillToAllEvents('warning'), isClickable: displayStats.warnings > 0 }
      case 'normal': return { value: formatEventStat(displayStats.normal), sublabel: 'normal events', onClick: () => drillToAllEvents('normal'), isClickable: displayStats.normal > 0 }
      case 'recent': return { value: formatEventStat(displayStats.recentCount), sublabel: 'in last hour', onClick: () => drillToAllEvents('recent'), isClickable: displayStats.recentCount > 0 }
      case 'errors': return { value: formatEventStat(displayStats.warnings), sublabel: 'error events', onClick: () => drillToAllEvents('warning'), isClickable: displayStats.warnings > 0 }
      default: return { value: '-', sublabel: '' }
    }
  }, [displayStats, drillToAllEvents, formatEventStat])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Group events by time
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof filteredEvents> = { 'Last Hour': [], 'Today': [], 'Older': [] }
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    filteredEvents.forEach(event => {
      const eventTime = event.lastSeen ? new Date(event.lastSeen) : new Date()
      if (eventTime >= oneHourAgo) groups['Last Hour'].push(event)
      else if (eventTime >= todayStart) groups['Today'].push(event)
      else groups['Older'].push(event)
    })
    return groups
  }, [filteredEvents])

  const clearFilters = () => { setSelectedNamespace(''); setSelectedReason(''); setFilter('all'); setSearchQuery('') }
  const hasActiveFilters = selectedNamespace || selectedReason || filter !== 'all' || searchQuery

  // Tabs - rendered before cards
  const tabsContent = (
    <div className="flex gap-1 mb-6 border-b border-border">
      {[
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'timeline', label: 'Timeline', icon: Clock },
        { id: 'list', label: 'All Events', icon: Bell, count: displayStats.total },
      ].map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ViewTab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors',
              activeTab === tab.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && <span className="px-1.5 py-0.5 text-xs rounded-full bg-card text-muted-foreground">{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <DashboardPage
      title="Events"
      subtitle="Cluster events and activity across your infrastructure"
      icon="Activity"
      storageKey={EVENTS_CARDS_KEY}
      defaultCards={DEFAULT_EVENTS_CARDS}
      statsType="events"
      getStatValue={getStatValue}
      onRefresh={refetchAll}
      isLoading={isLoading}
      isRefreshing={refreshingAll}
      lastUpdated={lastUpdated}
      hasData={displayStats.total > 0}
      beforeCards={tabsContent}
      emptyState={{ title: 'Events Dashboard', description: 'Add cards to monitor Kubernetes events, warnings, and activity across your clusters.' }}
    >
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <button onClick={() => { setActiveTab('list'); setFilter('all') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20"><Bell className="w-5 h-5 text-purple-400" /></div>
                <div><div className="text-2xl font-bold text-foreground">{formatStat(stats.total)}</div><div className="text-xs text-muted-foreground">Total Events</div></div>
              </div>
            </button>
            <button onClick={() => { setActiveTab('list'); setFilter('warning') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>
                <div><div className="text-2xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div><div className="text-xs text-muted-foreground">Warnings</div></div>
              </div>
            </button>
            <button onClick={() => { setActiveTab('list'); setFilter('normal') }} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
                <div><div className="text-2xl font-bold text-green-400">{formatStat(stats.normal)}</div><div className="text-xs text-muted-foreground">Normal</div></div>
              </div>
            </button>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20"><Zap className="w-5 h-5 text-blue-400" /></div>
                <div><div className="text-2xl font-bold text-blue-400">{formatStat(stats.recentCount)}</div><div className="text-xs text-muted-foreground">Last Hour</div></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Event Types</h3>
              {stats.typeChartData.length > 0 ? <DonutChart data={stats.typeChartData} size={150} thickness={20} showLegend={true} /> : <div className="flex items-center justify-center h-[150px] text-muted-foreground">No events</div>}
            </div>
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Top Reasons</h3>
              {stats.topReasons.length > 0 ? <DonutChart data={stats.topReasons} size={150} thickness={20} showLegend={true} /> : <div className="flex items-center justify-center h-[150px] text-muted-foreground">No events</div>}
            </div>
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">By Cluster</h3>
              {stats.clusterData.length > 0 ? <DonutChart data={stats.clusterData} size={150} thickness={20} showLegend={true} /> : <div className="flex items-center justify-center h-[150px] text-muted-foreground">No cluster data</div>}
            </div>
          </div>

          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Event Activity (Last 24 Hours)</h3>
            <BarChart data={stats.hourlyData} height={200} color="#9333ea" showGrid={true} />
          </div>

          <div className="glass p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Recent Warnings</h3>
              <button onClick={() => { setActiveTab('list'); setFilter('warning') }} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></button>
            </div>
            {globalFilteredWarningEvents.slice(0, 5).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />No warnings</div>
            ) : (
              <div className="space-y-2">
                {globalFilteredWarningEvents.slice(0, 5).map((event, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">{event.reason}</span>
                        <span className="text-sm text-foreground truncate">{event.object}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{event.message}</div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen)}</div>
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
            <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2"><Calendar className="w-5 h-5" />Event Timeline</h3>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12"><Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" /><p className="text-muted-foreground">No events to display</p></div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                {Object.entries(groupedEvents).map(([group, groupEvents]) => {
                  if (groupEvents.length === 0) return null
                  return (
                    <div key={group} className="mb-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center z-10"><Clock className="w-4 h-4 text-purple-400" /></div>
                        <h4 className="text-sm font-medium text-foreground">{group}</h4>
                        <span className="text-xs text-muted-foreground">({groupEvents.length} events)</span>
                      </div>
                      <div className="ml-12 space-y-3">
                        {groupEvents.slice(0, 10).map((event, i) => (
                          <div key={`${event.object}-${event.reason}-${i}`} className={cn('relative p-4 rounded-lg border-l-4', event.type === 'Warning' ? 'bg-yellow-500/5 border-l-yellow-500' : 'bg-green-500/5 border-l-green-500')}>
                            <div className={cn('absolute -left-[2.125rem] top-5 w-2 h-2 rounded-full', event.type === 'Warning' ? 'bg-yellow-400' : 'bg-green-400')} />
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={cn('text-xs px-2 py-0.5 rounded font-medium', event.type === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>{event.reason}</span>
                                  <span className="text-sm font-medium text-foreground">{event.object}</span>
                                  {event.count > 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted-foreground">×{event.count}</span>}
                                </div>
                                <p className="text-sm text-muted-foreground">{event.message}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs text-muted-foreground">{event.namespace}</span>
                                  {event.cluster && <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />}
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen)}</span>
                            </div>
                          </div>
                        ))}
                        {groupEvents.length > 10 && <button onClick={() => setActiveTab('list')} className="text-sm text-purple-400 hover:text-purple-300 ml-4">View {groupEvents.length - 10} more events...</button>}
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
              <div className="text-sm text-muted-foreground">Total Events</div>
            </button>
            <button onClick={() => setFilter('warning')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'warning' ? 'ring-2 ring-yellow-500' : 'hover:bg-secondary/30')}>
              <div className="text-3xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div>
              <div className="text-sm text-muted-foreground">Warnings</div>
            </button>
            <button onClick={() => setFilter('normal')} className={cn('glass p-4 rounded-lg text-left transition-all', filter === 'normal' ? 'ring-2 ring-green-500' : 'hover:bg-secondary/30')}>
              <div className="text-3xl font-bold text-green-400">{formatStat(stats.normal)}</div>
              <div className="text-sm text-muted-foreground">Normal</div>
            </button>
          </div>

          <div className="glass p-4 rounded-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label htmlFor="events-namespace-filter" className="block text-xs text-muted-foreground mb-1">Namespace</label>
                <select id="events-namespace-filter" value={selectedNamespace} onChange={(e) => setSelectedNamespace(e.target.value)} className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">All Namespaces</option>
                  {namespaces.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="events-reason-filter" className="block text-xs text-muted-foreground mb-1">Reason</label>
                <select id="events-reason-filter" value={selectedReason} onChange={(e) => setSelectedReason(e.target.value)} className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">All Reasons</option>
                  {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="events-search" className="block text-xs text-muted-foreground mb-1">Search</label>
                <input type="text" id="events-search" placeholder="Search events..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {hasActiveFilters && (
                <div>
                  <label className="block text-xs text-transparent mb-1">Clear</label>
                  <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors">Clear Filters</button>
                </div>
              )}
            </div>
            {hasActiveFilters && <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">Showing {filteredEvents.length} of {allEvents.length} events</div>}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" /></div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No events found</p>
              {!isAllClustersSelected && <p className="text-sm text-muted-foreground mt-1">Showing events from: {globalSelectedClusters.join(', ')}</p>}
              {hasActiveFilters && <button onClick={clearFilters} className="mt-2 text-sm text-primary hover:underline">Clear filters</button>}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEvents).map(([group, groupEvents]) => {
                if (groupEvents.length === 0) return null
                return (
                  <div key={group}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">{group} ({groupEvents.length})</h3>
                    <div className="space-y-2">
                      {groupEvents.map((event, index) => (
                        <div key={`${event.object}-${event.reason}-${index}`} className={`glass p-4 rounded-lg border-l-4 ${event.type === 'Warning' ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
                          <div className="flex items-start gap-3">
                            <div className="mt-1">{getEventIcon(event.type, event.reason)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${event.type === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{event.reason}</span>
                                <span className="text-xs text-muted-foreground">{event.namespace}/{event.object}</span>
                                {event.count > 1 && <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">x{event.count}</span>}
                                {event.cluster && <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />}
                              </div>
                              <p className="text-sm text-foreground mt-1 break-words">{event.message}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground"><span>{getTimeAgo(event.lastSeen)}</span></div>
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
