import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { TrendingUp, Clock, Server } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useGPUTaintFilter, GPUTaintFilterControl } from './GPUTaintFilter'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import {
  CHART_HEIGHT_COMPACT,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_MARK_LINE_LABEL,
  CHART_MARK_LINE_STROKE,
  CHART_AXIS_FONT_SIZE_SM,
  CHART_LEGEND_FONT_SIZE } from '../../lib/constants'
import { PURPLE_600, hexToRgba } from '../../lib/theme/chartColors'

const GPU_RING_SIZE_PX = 80
const GPU_RING_CONTAINER_STYLE = { minWidth: GPU_RING_SIZE_PX, minHeight: GPU_RING_SIZE_PX } as const
const GPU_RING_CHART_STYLE = { height: GPU_RING_SIZE_PX, width: GPU_RING_SIZE_PX } as const
const GPU_TREND_CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_COMPACT, height: CHART_HEIGHT_COMPACT } as const
const GPU_TREND_CHART_STYLE = { height: CHART_HEIGHT_COMPACT, width: '100%' } as const

interface GPUPoint {
  time: string
  allocated: number
  available: number
  total: number
}

/** Opacity at the top of area-fill gradients */
const AREA_GRADIENT_TOP_ALPHA = 0.4
/** Opacity at the bottom of area-fill gradients (fully transparent) */
const AREA_GRADIENT_BOTTOM_ALPHA = 0
/** Font size for mark-line labels on the chart */
const MARK_LINE_FONT_SIZE = 9

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
]

const GPUUtilization = memo(function GPUUtilization() {
  const { t } = useTranslation()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh: gpuLastRefresh } = useCachedGPUNodes()
  const { deduplicatedClusters: clusters } = useClusters()
  const { isDemoMode } = useDemoMode()

  const hasData = gpuNodes.length > 0
  const isLoading = hookLoading && !hasData
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures })
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  // Taint-aware filtering (taint-filter). Computed from the full raw node list so
  // the set of distinct taints shown to the user is stable across cluster
  // filter changes — otherwise toggling a cluster off would "hide" a taint
  // that still exists in the fleet.
  const {
    distinctTaints,
    toleratedKeys: toleratedTaintKeys,
    toggle: toggleTaintTolerance,
    clear: clearTaintTolerance,
    isVisible: nodeToleratedByTaints,
  } = useGPUTaintFilter(gpuNodes)
  const [showTaintFilter, setShowTaintFilter] = useState(false)
  const taintFilterRef = useRef<HTMLDivElement>(null)

  const reachableClusters = clusters.filter(c => c.reachable !== false)
  const availableClustersForFilter = (() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  })()

  const filteredClusters = (() => {
    let filtered = reachableClusters
    if (!isAllClustersSelected) {
      filtered = filtered.filter(c => selectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }
    return filtered
  })()

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  const reachableClusterNames = new Set(clusters.filter(c => c.reachable !== false).map(c => c.name))
  const hasReachableClusters = filteredClusters.some(c => c.nodeCount !== undefined && c.nodeCount > 0)

  const historyRef = useRef<GPUPoint[]>([])
  const [history, setHistory] = useState<GPUPoint[]>([])

  const filteredNodes = (() => {
    let result = gpuNodes.filter(n => {
      const cluster = n.cluster ?? ''
      const lastPart = cluster.split('/').pop() ?? cluster
      return reachableClusterNames.has(cluster) || reachableClusterNames.has(lastPart)
    })
    if (!isAllClustersSelected) {
      result = result.filter(n => selectedClusters.some(c => (n.cluster ?? '').startsWith(c)))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.some(c => (n.cluster ?? '').startsWith(c)))
    }
    // Drop nodes whose scheduling-gating taints are not tolerated (taint-filter).
    result = result.filter(nodeToleratedByTaints)
    return result
  })()

  const currentStats = useMemo(() => {
    const total = filteredNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocated = filteredNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const available = total - allocated
    const utilization = total > 0 ? Math.round((allocated / total) * 100) : 0
    return { total, allocated, available, utilization }
  }, [filteredNodes])

  useEffect(() => {
    if (isLoading) return
    if (currentStats.total === 0) return
    const now = new Date()
    const newPoint: GPUPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      allocated: currentStats.allocated,
      available: currentStats.available,
      total: currentStats.total }
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.allocated !== newPoint.allocated ||
      lastPoint.available !== newPoint.available
    if (shouldAdd) {
      const newHistory = [...historyRef.current, newPoint].slice(-20)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [currentStats, isLoading])

  // Pie chart option
  const pieOption = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'pie',
      radius: ['62%', '88%'],
      center: ['50%', '50%'],
      data: [
        { value: currentStats.allocated, name: 'Allocated', itemStyle: { color: '#9333ea' } },
        { value: currentStats.available, name: 'Available', itemStyle: { color: '#22c55e' } },
      ],
      label: { show: false },
      emphasis: { scale: false },
      silent: true,
    }],
  }), [currentStats])

  // Trend chart option
  const trendOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 30, right: 5, top: 5, bottom: 20 },
    xAxis: {
      type: 'category' as const,
      data: history.map(d => d.time),
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE_SM },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: currentStats.total || undefined,
      minInterval: 1,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE_SM },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_LEGEND_FONT_SIZE },
    },
    series: [
      {
        name: 'Allocated GPUs',
        type: 'line',
        step: 'end' as const,
        data: history.map(d => d.allocated),
        lineStyle: { color: PURPLE_600, width: 2 },
        itemStyle: { color: PURPLE_600 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(PURPLE_600, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(PURPLE_600, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
        markLine: {
          silent: true,
          data: [{ yAxis: currentStats.total, label: { formatter: 'Total', position: 'end', color: CHART_MARK_LINE_LABEL, fontSize: MARK_LINE_FONT_SIZE }, lineStyle: { color: CHART_MARK_LINE_STROKE, type: 'dashed' } }],
        },
      },
    ],
  }), [history, currentStats.total])

  if (isLoading && history.length === 0 && hasReachableClusters) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={120} className="flex-1" />
      </div>
    )
  }

  if (!hasReachableClusters || (!hookLoading && currentStats.total === 0)) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <div className="flex items-center gap-2">
            {localClusterFilter.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                <Server className="w-3 h-3" />
                {localClusterFilter.length}/{availableClustersForFilter.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground cursor-pointer"
                title="Select time range"
              >
                {TIME_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
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
            <GPUTaintFilterControl
              distinctTaints={distinctTaints}
              toleratedKeys={toleratedTaintKeys}
              onToggle={toggleTaintTolerance}
              onClear={clearTaintTolerance}
              isOpen={showTaintFilter}
              setIsOpen={setShowTaintFilter}
              containerRef={taintFilterRef}
            />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {!hasReachableClusters ? 'No reachable clusters' : 'No GPUs detected in selected clusters'}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          {/* #6217 part 3: freshness indicator. */}
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={typeof gpuLastRefresh === 'number' ? new Date(gpuLastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground cursor-pointer"
              title="Select time range"
            >
              {TIME_RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
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

      {/* Stats and pie chart row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-20 h-20 relative" style={GPU_RING_CONTAINER_STYLE}>
          <LazyEChart
            option={pieOption}
            style={GPU_RING_CHART_STYLE}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-foreground">{currentStats.utilization}%</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 @md:grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="text-xs text-purple-400 mb-1">{t('common.allocated')}</div>
            <span className="text-lg font-bold text-foreground">{currentStats.allocated}</span>
          </div>
          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="text-xs text-green-400 mb-1">{t('common.available')}</div>
            <span className="text-lg font-bold text-foreground">{currentStats.available}</span>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50">
            <div className="text-xs text-muted-foreground mb-1">{t('common.total')}</div>
            <span className="text-lg font-bold text-foreground">{currentStats.total}</span>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="flex-1 min-h-[120px]">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Allocation Trend</span>
        </div>
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Collecting data...
          </div>
        ) : (
          <div style={GPU_TREND_CHART_CONTAINER_STYLE}>
            <LazyEChart
              option={trendOption}
              style={GPU_TREND_CHART_STYLE}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

      {(() => {
        const clusterCount = new Set(filteredNodes.map(n => (n.cluster ?? '').split('/').pop() ?? n.cluster ?? '')).size
        return (
          <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            {filteredNodes.length} GPU node{filteredNodes.length !== 1 ? 's' : ''} across {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
          </div>
        )
      })()}
    </div>
  )
})


export { GPUUtilization }