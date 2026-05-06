import { memo, useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, Cpu, Server, Clock } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useMetricsHistoryReadOnly } from '../../hooks/useMetricsHistory'
import { gpuNodeCache as mcpGPUNodeCache } from '../../hooks/mcp/compute'
import type { GPUNode } from '../../hooks/mcp/types'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { normalizeClusterName } from '../../lib/gpu'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_MUTED } from '../../lib/constants'
import { MS_PER_MINUTE, MS_PER_HOUR } from '../../lib/constants/time'

/**
 * Maximum age of a metrics-history snapshot we're willing to use as a
 * fallback when the live GPU-nodes fetch returns empty. Snapshots older than
 * this are treated as stale and skipped (the card will render its empty
 * state instead of showing days-old inventory). 30 minutes matches the
 * `MAX_AGE_MS` used by this card's own on-screen chart history so the two
 * windows stay consistent.
 */
const GPU_SNAPSHOT_STALENESS_MS = 30 * MS_PER_MINUTE // 30 min
const GPU_CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const GPU_CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const

/**
 * Bucket size for the staleness-tick that forces the fallback memo to
 * re-evaluate as time passes. Without this, a snapshot accepted as fresh
 * can remain displayed indefinitely because the memo's deps never change.
 * Rounding `Date.now()` to this bucket means the memo only recomputes when
 * the bucket boundary crosses — roughly once per minute — which is plenty
 * of precision for a 30-minute staleness window.
 */
const STALENESS_TICK_MS = 60_000

interface GPUDataPoint {
  time: string
  available: number
  allocated: number
  free: number
}

// Shape we pass through the card's filter/aggregation pipeline. This matches
// the live GPUNode shape for the fields we actually use (cluster, gpuType,
// gpuCount, gpuAllocated). We normalize here so we can transparently fall
// back to a recent metrics-history snapshot whose field name is `gpuTotal`
// instead of `gpuCount` — see snapshot fallback below.
interface EffectiveGPUNode {
  name: string
  cluster: string
  gpuType?: string
  gpuCount: number
  gpuAllocated: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number; intervalMs: number }[] = [
  { value: '15m', label: '15 min', points: 15, intervalMs: MS_PER_MINUTE },
  { value: '1h', label: '1 hour', points: 20, intervalMs: 3 * MS_PER_MINUTE },
  { value: '6h', label: '6 hours', points: 24, intervalMs: 15 * MS_PER_MINUTE },
  { value: '24h', label: '24 hours', points: 24, intervalMs: MS_PER_HOUR },
]

const GPUUsageTrend = memo(function GPUUsageTrend() {
  const { t } = useTranslation()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures } = useCachedGPUNodes()
  const { deduplicatedClusters: clusters } = useClusters()
  const { isDemoMode } = useDemoMode()
  // Use the shared metrics-history snapshots as a last-known-good fallback
  // when the live GPU-nodes fetch returns empty (intermittent API failure
  // against a cluster that does have GPUs). Without this the card shows
  // "No GPU Nodes" whenever a single poll fails — see GPU Inventory History
  // card which already reads this same history and stays populated.
  //
  // We use the read-only variant here so this card does NOT add a second
  // round of MCP polling (useGPUNodes) or a second capture `setInterval`.
  // The driver `useMetricsHistory()` is hosted elsewhere (GPU Inventory
  // History) and publishes updates through the shared singleton.
  const { history: metricsHistory } = useMetricsHistoryReadOnly()

  // Staleness-tick: a time-bucket derived from Date.now() rounded to
  // STALENESS_TICK_MS. Included in the `effectiveGPUNodes` memo deps so the
  // memo re-evaluates on every bucket boundary, which lets a snapshot that
  // was "fresh" when first shown transition to "stale" as the clock advances.
  const [stalenessTick, setStalenessTick] = useState<number>(
    () => Math.floor(Date.now() / STALENESS_TICK_MS),
  )
  useEffect(() => {
    const intervalId = setInterval(() => {
      setStalenessTick(Math.floor(Date.now() / STALENESS_TICK_MS))
    }, STALENESS_TICK_MS)
    return () => clearInterval(intervalId)
  }, [])

  // Fall back to the most recent snapshot's GPU nodes if the live list is
  // empty. Snapshots use `gpuTotal`; we remap to `gpuCount` so downstream
  // aggregation (currentTotals, filteredNodes) stays unchanged.
  //
  // Three-tier fallback (see issues 8080 and 8081):
  //   1. Live cached GPU nodes from useCachedGPUNodes (SWR)
  //   2. Most recent non-empty snapshot from useMetricsHistoryReadOnly
  //   3. The MCP compute.ts localStorage cache (`kubestellar-gpu-cache`)
  //      which persists across page reloads and is populated by the
  //      useGPUNodes/mcp hook path
  //
  // Tier 3 specifically handles the fresh-page-load + flapping-cluster
  // case: metrics history hasn't captured a snapshot yet and the live
  // fetch returned empty, but a previous session's GPU cache is still
  // sitting in localStorage.
  const effectiveGPUNodes: EffectiveGPUNode[] = useMemo(() => {
    if (gpuNodes.length > 0) {
      return gpuNodes.map(n => ({
        name: n.name,
        cluster: n.cluster,
        gpuType: n.gpuType,
        gpuCount: n.gpuCount,
        gpuAllocated: n.gpuAllocated }))
    }
    // Don't fall back during the initial load — the card will show its
    // skeleton while `hookLoading` is true.
    if (hookLoading && !isFailed && consecutiveFailures === 0) {
      return []
    }
    // Only fall back when the live fetch actually failed. A successful fetch
    // that returned an empty list is a legitimate "cluster has no GPUs" state
    // and must NOT be masked by stale history.
    if (!isFailed && consecutiveFailures === 0) {
      return []
    }
    // Use real `Date.now()` for the age computation so a snapshot that just
    // crossed the staleness threshold is measured against true elapsed time
    // rather than the start of the current minute bucket (which can be up to
    // `STALENESS_TICK_MS - 1` ms smaller than real time and would effectively
    // extend the staleness window). `stalenessTick` is still in the memo deps
    // so the recompute fires on each bucket boundary.
    void stalenessTick
    const now = Date.now()
    for (let i = metricsHistory.length - 1; i >= 0; i -= 1) {
      const snap = metricsHistory[i]
      const snapNodes = snap?.gpuNodes || []
      if (snapNodes.length === 0) continue
      const age = now - new Date(snap.timestamp).getTime()
      if (age > GPU_SNAPSHOT_STALENESS_MS) {
        // History is ordered oldest→newest, so every earlier snapshot is
        // even older — we can stop scanning.
        break
      }
      return snapNodes.map(g => ({
        name: g.name,
        cluster: g.cluster,
        gpuType: g.gpuType,
        gpuCount: g.gpuTotal,
        gpuAllocated: g.gpuAllocated }))
    }
    // Tier 3: MCP module-level GPU cache (persisted to localStorage by
    // web/src/hooks/mcp/compute.ts). This is last-resort when both the
    // live fetch and metrics history are empty — typically on a fresh
    // page load against a cluster whose GPU fetch is currently flapping.
    const mcpCachedNodes: GPUNode[] = mcpGPUNodeCache?.nodes || []
    if (mcpCachedNodes.length > 0) {
      return mcpCachedNodes.map(n => ({
        name: n.name,
        cluster: n.cluster,
        gpuType: n.gpuType,
        gpuCount: n.gpuCount,
        gpuAllocated: n.gpuAllocated }))
    }
    return []
  }, [gpuNodes, metricsHistory, hookLoading, isFailed, consecutiveFailures, stalenessTick])

  // Only show skeleton when no cached data exists (live OR snapshot fallback)
  const hasData = effectiveGPUNodes.length > 0
  const isLoading = hookLoading && !hasData
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Report state to CardWrapper for refresh animation
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

  // Track historical data points with persistence
  const STORAGE_KEY = 'gpu-usage-trend-history'
  const MAX_AGE_MS = 30 * MS_PER_MINUTE // 30 minutes - discard older data

  const loadSavedHistory = (): GPUDataPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: GPUDataPoint[]; timestamp: number }
        if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
          return parsed.data
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }

  const historyRef = useRef<GPUDataPoint[]>(loadSavedHistory())
  const [history, setHistory] = useState<GPUDataPoint[]>(historyRef.current)

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

  // Get reachable clusters (those with GPU nodes)
  const gpuClusters = (() => {
    const clusterNames = new Set(effectiveGPUNodes.map(n => normalizeClusterName(n.cluster)))
    return clusters.filter(c => clusterNames.has(normalizeClusterName(c.name)) && c.reachable !== false)
  })()

  const availableClustersForFilter = (() => {
    if (isAllClustersSelected) return gpuClusters
    return gpuClusters.filter(c => selectedClusters.includes(c.name))
  })()

  const filteredNodes = useMemo(() => {
    let filtered: EffectiveGPUNode[] = effectiveGPUNodes
    if (!isAllClustersSelected) {
      filtered = filtered.filter(node => {
        const normalizedNodeCluster = normalizeClusterName(node.cluster)
        return selectedClusters.some(c => {
          const normalizedSelected = normalizeClusterName(c)
          return normalizedNodeCluster === normalizedSelected ||
                 normalizedNodeCluster.includes(normalizedSelected) ||
                 normalizedSelected.includes(normalizedNodeCluster)
        })
      })
    }
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(node => {
        const normalizedNodeCluster = normalizeClusterName(node.cluster)
        return localClusterFilter.some(c => {
          const normalizedLocal = normalizeClusterName(c)
          return normalizedNodeCluster === normalizedLocal ||
                 normalizedNodeCluster.includes(normalizedLocal) ||
                 normalizedLocal.includes(normalizedNodeCluster)
        })
      })
    }
    return filtered
  }, [effectiveGPUNodes, selectedClusters, isAllClustersSelected, localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  const currentTotals = useMemo(() => {
    const available = filteredNodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0)
    const allocated = filteredNodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0)
    return { available, allocated, free: available - allocated }
  }, [filteredNodes])

  const timeRangeConfig = TIME_RANGE_OPTIONS.find(t => t.value === timeRange) || TIME_RANGE_OPTIONS[1]

  useEffect(() => {
    if (isLoading) return
    if (currentTotals.available === 0) return
    const now = new Date()
    const newPoint: GPUDataPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...currentTotals }
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.available !== newPoint.available ||
      lastPoint.allocated !== newPoint.allocated
    if (shouldAdd) {
      const maxPoints = timeRangeConfig.points
      const newHistory = [...historyRef.current, newPoint].slice(-maxPoints)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [currentTotals, isLoading, timeRangeConfig.points])

  const usagePercent = currentTotals.available > 0
    ? Math.round((currentTotals.allocated / currentTotals.available) * 100)
    : 0

  const getUsageColor = () => {
    if (usagePercent >= 90) return 'text-red-400'
    if (usagePercent >= 75) return 'text-orange-400'
    if (usagePercent >= 50) return 'text-yellow-400'
    return 'text-green-400'
  }

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: history.map(d => d.time),
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
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
      formatter: (params: Array<{ seriesName: string; value: number; color: string }>) => {
        let html = ''
        for (const p of (params || [])) {
          const label = p.seriesName === 'allocated' ? 'In Use' : 'Free'
          html += `<div><span style="color:${p.color}">\u25CF</span> ${label}: ${p.value} GPUs</div>`
        }
        return html
      },
    },
    legend: {
      data: ['In Use', 'Free'],
      bottom: 0,
      textStyle: { color: CHART_TEXT_MUTED, fontSize: CHART_AXIS_FONT_SIZE },
      icon: 'rect',
    },
    series: [
      {
        name: 'allocated',
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: history.map(d => d.allocated),
        lineStyle: { color: '#9333ea', width: 2 },
        itemStyle: { color: '#9333ea' },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(147,51,234,0.6)' }, { offset: 1, color: 'rgba(147,51,234,0.1)' }] },
        },
        showSymbol: false,
      },
      {
        name: 'free',
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: history.map(d => d.free),
        lineStyle: { color: '#22c55e', width: 2 },
        itemStyle: { color: '#22c55e' },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(34,197,94,0.6)' }, { offset: 1, color: 'rgba(34,197,94,0.1)' }] },
        },
        showSymbol: false,
      },
    ],
  }), [history])

  if (isLoading && history.length === 0) {
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

  if (effectiveGPUNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3" />
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPU Nodes</p>
          <p className="text-sm text-muted-foreground">No GPU resources detected in any cluster</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
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

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.available} total GPUs available`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">{t('common.total')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.available}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs in use`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common.used')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs free`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common.free')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className={`p-2 rounded-lg bg-secondary/50 border border-border`} title={`${usagePercent}% GPU utilization`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className={`w-3 h-3 ${getUsageColor()}`} aria-hidden="true" />
            <span className={`text-xs ${getUsageColor()}`}>Usage</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      <div className="flex-1 min-h-[160px]">
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Collecting data...
          </div>
        ) : (
          <div style={GPU_CHART_CONTAINER_STYLE} role="img" aria-label={`GPU usage trend chart: ${currentTotals.allocated} of ${currentTotals.available} GPUs in use (${usagePercent}% utilization)`}>
            <LazyEChart
              option={chartOption}
              style={GPU_CHART_STYLE}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

      {filteredNodes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              filteredNodes.reduce((acc, node) => {
                const type = node.gpuType || 'Unknown'
                if (!acc[type]) acc[type] = { count: 0, allocated: 0 }
                acc[type].count += node.gpuCount || 0
                acc[type].allocated += node.gpuAllocated || 0
                return acc
              }, {} as Record<string, { count: number; allocated: number }>)
            ).map(([type, data]) => (
              <div
                key={type}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary/50"
                title={`${type}: ${data.allocated}/${data.count} used`}
              >
                <span className="text-muted-foreground truncate max-w-[100px]">{type}:</span>
                <span className="text-foreground">{data.allocated}/{data.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})


export { GPUUsageTrend }