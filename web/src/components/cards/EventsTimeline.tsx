import { memo, useState, useEffect, useRef, useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE } from '../../lib/constants'

interface TimePoint {
  time: string
  timestamp: number
  warnings: number
  normal: number
  total: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'
type TimeRangeTranslationKey = 'cards:eventsTimeline.range15m' | 'cards:eventsTimeline.range1h' | 'cards:eventsTimeline.range6h' | 'cards:eventsTimeline.range24h'
type EventTimelineDatum = { type: string; lastSeen?: string; firstSeen?: string; count?: number | string }

const DEFAULT_TIME_RANGE: TimeRange = '1h'
const CHART_Y_AXIS_MIN_INTERVAL = 1
const CLUSTER_FILTER_MIN_CLUSTERS = 1

const TIME_RANGE_OPTIONS_KEYS: { value: TimeRange; labelKey: TimeRangeTranslationKey; bucketMinutes: number; numBuckets: number }[] = [
  { value: '15m', labelKey: 'cards:eventsTimeline.range15m', bucketMinutes: 1, numBuckets: 15 },
  { value: '1h', labelKey: 'cards:eventsTimeline.range1h', bucketMinutes: 5, numBuckets: 12 },
  { value: '6h', labelKey: 'cards:eventsTimeline.range6h', bucketMinutes: 30, numBuckets: 12 },
  { value: '24h', labelKey: 'cards:eventsTimeline.range24h', bucketMinutes: 60, numBuckets: 24 },
]
const CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const

const TIME_RANGE_BUCKETS: Record<TimeRange, { bucketMinutes: number; numBuckets: number }> = {
  '15m': { bucketMinutes: 1, numBuckets: 15 },
  '1h': { bucketMinutes: 5, numBuckets: 12 },
  '6h': { bucketMinutes: 30, numBuckets: 12 },
  '24h': { bucketMinutes: 60, numBuckets: 24 },
}

const WARNING_AREA_GRADIENT_END = 'color-mix(in srgb, var(--chart-warning) 0%, transparent)'
const SUCCESS_AREA_GRADIENT_END = 'color-mix(in srgb, var(--chart-success) 0%, transparent)'

function getEventCount(count?: number | string): number {
  const numericCount = Number(count)
  return Number.isFinite(numericCount) && numericCount > 0 ? numericCount : 1
}

// Group events by time buckets
function groupEventsByTime(events: EventTimelineDatum[], bucketMinutes = 5, numBuckets = 12): TimePoint[] {
  const now = Date.now()
  const bucketMs = bucketMinutes * MS_PER_MINUTE

  // Initialize buckets
  const buckets: TimePoint[] = []
  for (let i = numBuckets - 1; i >= 0; i--) {
    const bucketTime = now - (i * bucketMs)
    const date = new Date(bucketTime)
    buckets.push({
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: bucketTime,
      warnings: 0,
      normal: 0,
      total: 0 })
  }

  // Place events in buckets
  ;(events || []).forEach(event => {
    const eventTime = event.lastSeen ? new Date(event.lastSeen).getTime() :
                      event.firstSeen ? new Date(event.firstSeen).getTime() : now
    const eventCount = getEventCount(event.count)

    // Find the bucket this event belongs to
    for (let i = 0; i < buckets.length; i++) {
      const bucketStart = buckets[i].timestamp - bucketMs
      const bucketEnd = buckets[i].timestamp

      if (eventTime >= bucketStart && eventTime < bucketEnd) {
        if (event.type === 'Warning') {
          buckets[i].warnings += eventCount
        } else {
          buckets[i].normal += eventCount
        }
        buckets[i].total += eventCount
        break
      }
    }
  })

  return buckets
}

function EventsTimelineInternal() {
  const { t } = useTranslation(['cards', 'common'])
  const TIME_RANGE_OPTIONS = TIME_RANGE_OPTIONS_KEYS.map(opt => ({ ...opt, label: String(t(opt.labelKey)) }))
  const { isDemoMode } = useDemoMode()
  const {
    events: rawEvents,
    isLoading: hookLoading,
    isDemoFallback,
    isRefreshing,
    lastRefresh,
    isFailed,
    consecutiveFailures } = useCachedEvents(undefined, undefined, { limit: 100, category: 'realtime' })
  const events = useMemo(() => Array.isArray(rawEvents) ? rawEvents : [], [rawEvents])

  const { deduplicatedClusters: rawClusters } = useClusters()
  const clusters = Array.isArray(rawClusters) ? rawClusters : []

  // Report state to CardWrapper for refresh animation
  const hasData = (events || []).length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isDemoData: isDemoMode || isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isRefreshing })
  const {
    selectedClusters: rawSelectedClusters = [],
    isAllClustersSelected = true,
    clusterInfoMap: rawClusterInfoMap = {},
  } = useGlobalFilters()
  const selectedClusters = Array.isArray(rawSelectedClusters) ? rawSelectedClusters : []
  const clusterInfoMap = rawClusterInfoMap || {}
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE)
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get reachable clusters
  const reachableClusters = (clusters || []).filter(c => c.reachable !== false)

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [isAllClustersSelected, reachableClusters, selectedClusters])

  // Count filtered clusters for display
  const filteredClusterCount = localClusterFilter.length > 0
    ? localClusterFilter.length
    : availableClustersForFilter.length

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Filter events by selected clusters AND exclude offline/unreachable clusters
  const filteredEvents = useMemo(() => {
    // First filter to only events from reachable clusters
    let result = (events || []).filter(e => {
      if (!e.cluster) return true // Include events without cluster info
      const clusterInfo = clusterInfoMap[e.cluster]
      return !clusterInfo || clusterInfo.reachable !== false
    })
    if (!isAllClustersSelected) {
      result = result.filter(e => e.cluster && selectedClusters.includes(e.cluster))
    }
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(e => e.cluster && localClusterFilter.includes(e.cluster))
    }
    // Sort by lastSeen descending (newest first) to ensure recent events are prioritized
    result.sort((a, b) => {
      const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : a.firstSeen ? new Date(a.firstSeen).getTime() : 0
      const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : b.firstSeen ? new Date(b.firstSeen).getTime() : 0
      return timeB - timeA
    })
    return result
  }, [events, clusterInfoMap, isAllClustersSelected, selectedClusters, localClusterFilter])

  // Group events into time buckets
  const timeSeriesData = useMemo(() => {
    const { bucketMinutes, numBuckets } = TIME_RANGE_BUCKETS[timeRange] || TIME_RANGE_BUCKETS[DEFAULT_TIME_RANGE]
    return groupEventsByTime(filteredEvents, bucketMinutes, numBuckets)
  }, [filteredEvents, timeRange])
  const chartTimePoints = timeSeriesData || []
  const chartXAxisData = useMemo(() => (chartTimePoints || []).map(point => point.time), [chartTimePoints])
  const warningSeriesData = useMemo(() => (chartTimePoints || []).map(point => point.warnings), [chartTimePoints])
  const normalSeriesData = useMemo(() => (chartTimePoints || []).map(point => point.normal), [chartTimePoints])
  const totalSeriesData = useMemo(() => (chartTimePoints || []).map(point => point.total), [chartTimePoints])

  // Calculate totals from all filtered events (not just those in time buckets)
  const totalWarnings = useMemo(() => 
    (filteredEvents || []).reduce((sum, e) => sum + (e.type === 'Warning' ? getEventCount(e.count) : 0), 0),
    [filteredEvents]
  )
  const totalNormal = useMemo(() =>
    (filteredEvents || []).reduce((sum, e) => sum + (e.type !== 'Warning' ? getEventCount(e.count) : 0), 0),
    [filteredEvents]
  )
  const peakEvents = Math.max(0, ...(totalSeriesData || []))

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: chartXAxisData || [],
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: CHART_Y_AXIS_MIN_INTERVAL,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_BODY_FONT_SIZE },
    },
    series: [
      {
        name: t('common:common.warnings'),
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: warningSeriesData || [],
        lineStyle: { color: 'var(--chart-warning)', width: 2 },
        itemStyle: { color: 'var(--chart-warning)' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'var(--chart-warning-opaque)' },
              { offset: 1, color: WARNING_AREA_GRADIENT_END },
            ],
          },
        },
        showSymbol: false,
      },
      {
        name: t('common:common.normal'),
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: normalSeriesData || [],
        lineStyle: { color: 'var(--chart-success)', width: 2 },
        itemStyle: { color: 'var(--chart-success)' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'var(--chart-success-opaque)' },
              { offset: 1, color: SUCCESS_AREA_GRADIENT_END },
            ],
          },
        },
        showSymbol: false,
      },
    ],
  }), [chartXAxisData, normalSeriesData, t, warningSeriesData])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={160} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{t('eventsTimeline.noEvents')}</p>
        <p className="text-xs mt-1">{t('eventsTimeline.noEventsHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Controls - single row: Time Range -> Cluster Filter -> Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filteredClusterCount}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Filter */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground cursor-pointer"
              title={t('eventsTimeline.selectTimeRange')}
            >
              {TIME_RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Cluster Filter */}
          <CardClusterFilter
            availableClusters={availableClustersForFilter}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={() => setLocalClusterFilter([])}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={CLUSTER_FILTER_MIN_CLUSTERS}
          />

        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-orange-400" aria-hidden="true" />
            <span className="text-xs text-orange-400">{t('common:common.warnings')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{totalWarnings}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" aria-hidden="true" />
            <span className="text-xs text-green-400">{t('common:common.normal')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{totalNormal}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{t('eventsTimeline.peak')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{peakEvents}</span>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="flex-1 min-h-[160px]">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('eventsTimeline.noEventsInRange')}
          </div>
        ) : (
          <div style={CHART_CONTAINER_STYLE} role="img" aria-label={`Events timeline chart showing ${totalWarnings} warnings and ${totalNormal} normal events, peak ${peakEvents} events`}>
            <LazyEChart
              option={chartOption}
              style={CHART_STYLE}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
          <span className="text-muted-foreground">{t('common:common.warnings')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500/60" />
          <span className="text-muted-foreground">{t('common:common.normal')}</span>
        </div>
      </div>
    </div>
  )
}

export const EventsTimeline = memo(function EventsTimeline() {
  return (
    <DynamicCardErrorBoundary cardId="EventsTimeline">
      <EventsTimelineInternal />
    </DynamicCardErrorBoundary>
  )
})
