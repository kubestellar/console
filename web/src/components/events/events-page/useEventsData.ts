import { useMemo, useEffect } from 'react'
import type { ClusterEvent } from '../../../hooks/mcp/types'
import { getChartColor, getChartColorByName } from '../../../lib/theme/chartColors'
import {
  HOURS_IN_DAY,
  MAX_TOP_REASONS,
  DONUT_COLOR_BUCKETS,
  MILLISECONDS_PER_HOUR,
  getEventSeverity,
  matchesEventQuery,
  parseEventTime,
} from './helpers'
import type { EventFilter, EventsStatsCache, GroupedEvents, TimelineGroupKey, TranslateFn } from './types'

// Module-level cache for events stats (persists across navigation/unmounts).
let eventsStatsCache: EventsStatsCache | null = null

interface UseEventsDataArgs {
  allEvents: ClusterEvent[] | undefined
  isAllClustersSelected: boolean
  globalSelectedClusters: string[]
  filterBySeverity: (events: (ClusterEvent & { severity: string })[]) => (ClusterEvent & { severity: string })[]
  globalCustomFilter: string
  filter: EventFilter
  selectedNamespace: string
  selectedReason: string
  searchQuery: string
  timelineGroupContext: TimelineGroupKey | null
  isLoading: boolean
  refreshingAll: boolean
  t: TranslateFn
}

/** Consolidates the filtering, stats-aggregation, and time-grouping derived state for the
 *  Events dashboard into a single hook, keeping the view component focused on rendering. */
export function useEventsData({
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
}: UseEventsDataArgs) {
  // Events after global filter
  const globalFilteredAllEvents = useMemo(() => {
    let result = allEvents || []
    if (!isAllClustersSelected) {
      result = result.filter(e => e.cluster && globalSelectedClusters.includes(e.cluster))
    }
    result = filterBySeverity(
      result.map(event => ({
        ...event,
        severity: getEventSeverity(event.type),
      }))
    ).map(event => {
      const { severity: _severity, ...rest } = event as ClusterEvent & { severity: string }
      return rest
    })
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(event => matchesEventQuery(event, query))
    }
    return result
  }, [allEvents, isAllClustersSelected, globalSelectedClusters, filterBySeverity, globalCustomFilter])

  const globalFilteredWarningEvents = useMemo(
    () => globalFilteredAllEvents.filter(e => e.type === 'Warning'),
    [globalFilteredAllEvents]
  )
  const globalFilteredErrorEvents = useMemo(
    () => globalFilteredAllEvents.filter(e => e.type === 'Error'),
    [globalFilteredAllEvents]
  )
  const globalFilteredNormalEvents = useMemo(
    () => globalFilteredAllEvents.filter(e => e.type === 'Normal'),
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

  // Filtered events for list/timeline views
  const filteredEvents = useMemo(() => {
    let result = filter === 'warning'
      ? globalFilteredWarningEvents
      : filter === 'normal'
        ? globalFilteredNormalEvents
        : globalFilteredAllEvents

    if (selectedNamespace) result = result.filter(e => e.namespace === selectedNamespace)
    if (selectedReason) result = result.filter(e => e.reason === selectedReason)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(event => matchesEventQuery(event, query))
    }
    return result
  }, [filter, globalFilteredAllEvents, globalFilteredWarningEvents, globalFilteredNormalEvents, searchQuery, selectedNamespace, selectedReason])

  // Stats calculation
  const stats = useMemo(() => {
    const warnings = globalFilteredWarningEvents.length
    const errors = globalFilteredErrorEvents.length
    const normal = globalFilteredNormalEvents.length
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
    const hourlyData: { name: string; value: number; color: string }[] = []
    // Single-pass: bucket events by hour instead of N×M filter scans
    const hourlyTotals = new Array(HOURS_IN_DAY).fill(0)
    const hourlyWarnings = new Array(HOURS_IN_DAY).fill(0)
    const windowStart = now.getTime() - HOURS_IN_DAY * MILLISECONDS_PER_HOUR
    for (const e of globalFilteredAllEvents) {
      const ts = parseEventTime(e.lastSeen)
      if (ts === null || ts.getTime() < windowStart || ts >= now) continue
      const bucket = Math.floor((ts.getTime() - windowStart) / MILLISECONDS_PER_HOUR)
      if (bucket >= 0 && bucket < HOURS_IN_DAY) {
        hourlyTotals[bucket]++
        if (e.type === 'Warning') hourlyWarnings[bucket]++
      }
    }
    for (let i = 0; i < HOURS_IN_DAY; i++) {
      const hourStart = new Date(windowStart + i * MILLISECONDS_PER_HOUR)
      const total = hourlyTotals[i]
      const warns = hourlyWarnings[i]
      hourlyData.push({ name: hourStart.getHours().toString().padStart(2, '0') + ':00', value: total, color: warns > total / 2 ? getChartColorByName('warning') : getChartColorByName('primary') })
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
  }, [globalFilteredAllEvents, globalFilteredWarningEvents, globalFilteredErrorEvents, globalFilteredNormalEvents, t])

  // Update cache
  useEffect(() => {
    if (!refreshingAll && stats.total > 0) {
      eventsStatsCache = { total: stats.total, warnings: stats.warnings, errors: stats.errors, normal: stats.normal, recentCount: stats.recentCount }
      return
    }

    if (!isLoading && !refreshingAll && (allEvents || []).length === 0) {
      eventsStatsCache = null
    }
  }, [allEvents, isLoading, refreshingAll, stats.total, stats.warnings, stats.errors, stats.normal, stats.recentCount])

  const shouldUseCachedStats = isLoading && (allEvents || []).length === 0 && stats.total === 0 && !!eventsStatsCache?.total
  const displayStats = shouldUseCachedStats && eventsStatsCache ? { ...stats, ...eventsStatsCache } : stats

  // Group events by time. Events with missing/invalid timestamps go to "unknownTime"
  // so they never inflate the "Last Hour" bucket (bug #9039).
  const groupedEvents = useMemo(() => {
    const groups: GroupedEvents = {
      lastHour: [],
      today: [],
      older: [],
      unknownTime: [],
    }
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - MILLISECONDS_PER_HOUR)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    ;(filteredEvents || []).forEach(event => {
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
      return { [timelineGroupContext]: groupedEvents[timelineGroupContext] } as Partial<GroupedEvents>
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

  return {
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
  }
}
