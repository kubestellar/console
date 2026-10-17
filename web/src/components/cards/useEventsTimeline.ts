import { useState, useMemo } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { useLocalClusterFilter } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import {
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE } from '../../lib/constants'
import { AMBER_500, GREEN_500_BRIGHT, hexToRgba } from '../../lib/theme/chartColors'

interface TimePoint {
  time: string
  timestamp: number
  warnings: number
  normal: number
  total: number
}

export type TimeRange = '15m' | '1h' | '6h' | '24h'
type TimeRangeTranslationKey = 'cards:eventsTimeline.range15m' | 'cards:eventsTimeline.range1h' | 'cards:eventsTimeline.range6h' | 'cards:eventsTimeline.range24h'
type EventTimelineDatum = { type: string; lastSeen?: string; firstSeen?: string; count?: number | string }
type EventTimelineTooltipParam = {
  seriesName: string
  value: number | string | number[]
  color?: string
  axisValueLabel?: string
  dataIndex: number
  marker?: string
}

const DEFAULT_TIME_RANGE: TimeRange = '1h'
const CHART_Y_AXIS_MIN_INTERVAL = 1

const TIME_RANGE_OPTIONS_KEYS: { value: TimeRange; labelKey: TimeRangeTranslationKey; bucketMinutes: number; numBuckets: number }[] = [
  { value: '15m', labelKey: 'cards:eventsTimeline.range15m', bucketMinutes: 1, numBuckets: 15 },
  { value: '1h', labelKey: 'cards:eventsTimeline.range1h', bucketMinutes: 5, numBuckets: 12 },
  { value: '6h', labelKey: 'cards:eventsTimeline.range6h', bucketMinutes: 30, numBuckets: 12 },
  { value: '24h', labelKey: 'cards:eventsTimeline.range24h', bucketMinutes: 60, numBuckets: 24 },
]

const TIME_RANGE_BUCKETS: Record<TimeRange, { bucketMinutes: number; numBuckets: number }> = {
  '15m': { bucketMinutes: 1, numBuckets: 15 },
  '1h': { bucketMinutes: 5, numBuckets: 12 },
  '6h': { bucketMinutes: 30, numBuckets: 12 },
  '24h': { bucketMinutes: 60, numBuckets: 24 },
}

const EVENTS_TIMELINE_WARNING_COLOR = AMBER_500
const EVENTS_TIMELINE_SUCCESS_COLOR = GREEN_500_BRIGHT
const EVENTS_TIMELINE_AREA_GRADIENT_START_ALPHA = 0.3
const EVENTS_TIMELINE_AREA_GRADIENT_END_ALPHA = 0
const WARNING_AREA_GRADIENT_START = hexToRgba(EVENTS_TIMELINE_WARNING_COLOR, EVENTS_TIMELINE_AREA_GRADIENT_START_ALPHA)
const WARNING_AREA_GRADIENT_END = hexToRgba(EVENTS_TIMELINE_WARNING_COLOR, EVENTS_TIMELINE_AREA_GRADIENT_END_ALPHA)
const SUCCESS_AREA_GRADIENT_START = hexToRgba(EVENTS_TIMELINE_SUCCESS_COLOR, EVENTS_TIMELINE_AREA_GRADIENT_START_ALPHA)
const SUCCESS_AREA_GRADIENT_END = hexToRgba(EVENTS_TIMELINE_SUCCESS_COLOR, EVENTS_TIMELINE_AREA_GRADIENT_END_ALPHA)

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

export function useEventsTimeline() {
  const { t } = useTranslation(['cards', 'common'])
  const TIME_RANGE_OPTIONS = useMemo(
    () => TIME_RANGE_OPTIONS_KEYS.map(opt => ({ ...opt, label: String(t(opt.labelKey)) })),
    [t]
  )
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
  const clusters = useMemo(() => Array.isArray(rawClusters) ? rawClusters : [], [rawClusters])

  // Inputs for useCardLoadingState — the card component calls it so
  // CardWrapper state wiring stays in the top-level card file.
  const hasData = (events || []).length > 0
  const cardLoadingInput = {
    isLoading: hookLoading && !hasData,
    isDemoData: isDemoMode || isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isRefreshing }
  const {
    selectedClusters: rawSelectedClusters,
    isAllClustersSelected = true,
    clusterInfoMap: rawClusterInfoMap,
  } = useGlobalFilters()
  const selectedClusters = useMemo(() => Array.isArray(rawSelectedClusters) ? rawSelectedClusters : [], [rawSelectedClusters])
  const clusterInfoMap = useMemo(() => rawClusterInfoMap || {}, [rawClusterInfoMap])
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE)
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useLocalClusterFilter()

  // Get reachable clusters
  const reachableClusters = useMemo(
    () => (clusters || []).filter(c => c.reachable !== false),
    [clusters]
  )

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [isAllClustersSelected, reachableClusters, selectedClusters])

  // Count filtered clusters for display
  const filteredClusterCount = localClusterFilter.length > 0
    ? localClusterFilter.length
    : availableClustersForFilter.length

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
  const chartTimePoints = timeSeriesData
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
      axisPointer: { type: 'shadow' as const },
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_BODY_FONT_SIZE },
      formatter: (params: EventTimelineTooltipParam[] | EventTimelineTooltipParam) => {
        const list = Array.isArray(params) ? params : [params]
        if (list.length === 0) return ''

        const dataIndex = list[0]?.dataIndex ?? -1
        const point = dataIndex >= 0 ? chartTimePoints[dataIndex] : undefined
        const header = point?.time ?? list[0]?.axisValueLabel ?? ''
        const total = point?.total ?? list.reduce((sum, param) => {
          const value = Array.isArray(param.value) ? Number(param.value[1]) : Number(param.value)
          return sum + (Number.isFinite(value) ? value : 0)
        }, 0)
        const lines = list.map(param => {
          const value = Array.isArray(param.value) ? Number(param.value[1]) : Number(param.value)
          const safeValue = Number.isFinite(value) ? value : 0
          return `${param.marker ?? ''}${param.seriesName}: <b>${safeValue}</b>`
        }).join('<br/>')

        return `<div style="font-size:${CHART_BODY_FONT_SIZE}px"><b>${header}</b><br/>${lines}<br/><span style="color:${CHART_TICK_COLOR}">Total: <b>${total}</b></span></div>`
      },
    },
    series: [
      {
        name: t('common:common.warnings'),
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: warningSeriesData || [],
        lineStyle: { color: EVENTS_TIMELINE_WARNING_COLOR, width: 2 },
        itemStyle: { color: EVENTS_TIMELINE_WARNING_COLOR },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: WARNING_AREA_GRADIENT_START },
              { offset: 1, color: WARNING_AREA_GRADIENT_END },
            ],
          },
        },
        showSymbol: false,
        emphasis: { focus: 'series' as const },
      },
      {
        name: t('common:common.normal'),
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: normalSeriesData || [],
        lineStyle: { color: EVENTS_TIMELINE_SUCCESS_COLOR, width: 2 },
        itemStyle: { color: EVENTS_TIMELINE_SUCCESS_COLOR },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: SUCCESS_AREA_GRADIENT_START },
              { offset: 1, color: SUCCESS_AREA_GRADIENT_END },
            ],
          },
        },
        showSymbol: false,
        emphasis: { focus: 'series' as const },
      },
    ],
  }), [chartTimePoints, chartXAxisData, normalSeriesData, t, warningSeriesData])

  return {
    t,
    TIME_RANGE_OPTIONS,
    isRefreshing,
    lastRefresh,
    cardLoadingInput,
    timeRange,
    setTimeRange,
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    availableClustersForFilter,
    filteredClusterCount,
    filteredEvents,
    totalWarnings,
    totalNormal,
    peakEvents,
    chartOption,
  }
}
