import { useMemo, useState, useEffect, useRef } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useClusters } from '../../hooks/useMCP'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TICK_COLOR,
} from '../../lib/constants'

interface TimePoint {
  time: string
  timestamp: number
  warnings: number
  normal: number
  total: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS_KEYS: { value: TimeRange; labelKey: string; bucketMinutes: number; numBuckets: number }[] = [
  { value: '15m', labelKey: 'eventsTimeline.range15m', bucketMinutes: 1, numBuckets: 15 },
  { value: '1h', labelKey: 'eventsTimeline.range1h', bucketMinutes: 5, numBuckets: 12 },
  { value: '6h', labelKey: 'eventsTimeline.range6h', bucketMinutes: 30, numBuckets: 12 },
  { value: '24h', labelKey: 'eventsTimeline.range24h', bucketMinutes: 60, numBuckets: 24 },
]

// Group events by time buckets
function groupEventsByTime(events: Array<{ type: string; lastSeen?: string; firstSeen?: string; count: number }>, bucketMinutes = 5, numBuckets = 12): TimePoint[] {
  const now = Date.now()
  const bucketMs = bucketMinutes * 60 * 1000

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
      total: 0,
    })
  }

  // Place events in buckets
  events.forEach(event => {
    const eventTime = event.lastSeen ? new Date(event.lastSeen).getTime() :
                      event.firstSeen ? new Date(event.firstSeen).getTime() : now

    // Find the bucket this event belongs to
    for (let i = 0; i < buckets.length; i++) {
      const bucketStart = buckets[i].timestamp - bucketMs
      const bucketEnd = buckets[i].timestamp

      if (eventTime >= bucketStart && eventTime < bucketEnd) {
        if (event.type === 'Warning') {
          buckets[i].warnings += event.count || 1
        } else {
          buckets[i].normal += event.count || 1
        }
        buckets[i].total += event.count || 1
        break
      }
    }
  })

  return buckets
}

function EventsTimelineInternal() {
  const { t } = useTranslation(['cards', 'common'])
  const TIME_RANGE_OPTIONS = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TIME_RANGE_OPTIONS_KEYS.map(opt => ({ ...opt, label: String(t(opt.labelKey as any)) })),
    [t]
  )
  const {
    events,
    isLoading: hookLoading,
    isDemoFallback,
    isRefreshing,
    lastRefresh,
  } = useCachedEvents(undefined, undefined, { limit: 100, category: 'realtime' })

  const { deduplicatedClusters: clusters } = useClusters()

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading,
    isDemoData: isDemoFallback,
    hasAnyData: events.length > 0,
  })
  const { selectedClusters, isAllClustersSelected, clusterInfoMap } = useGlobalFilters()
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
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
  const reachableClusters = useMemo(() => {
    return clusters.filter(c => c.reachable !== false)
  }, [clusters])

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  // Count filtered clusters for display
  const filteredClusterCount = useMemo(() => {
    if (localClusterFilter.length > 0) return localClusterFilter.length
    return availableClustersForFilter.length
  }, [localClusterFilter, availableClustersForFilter])

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
    let result = events.filter(e => {
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
    return result
  }, [events, selectedClusters, isAllClustersSelected, clusterInfoMap, localClusterFilter])

  // Get time range config
  const timeRangeConfig = TIME_RANGE_OPTIONS.find(t => t.value === timeRange) || TIME_RANGE_OPTIONS[1]

  // Group events into time buckets
  const timeSeriesData = useMemo(() => {
    return groupEventsByTime(filteredEvents, timeRangeConfig.bucketMinutes, timeRangeConfig.numBuckets)
  }, [filteredEvents, timeRangeConfig.bucketMinutes, timeRangeConfig.numBuckets])

  // Calculate totals
  const totalWarnings = timeSeriesData.reduce((sum, d) => sum + d.warnings, 0)
  const totalNormal = timeSeriesData.reduce((sum, d) => sum + d.normal, 0)
  const peakEvents = Math.max(...timeSeriesData.map(d => d.total))

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-2">
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
        <p className="text-sm">{t('eventsTimeline.noEvents')}</p>
        <p className="text-xs mt-1">{t('eventsTimeline.noEventsHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Controls - single row: Time Range → Cluster Filter → Refresh */}
      <div className="flex items-center justify-between mb-3">
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
            minClusters={1}
          />

        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
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
          <div style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }} role="img" aria-label={`Events timeline chart showing ${totalWarnings} warnings and ${totalNormal} normal events, peak ${peakEvents} events`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT_STANDARD}>
            <AreaChart data={timeSeriesData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradientWarnings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientNormal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis
                dataKey="time"
                tick={{ fill: CHART_TICK_COLOR, fontSize: 10 }}
                axisLine={{ stroke: CHART_AXIS_STROKE }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_TICK_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_TOOLTIP_BG,
                  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: CHART_TICK_COLOR }}
              />
              <Area
                type="stepAfter"
                dataKey="warnings"
                stackId="1"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#gradientWarnings)"
                name={t('common:common.warnings')}
              />
              <Area
                type="stepAfter"
                dataKey="normal"
                stackId="1"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#gradientNormal)"
                name={t('common:common.normal')}
              />
            </AreaChart>
          </ResponsiveContainer>
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

export function EventsTimeline() {
  return (
    <DynamicCardErrorBoundary cardId="EventsTimeline">
      <EventsTimelineInternal />
    </DynamicCardErrorBoundary>
  )
}
