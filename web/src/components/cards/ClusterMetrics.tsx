import { useState, useMemo, useEffect, useRef, Suspense, memo } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { useClusters } from '../../hooks/useMCP'
import { Server, Clock, Layers, TrendingUp } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { ClusterMetricsSummary } from './ClusterMetrics.SummaryPanel'
import {
  CHART_AREA_MIN_HEIGHT,
  CHART_AREA_STYLE,
  CHART_FALLBACK_STYLE,
  DEFAULT_TIME_RANGE,
  MAX_HISTORY_DURATION_MS,
  MAX_HISTORY_POINTS,
  MAX_METRIC_NAME_DISPLAY,
  MIN_POINT_SPACING_MS,
  SUPPORTED_TIME_RANGE_KEYS,
  SUPPORTED_TIME_RANGE_VALUES,
  TIME_RANGE_MS,
  TRUNCATED_METRIC_NAME,
  buildDemoMetricHistory,
  metricConfigBase,
  type ChartMode,
  type ClusterMetricSource,
  type ClusterMetricValues,
  type MetricPoint,
  type MetricType,
  type TimeRange,
} from './ClusterMetrics.data'

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
  const metricConfig = useMemo(() => {
    const result: Record<MetricType, { label: string; color: string; unit: string; baseValue: number; variance: number }> = {} as typeof result
    for (const [key, val] of Object.entries(metricConfigBase)) {
      result[key as MetricType] = { ...val, label: String(t(val.labelKey)) }
    }
    return result
  }, [t])

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
    const parsed = safeGetJSON<{ data: MetricPoint[]; timestamp: number }>(STORAGE_KEY)
    // Guard: validate parsed.data is an array before using it.
    // Malformed or legacy localStorage data could return a non-array
    // value (e.g. undefined, null, or an object), which would cause
    // history.filter() to throw a TypeError during render.
    if (parsed && Date.now() - parsed.timestamp < MAX_AGE_MS && Array.isArray(parsed.data)) {
      return parsed.data
    }
    return []
  }

  const initialHistory = loadSavedHistory()
  const historyRef = useRef<MetricPoint[]>(initialHistory)
  const [history, setHistory] = useState<MetricPoint[]>(initialHistory)

  // Save live history to localStorage when it changes.
  // Demo mode uses synthetic history, so persisting it would overwrite real
  // browsing history with generated points.
  useEffect(() => {
    if (isDemoMode || history.length === 0) return

    safeSetJSON(STORAGE_KEY, {
      data: history,
      timestamp: Date.now() })
  }, [history, isDemoMode])

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

  // Track live data points over time. Demo mode uses a generated time series
  // so the chart shows believable movement immediately.
  useEffect(() => {
    if (isDemoMode || isLoading || !hasRealData) return
    if (realValues.nodes === 0 && realValues.cpu === 0) return

    const now = Date.now()
    // Build per-cluster values for comparison mode
    const clusterValues: Record<string, ClusterMetricValues> = {}
    ;(clusters || []).forEach((c: ClusterMetricSource) => {
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
  }, [realValues, isDemoMode, isLoading, hasRealData, clusters])

  const effectiveHistory = useMemo(() => {
    if (isDemoMode && hasRealData) {
      return buildDemoMetricHistory(clusters)
    }
    return history
  }, [clusters, hasRealData, history, isDemoMode])

  const rangeMs = TIME_RANGE_MS[timeRange]
  const filteredHistory = effectiveHistory.filter(point => Date.now() - point.timestamp <= rangeMs)

  // Transform history to chart data for selected metric
  const data = filteredHistory.map(point => ({
    time: point.time,
    value: point[selectedMetric],
  }))

  // Generate per-cluster data for comparison mode
  const perClusterData = useMemo(() => {
    if (chartMode !== 'per-cluster') return { data: [], series: [] }

    const clusterHistory = filteredHistory.filter(point => point.clusters)

    // Get all unique cluster names from history
    const clusterNames = new Set<string>()
    clusterHistory.forEach(point => {
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
      name: name.length > MAX_METRIC_NAME_DISPLAY ? name.slice(0, TRUNCATED_METRIC_NAME) + '...' : name,
    }))

    // Build data with all clusters as keys
    const chartData = clusterHistory.map(point => {
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
  }, [chartMode, filteredHistory, selectedMetric])

  const config = metricConfig[selectedMetric]
  // Use real current value if non-zero, otherwise fall back to the last
  // known non-null chart value so the header stays in sync with the chart
  // instead of showing a misleading 0 during temporary data loss (#6875).
  const currentValue = useMemo(() => {
    if (isDemoMode && data.length > 0) {
      return data[data.length - 1]?.value ?? 0
    }

    const live = hasRealData ? realValues[selectedMetric] : 0
    if (live > 0) return live
    // Walk backwards through chart data to find the last non-null value
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]?.value != null && data[i].value > 0) return data[i].value
    }
    return 0
  }, [data, hasRealData, isDemoMode, realValues, selectedMetric])

  return (
    <div className="h-full flex flex-col">
      {/* Header with metric value and selector — @container responsive */}
      <div className="flex flex-wrap @lg:flex-nowrap items-center justify-between gap-y-2 mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
          <p className="text-2xl font-bold text-foreground">
            {selectedMetric === 'memory' ? currentValue.toFixed(1) : Math.round(currentValue)}<span className="text-sm text-muted-foreground">{config.unit}</span>
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

      <ClusterMetricsSummary data={data} unit={config.unit} />
    </div>
  )
})
