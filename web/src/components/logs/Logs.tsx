import { useCallback, useRef, useEffect } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'

const LOGS_CARDS_KEY = 'kubestellar-logs-cards'

// Default cards for the logs dashboard
const DEFAULT_LOGS_CARDS = [
  { type: 'event_stream', title: 'Event Stream', position: { w: 12, h: 4 } },
  { type: 'namespace_events', title: 'Namespace Events', position: { w: 6, h: 3 } },
  { type: 'events_timeline', title: 'Events Timeline', position: { w: 6, h: 3 } },
]

export function Logs() {
  const { clusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters } = useClusters()
  const { events, isLoading: eventsLoading, isRefreshing: eventsRefreshing, lastRefresh, refetch: refetchEvents } = useCachedEvents()
  const warningEvents = events.filter(e => e.type === 'Warning')
  const lastUpdated = lastRefresh ? new Date(lastRefresh) : null
  const isLoading = clustersLoading || eventsLoading
  const isRefreshing = clustersRefreshing || eventsRefreshing

  const { drillToAllEvents, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  const handleRefresh = useCallback(() => {
    refetchClusters()
    refetchEvents()
  }, [refetchClusters, refetchEvents])

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter events by selected clusters
  const filteredEvents = events.filter(e =>
    isAllClustersSelected || globalSelectedClusters.includes(e.cluster || '')
  )
  const filteredWarningEvents = warningEvents.filter(e =>
    isAllClustersSelected || globalSelectedClusters.includes(e.cluster || '')
  )

  // Calculate event stats
  const currentTotalEvents = filteredEvents.length
  const currentWarningCount = filteredWarningEvents.length
  const currentNormalCount = filteredEvents.filter(e => e.type === 'Normal').length
  const currentErrorCount = filteredEvents.filter(e =>
    e.type === 'Warning' && (e.reason?.toLowerCase().includes('error') || e.reason?.toLowerCase().includes('failed'))
  ).length
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const currentRecentCount = filteredEvents.filter(e => {
    if (!e.lastSeen) return false
    const eventTime = new Date(e.lastSeen)
    return eventTime >= oneHourAgo
  }).length

  // Cache stats to prevent showing 0 during refresh
  const cachedStats = useRef({ total: 0, warnings: 0, normal: 0, errors: 0, recent: 0 })
  useEffect(() => {
    if (currentTotalEvents > 0 || currentWarningCount > 0) {
      cachedStats.current = {
        total: currentTotalEvents,
        warnings: currentWarningCount,
        normal: currentNormalCount,
        errors: currentErrorCount,
        recent: currentRecentCount,
      }
    }
  }, [currentTotalEvents, currentWarningCount, currentNormalCount, currentErrorCount, currentRecentCount])

  const totalEvents = currentTotalEvents > 0 ? currentTotalEvents : cachedStats.current.total
  const warningCount = currentWarningCount > 0 || currentTotalEvents > 0 ? currentWarningCount : cachedStats.current.warnings
  const normalCount = currentNormalCount > 0 || currentTotalEvents > 0 ? currentNormalCount : cachedStats.current.normal
  const errorCount = currentErrorCount >= 0 && currentTotalEvents > 0 ? currentErrorCount : cachedStats.current.errors
  const recentCount = currentRecentCount >= 0 && currentTotalEvents > 0 ? currentRecentCount : cachedStats.current.recent

  // Stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: reachableClusters.length, sublabel: 'monitored', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'total':
        return { value: totalEvents, sublabel: 'events', onClick: () => drillToAllEvents(), isClickable: totalEvents > 0 }
      case 'warnings':
        return { value: warningCount, sublabel: 'warning events', onClick: () => drillToAllEvents('warning'), isClickable: warningCount > 0 }
      case 'normal':
        return { value: normalCount, sublabel: 'normal events', onClick: () => drillToAllEvents('normal'), isClickable: normalCount > 0 }
      case 'recent':
        return { value: recentCount, sublabel: 'in last hour', onClick: () => drillToAllEvents('recent'), isClickable: recentCount > 0 }
      case 'errors':
        return { value: errorCount, sublabel: 'error events', onClick: () => drillToAllEvents('error'), isClickable: errorCount > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters.length, totalEvents, warningCount, normalCount, recentCount, errorCount, drillToAllEvents, drillToAllClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Logs & Events"
      subtitle="Monitor cluster events and application logs"
      icon="ScrollText"
      storageKey={LOGS_CARDS_KEY}
      defaultCards={DEFAULT_LOGS_CARDS}
      statsType="events"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      emptyState={{
        title: 'Logs & Events Dashboard',
        description: 'Add cards to monitor Kubernetes events, application logs, and system messages across your clusters.',
      }}
    />
  )
}
