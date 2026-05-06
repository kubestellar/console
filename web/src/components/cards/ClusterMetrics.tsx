import { useState, useMemo, useEffect, useRef, Suspense, memo } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { useClusters } from '../../hooks/useMCP'
import { CLUSTER_POLL_INTERVAL_MS } from '../../hooks/mcp/shared'
import { Server, Clock, Layers, TrendingUp } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'

type TimeRange = '15m' | '1h' | '6h' | '24h'

// History buffer is rebuilt client-side from live polling — nothing is
// persisted beyond the localStorage TTL below. MAX_HISTORY_POINTS bounds the
// buffer size, and at the shared cluster poll interval the buffer can span at
// most MAX_HISTORY_DURATION_MS of wall-clock time. Any time-range option
// larger than that can never have data, so we hide it from the selector
// (fixes issue #6048).
const MAX_HISTORY_POINTS = 60                                                  // buffer cap (points)
const MAX_HISTORY_DURATION_MS = MAX_HISTORY_POINTS * CLUSTER_POLL_INTERVAL_MS  // max wall-clock span of buffer
const MIN_POINT_SPACING_MS = 30 * MS_PER_SECOND
const FIFTEEN_MIN_MS = 15 * MS_PER_MINUTE
const SIX_HOURS_MS = 6 * MS_PER_HOUR
const TWENTY_FOUR_HOURS_MS = MS_PER_DAY

const LEGACY_15M_POINTS = 15
const LEGACY_15M_INTERVAL_MS = MS_PER_MINUTE
const LEGACY_1H_POINTS = 20
const LEGACY_1H_INTERVAL_MS = 3 * MS_PER_MINUTE
const LEGACY_6H_POINTS = 24
const LEGACY_6H_INTERVAL_MS = 15 * MS_PER_MINUTE
const LEGACY_24H_POINTS = 24
const LEGACY_24H_INTERVAL_MS = MS_PER_HOUR

/** Height (px) of the chart area — used for both the chart and its Suspense fallback */
const CHART_AREA_MIN_HEIGHT = 160

const CHART_AREA_STYLE = { minHeight: CHART_AREA_MIN_HEIGHT } as const
const CHART_FALLBACK_STYLE = { height: CHART_AREA_MIN_HEIGHT } as const

/** Metric name display threshold before truncation */
const MAX_METRIC_NAME_DISPLAY = 15
/** Length to truncate metric names to when they exceed the display threshold */
const TRUNCATED_METRIC_NAME = 12

const TIME_RANGE_KEYS: Array<{
  value: TimeRange
  labelKey:
    | 'clusterMetrics.timeRange15m'
    | 'clusterMetrics.timeRange1h'
    | 'clusterMetrics.timeRange6h'
    | 'clusterMetrics.timeRange24h'
  points: number
  intervalMs: number
  rangeMs: number
}> = [
  { value: '15m', labelKey: 'clusterMetrics.timeRange15m', points: LEGACY_15M_POINTS, intervalMs: LEGACY_15M_INTERVAL_MS, rangeMs: FIFTEEN_MIN_MS },
  { value: '1h', labelKey: 'clusterMetrics.timeRange1h', points: LEGACY_1H_POINTS, intervalMs: LEGACY_1H_INTERVAL_MS, rangeMs: MS_PER_HOUR },
  { value: '6h', labelKey: 'clusterMetrics.timeRange6h', points: LEGACY_6H_POINTS, intervalMs: LEGACY_6H_INTERVAL_MS, rangeMs: SIX_HOURS_MS },
  { value: '24h', labelKey: 'clusterMetrics.timeRange24h', points: LEGACY_24H_POINTS, intervalMs: LEGACY_24H_INTERVAL_MS, rangeMs: TWENTY_FOUR_HOURS_MS },
]

// Only expose time ranges the client-side history buffer can actually cover.
// At CLUSTER_POLL_INTERVAL_MS = 60s and MAX_HISTORY_POINTS = 60, this yields
// a 60-minute ceiling — so '15m' and '1h' remain, while '6h' and '24h' are
// filtered out (they would always render as sparse/empty, issue #6048).
export const SUPPORTED_TIME_RANGE_KEYS = TIME_RANGE_KEYS.filter(
  (opt) => opt.rangeMs <= MAX_HISTORY_DURATION_MS,
)

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '15m': FIFTEEN_MIN_MS,
  '1h': MS_PER_HOUR,
  '6h': SIX_HOURS_MS,
  '24h': TWENTY_FOUR_HOURS_MS,
}

const SUPPORTED_TIME_RANGE_VALUES = new Set<TimeRange>(
  SUPPORTED_TIME_RANGE_KEYS.map((opt) => opt.value),
)
const DEFAULT_TIME_RANGE: TimeRange =
  SUPPORTED_TIME_RANGE_KEYS[SUPPORTED_TIME_RANGE_KEYS.length - 1]?.value ?? '15m'


type MetricType = 'cpu' | 'memory' | 'pods' | 'nodes'
type ChartMode = 'total' | 'per-cluster'

const metricConfigBase = {
  cpu: { labelKey: 'clusterMetrics.cpuCores' as const, color: '#9333ea', unit: '', baseValue: 65, variance: 30 },
  memory: { labelKey: 'clusterMetrics.memory' as const, color: '#3b82f6', unit: ' GB', baseValue: 72, variance: 20 },
  pods: { labelKey: 'clusterMetrics.pods' as const, color: '#10b981', unit: '', baseValue: 150, variance: 100 },
  nodes: { labelKey: 'clusterMetrics.nodes' as const, color: '#f59e0b', unit: '', baseValue: 10, variance: 5 } }

interface ClusterMetricValues {
  cpu: number
  memory: number
  pods: number
  nodes: number
}

interface MetricPoint {
  time: string
  timestamp: number
  cpu: number
  memory: number
  pods: number
  nodes: number
  // Per-cluster values for comparison mode
  clusters?: Record<string, ClusterMetricValues>
}

// Lazy-load chart components to defer the echarts vendor chunk (~1.14 MB)
// from the critical loading path. The card itself stays eager — only the
// chart subtrees are deferred behind React.lazy + Suspense.
const LazyTimeSeriesChart = safeLazy(() => import('../charts/TimeSeriesChart'), 'TimeSeriesChart')
const LazyMultiSeriesChart = safeLazy(() => import('../charts/TimeSeriesChart'), 'MultiSeriesChart')

const STORAGE_KEY = 'cluster-metrics-history'
// Keep saved history at least as long as the live buffer can span, so that a
// page reload does not discard recent points that would still be visible.
const MAX_AGE_MS = MAX_HISTORY_DURATION_MS

export const ClusterMetrics = memo(function ClusterMetrics() {
  const { t } = useTranslation(['cards', 'common'])
  const { isLoading, isRefreshing, deduplicatedClusters, isFailed, consecutiveFailures } = useClusters()
  const { isDemoMode } = useDemoMode()
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('cpu')
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE)
  const [chartMode, setChartMode] = useState<ChartMode>('total')

  // If an unsupported range was somehow persisted (e.g. older build), clamp
  // it on mount to the default supported range.
  useEffect(() => {
    if (!SUPPORTED_TIME_RANGE_VALUES.has(timeRange)) {
      setTimeRange(DEFAULT_TIME_RANGE)
    }
  }, [timeRange])

  // Build translated metric config and time range options
  const metricConfig = (() => {
    const result: Record<MetricType, { label: string; color: string; unit: string; baseValue: number; variance: number }> = {} as typeof result
    for (const [key, val] of Object.entries(metricConfigBase)) {
      result[key as MetricType] = { ...val, label: String(t(val.labelKey)) }
    }
    return result
  })()

  const TIME_RANGE_OPTIONS = SUPPORTED_TIME_RANGE_KEYS.map(opt => ({ ...opt, label: String(t(opt.labelKey)) }))

  // Report state to CardWrapper for refresh animation
  const hasData = deduplicatedClusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })

  // Use shared chart filters hook for cluster filtering
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters: availableClustersForFilter,
    filteredClusters: clusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({ storageKey: 'cluster-metrics' })

  // Load history from localStorage
  const loadSavedHistory = (): MetricPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: MetricPoint[]; timestamp: number }
        // Guard: validate parsed.data is an array before using it.
        // Malformed or legacy localStorage data could return a non-array
        // value (e.g. undefined, null, or an object), which would cause
        // history.filter() to throw a TypeError during render.
        if (Date.now() - parsed.timestamp < MAX_AGE_MS && Array.isArray(parsed.data)) {
          return parsed.data
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }

  const initialHistory = loadSavedHistory()
  const historyRef = useRef<MetricPoint[]>(initialHistory)
  const [history, setHistory] = useState<MetricPoint[]>(initialHistory)

  // Save history to localStorage when it changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now() }))
      } catch {
        // Ignore storage errors
      }
    }
  }, [history])

  // Calculate real current values from cluster data
  const realValues = useMemo(() => {
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    return { cpu: totalCPUs, memory: totalMemoryGB, pods: totalPods, nodes: totalNodes }
  }, [clusters])

  // Check if we have real data
  const hasRealData = clusters.some(c => c.cpuCores !== undefined || c.memoryGB !== undefined)

  // Track data points over time - add new point when values change
  useEffect(() => {
    if (isLoading || !hasRealData) return
    if (realValues.nodes === 0 && realValues.cpu === 0) return

    const now = Date.now()
    // Build per-cluster values for comparison mode
    const clusterValues: Record<string, ClusterMetricValues> = {}
    clusters.forEach(c => {
      clusterValues[c.name] = {
        cpu: c.cpuCores || 0,
        memory: c.memoryGB || 0,
        pods: c.podCount || 0,
        nodes: c.nodeCount || 0 }
    })
    const newPoint: MetricPoint = {
      time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now,
      cpu: realValues.cpu,
      memory: realValues.memory,
      pods: realValues.pods,
      nodes: realValues.nodes,
      clusters: clusterValues }

    // Only add if data changed or at least MIN_POINT_SPACING_MS since last point
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      (now - lastPoint.timestamp > MIN_POINT_SPACING_MS) ||
      lastPoint.cpu !== newPoint.cpu ||
      lastPoint.memory !== newPoint.memory ||
      lastPoint.pods !== newPoint.pods ||
      lastPoint.nodes !== newPoint.nodes

    if (shouldAdd) {
      // Cap buffer at MAX_HISTORY_POINTS — at CLUSTER_POLL_INTERVAL_MS this
      // caps the wall-clock span at MAX_HISTORY_DURATION_MS.
      const newHistory = [...historyRef.current, newPoint].slice(-MAX_HISTORY_POINTS)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [realValues, isLoading, hasRealData, clusters])

  // Transform history to chart data for selected metric
  const data = (() => {
    // Filter history based on time range
    const now = Date.now()
    const rangeMs = TIME_RANGE_MS[timeRange]

    const filteredHistory = history.filter(p => now - p.timestamp <= rangeMs)

    return filteredHistory.map(point => ({
      time: point.time,
      value: point[selectedMetric] }))
  })()

  // Generate per-cluster data for comparison mode
  const perClusterData = useMemo(() => {
    if (chartMode !== 'per-cluster') return { data: [], series: [] }

    const now = Date.now()
    const rangeMs = TIME_RANGE_MS[timeRange]

    const filteredHistory = history.filter(p => now - p.timestamp <= rangeMs && p.clusters)

    // Get all unique cluster names from history
    const clusterNames = new Set<string>()
    filteredHistory.forEach(point => {
      if (point.clusters) {
        Object.keys(point.clusters).forEach(name => clusterNames.add(name))
      }
    })

    // Colors for different clusters
    const clusterColors = [
      '#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
      '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899',
    ]

    // Build series config
    const series = Array.from(clusterNames).map((name, i) => ({
      dataKey: name,
      color: clusterColors[i % clusterColors.length],
      name: name.length > MAX_METRIC_NAME_DISPLAY ? name.slice(0, TRUNCATED_METRIC_NAME) + '...' : name }))

    // Build data with all clusters as keys
    const chartData = filteredHistory.map(point => {
      const entry: { time: string; value: number; [key: string]: string | number } = {
        time: point.time,
        value: 0, // Required by DataPoint interface, not used by MultiSeriesChart
      }
      clusterNames.forEach(name => {
        const clusterData = point.clusters?.[name]
        // Use null for missing data so the chart renders gaps instead of
        // artificial zero drops (#6874).
        entry[name] = clusterData ? clusterData[selectedMetric] : null as unknown as number
      })
      return entry
    })

    return { data: chartData, series }
  }, [history, selectedMetric, timeRange, chartMode])

  const config = metricConfig[selectedMetric]
  // Use real current value if non-zero, otherwise fall back to the last
  // known non-null chart value so the header stays in sync with the chart
  // instead of showing a misleading 0 during temporary data loss (#6875).
  const currentValue = (() => {
    const live = hasRealData ? realValues[selectedMetric] : 0
    if (live > 0) return live
    // Walk backwards through chart data to find the last non-null value
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]?.value != null && data[i].value > 0) return data[i].value
    }
    return 0
  })()

  return (
    <div className="h-full flex flex-col">
      {/* Header with metric value and selector — @container responsive */}
      <div className="flex flex-wrap @lg:flex-nowrap items-center justify-between gap-y-2 mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
          <p className="text-2xl font-bold text-foreground">
            {selectedMetric === 'memory' ? realValues.memory.toFixed(1) : Math.round(currentValue)}<span className="text-sm text-muted-foreground">{config.unit}</span>
          </p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(metricConfig) as MetricType[]).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedMetric === key
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {metricConfig[key].label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Controls - single row at wide widths, wraps at narrow.
           Uses @container queries to respond to card width */}
      <div className="flex flex-wrap @lg:flex-nowrap items-center gap-2 mb-3">
        {/* Cluster count indicator */}
        {localClusterFilter.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            <Server className="w-3 h-3" />
            {clusters.length}/{availableClustersForFilter.length}
          </span>
        )}

        {/* Time Range Filter */}
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground cursor-pointer"
            title={t('cards:clusterMetrics.selectTimeRange')}
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
          onClear={clearClusterFilter}
          isOpen={showClusterFilter}
          setIsOpen={setShowClusterFilter}
          containerRef={clusterFilterRef}
          minClusters={1}
        />

        {/* Chart Mode Toggle */}
        {clusters.length >= 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setChartMode('total')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                chartMode === 'total'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              title={t('cards:clusterMetrics.showTotal')}
            >
              <TrendingUp className="w-3 h-3" />
              {t('cards:clusterMetrics.total')}
            </button>
            <button
              onClick={() => setChartMode('per-cluster')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                chartMode === 'per-cluster'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              title={t('cards:clusterMetrics.showPerCluster')}
            >
              <Layers className="w-3 h-3" />
              {t('cards:clusterMetrics.perCluster')}
            </button>
          </div>
        )}

      </div>

      {/* Chart */}
      <div className="flex-1" style={CHART_AREA_STYLE}>
        {clusters.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('cards:clusterMetrics.noClustersSelected')}
          </div>
        ) : data.length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <Clock className="w-5 h-5" />
            <span>{data.length === 0 ? t('cards:clusterMetrics.collectingData') : t('cards:clusterMetrics.waitingForData')}</span>
            <span className="text-xs text-muted-foreground/70">{t('cards:clusterMetrics.chartWillAppear')}</span>
          </div>
        ) : (
          <Suspense fallback={<div style={CHART_FALLBACK_STYLE} className="animate-pulse bg-secondary/30 rounded" />}>
            {chartMode === 'per-cluster' && perClusterData.series.length > 0 ? (
              <LazyMultiSeriesChart
                data={perClusterData.data}
                series={perClusterData.series}
                height={CHART_AREA_MIN_HEIGHT}
                showGrid
              />
            ) : (
              <LazyTimeSeriesChart
                data={data}
                color={config.color}
                height={CHART_AREA_MIN_HEIGHT}
                unit={config.unit}
                showGrid
              />
            )}
          </Suspense>
        )}
      </div>

      {/* Stats - show when we have time series data */}
      {data.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 @md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.min')}</p>
            <p className="text-sm font-medium text-foreground">
              {(() => { const vals = data.map((d) => d.value); return Math.round(vals.length > 0 ? Math.min(...vals) : 0) })()}{config.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.avg')}</p>
            <p className="text-sm font-medium text-foreground">
              {Math.round(data.reduce((a, b) => a + b.value, 0) / data.length)}{config.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.max')}</p>
            <p className="text-sm font-medium text-foreground">
              {(() => { const vals = data.map((d) => d.value); return Math.round(vals.length > 0 ? Math.max(...vals) : 0) })()}{config.unit}
            </p>
          </div>
        </div>
      )}
    </div>
  )
})
