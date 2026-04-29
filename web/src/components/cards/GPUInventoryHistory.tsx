import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Cpu, TrendingUp, TrendingDown, Minus, Clock, Server,
  BarChart3, Table2, ChevronDown, ArrowUpDown } from 'lucide-react'
import { LazyEChart } from '../charts/LazyEChart'
import { useMetricsHistory } from '../../hooks/useMetricsHistory'
import type { MetricsSnapshot } from '../../types/predictions'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_MUTED } from '../../lib/constants'
import { MS_PER_HOUR, MS_PER_MINUTE, MINUTES_PER_HOUR } from '../../lib/constants/time'

// ---------------------------------------------------------------------------
// Constants — no magic numbers
// ---------------------------------------------------------------------------

/** Minimum number of snapshots needed to compute a meaningful trend */
const MIN_TREND_SNAPSHOTS = 3
/** Number of recent snapshots to use for trend calculation (last ~1 hour at 10-min intervals) */
const RECENT_SNAPSHOT_WINDOW = 6
/** Threshold (in GPUs) to consider a trend as changing rather than stable */
const TREND_CHANGE_THRESHOLD = 1
/** Percentage threshold to classify usage level as high */
const HIGH_USAGE_PCT = 80
/** Percentage threshold to classify usage level as medium */
const MEDIUM_USAGE_PCT = 50
/** Number of demo data points to generate */
const DEMO_POINT_COUNT = 24
/** Base total GPUs in demo data */
const DEMO_BASE_TOTAL = 32
/** Base allocated GPUs in demo data */
const DEMO_BASE_ALLOCATED = 18
/** Hours of history to represent in demo data */
const DEMO_HOURS_RANGE = 24
/** Max random fluctuation in demo allocated GPUs */
const DEMO_FLUCTUATION = 4
/** Multiplier for percentage calculation */
const PERCENT_MULTIPLIER = 100
/** Fallback label for legacy snapshots without gpuType */
const UNKNOWN_GPU_TYPE = 'Unknown'
/** Number of demo GPU types to simulate */
const DEMO_GPU_TYPE_COUNT = 3
/** Number of demo nodes to simulate */
const DEMO_NODE_COUNT = 4
/** Default snapshot interval in minutes (used when actual cannot be computed) */
const DEFAULT_SNAPSHOT_INTERVAL_MIN = 10
/** Minimum snapshots needed for churn computation (need at least 2 to diff) */
const MIN_CHURN_SNAPSHOTS = 2
/** Maximum rows to show in the table view per page */
const TABLE_PAGE_SIZE = 8
/** Maximum number of GPU type series to render in chart before grouping remainder as "Other" */
const MAX_CHART_SERIES = 8

/** Distinct colors for per-GPU-type area series in the chart */
const GPU_TYPE_COLORS: string[] = [
  '#9333ea', // purple-600
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#8b5cf6', // purple-500
]

/** Color used for the "free" series area */
const FREE_AREA_COLOR = '#22c55e'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'chart' | 'table'
type ChartMode = 'aggregate' | 'by-type'

interface GPUHistoryDataPoint {
  time: string
  timestamp: number
  allocated: number
  total: number
  free: number
  /** Per-GPU-type allocated counts, keyed by type name */
  [key: string]: string | number
}

/** Row in the per-node table view */
interface NodeTableRow {
  name: string
  cluster: string
  gpuType: string
  allocated: number
  total: number
  free: number
  utilizationPct: number
}

/** Churn metrics computed from consecutive snapshot diffs */
interface ChurnMetrics {
  /** Average number of GPUs arriving (newly allocated) per snapshot interval */
  arrivalRate: number
  /** Average number of GPUs departing (freed) per snapshot interval */
  departureRate: number
  /** Average allocation duration in snapshot intervals (approximation) */
  avgDurationIntervals: number
}

// ---------------------------------------------------------------------------
// Demo data generators
// ---------------------------------------------------------------------------

const DEMO_GPU_TYPES = ['NVIDIA A100', 'NVIDIA H100', 'AMD MI250'] as const
const DEMO_NODES = ['gpu-node-01', 'gpu-node-02', 'gpu-node-03', 'gpu-node-04'] as const

function generateDemoData(): GPUHistoryDataPoint[] {
  const points: GPUHistoryDataPoint[] = []
  const now = Date.now()

  for (let i = 0; i < DEMO_POINT_COUNT; i++) {
    const hoursAgo = DEMO_HOURS_RANGE - i
    const ts = now - hoursAgo * MS_PER_HOUR
    const date = new Date(ts)
    const allocated = DEMO_BASE_ALLOCATED + Math.floor(Math.random() * DEMO_FLUCTUATION)
    const point: GPUHistoryDataPoint = {
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: ts,
      allocated,
      total: DEMO_BASE_TOTAL,
      free: DEMO_BASE_TOTAL - allocated }
    // Distribute allocated across demo GPU types
    let remaining = allocated
    for (let t = 0; t < DEMO_GPU_TYPE_COUNT; t++) {
      const typeName = DEMO_GPU_TYPES[t]
      const share = t < DEMO_GPU_TYPE_COUNT - 1
        ? Math.floor(remaining / (DEMO_GPU_TYPE_COUNT - t)) + Math.floor(Math.random() * 2)
        : remaining
      const clamped = Math.min(share, remaining)
      point[typeName] = clamped
      remaining -= clamped
    }
    points.push(point)
  }
  return points
}

function generateDemoTableRows(): NodeTableRow[] {
  const rows: NodeTableRow[] = []
  for (let i = 0; i < DEMO_NODE_COUNT; i++) {
    const gpuType = DEMO_GPU_TYPES[i % DEMO_GPU_TYPE_COUNT]
    const total = 8
    const allocated = Math.floor(Math.random() * total)
    rows.push({
      name: DEMO_NODES[i],
      cluster: `cluster-${(i % 2) + 1}`,
      gpuType,
      allocated,
      total,
      free: total - allocated,
      utilizationPct: total > 0 ? Math.round((allocated / total) * PERCENT_MULTIPLIER) : 0 })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve GPU type string, falling back to UNKNOWN for legacy snapshots */
function resolveGPUType(gpuType?: string): string {
  return gpuType && gpuType.trim() !== '' ? gpuType : UNKNOWN_GPU_TYPE
}

/** Assign a deterministic color to a GPU type based on its index in the sorted list */
function getTypeColor(index: number): string {
  return GPU_TYPE_COLORS[index % GPU_TYPE_COLORS.length]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Extracted chart sub-component to keep the main component readable */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GPUInventoryChart({ displayChartData, chartMode, chartGPUTypes, t }: {
  displayChartData: GPUHistoryDataPoint[]
  chartMode: ChartMode
  chartGPUTypes: string[]
  t: any
}) {
  const chartOption = useMemo(() => {
    const timeData = (displayChartData || []).map(d => d.time)

    const buildSeries = () => {
      if (chartMode === 'by-type' && chartGPUTypes.length > 0) {
        const typeSeries = (chartGPUTypes || []).map((typeName, idx) => ({
          name: typeName,
          type: 'line' as const,
          stack: 'total',
          step: 'end' as const,
          data: (displayChartData || []).map(d => (d[typeName] as number) || 0),
          lineStyle: { color: getTypeColor(idx), width: 2 },
          itemStyle: { color: getTypeColor(idx) },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: getTypeColor(idx) + '99' }, { offset: 1, color: getTypeColor(idx) + '1A' }] },
          },
          showSymbol: false,
        }))
        typeSeries.push({
          name: 'free',
          type: 'line' as const,
          stack: 'total',
          step: 'end' as const,
          data: (displayChartData || []).map(d => d.free),
          lineStyle: { color: FREE_AREA_COLOR, width: 2 },
          itemStyle: { color: FREE_AREA_COLOR },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: FREE_AREA_COLOR + '99' }, { offset: 1, color: FREE_AREA_COLOR + '1A' }] },
          },
          showSymbol: false,
        })
        return typeSeries
      }

      return [
        {
          name: 'allocated',
          type: 'line' as const,
          stack: 'total',
          step: 'end' as const,
          data: (displayChartData || []).map(d => d.allocated),
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
          type: 'line' as const,
          stack: 'total',
          step: 'end' as const,
          data: (displayChartData || []).map(d => d.free),
          lineStyle: { color: FREE_AREA_COLOR, width: 2 },
          itemStyle: { color: FREE_AREA_COLOR },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: FREE_AREA_COLOR + '99' }, { offset: 1, color: FREE_AREA_COLOR + '1A' }] },
          },
          showSymbol: false,
        },
      ]
    }

    const series = buildSeries()
    const legendNames = series.map(s => {
      if (s.name === 'allocated') return t('cards:gpuInventoryHistory.inUse', 'In Use')
      if (s.name === 'free') return t('cards:gpuInventoryHistory.free', 'Free')
      return s.name
    })

    return {
      backgroundColor: 'transparent',
      grid: { left: 40, right: 5, top: 5, bottom: 35 },
      xAxis: {
        type: 'category' as const,
        data: timeData,
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
            let label = p.seriesName
            if (label === 'allocated') label = t('cards:gpuInventoryHistory.inUse', 'In Use')
            else if (label === 'free') label = t('cards:gpuInventoryHistory.free', 'Free')
            html += `<div><span style="color:${p.color}">\u25CF</span> ${label}: ${p.value} GPUs</div>`
          }
          return html
        },
      },
      legend: {
        data: legendNames,
        bottom: 0,
        textStyle: { color: CHART_TEXT_MUTED, fontSize: CHART_AXIS_FONT_SIZE },
        icon: 'rect',
      },
      series,
    }
  }, [displayChartData, chartMode, chartGPUTypes, t])

  return (
    <LazyEChart
      option={chartOption}
      style={{ height: CHART_HEIGHT_STANDARD, width: '100%' }}
      notMerge={true}
      opts={{ renderer: 'svg' }}
    />
  )
}

export function GPUInventoryHistory() {
  const { t } = useTranslation(['cards', 'common'])
  const { history } = useMetricsHistory()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures } = useCachedGPUNodes()
  const { isDemoMode } = useDemoMode()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('chart')
  const [chartMode, setChartMode] = useState<ChartMode>('by-type')
  const [selectedGPUType, setSelectedGPUType] = useState<string>('all')
  const [selectedNode, setSelectedNode] = useState<string>('all')
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showNodeDropdown, setShowNodeDropdown] = useState(false)
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const nodeDropdownRef = useRef<HTMLDivElement>(null)
  const [tablePage, setTablePage] = useState(0)

  const hasData = (gpuNodes || []).length > 0
  const isLoading = hookLoading && !hasData
  const showDemo = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData || (history || []).length > 0,
    isDemoData: showDemo,
    isFailed,
    consecutiveFailures,
  })

  // ── Close dropdowns on outside click or Escape ─────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false)
      }
      if (nodeDropdownRef.current && !nodeDropdownRef.current.contains(e.target as Node)) {
        setShowNodeDropdown(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTypeDropdown(false)
        setShowNodeDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // ── Available filter options (from history + current data) ──────────
  const availableClusters = useMemo(() => {
    const names = new Set<string>()
    for (const n of (gpuNodes || [])) names.add(n.cluster)
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) names.add(g.cluster)
    }
    return Array.from(names).sort().map(name => ({ name, reachable: true }))
  }, [gpuNodes, history])

  const availableGPUTypes = useMemo(() => {
    const types = new Set<string>()
    for (const n of (gpuNodes || [])) types.add(resolveGPUType(n.gpuType))
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) types.add(resolveGPUType(g.gpuType))
    }
    return Array.from(types).sort()
  }, [gpuNodes, history])

  const availableNodes = useMemo(() => {
    const nodes = new Set<string>()
    for (const n of (gpuNodes || [])) nodes.add(n.name)
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) nodes.add(g.name)
    }
    return Array.from(nodes).sort()
  }, [gpuNodes, history])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(clusterName)
        ? prev.filter(c => c !== clusterName)
        : [...prev, clusterName]
    )
  }

  // ── Filter helper applied to snapshot gpuNodes ─────────────────────
  const filterGPUNodes = (nodes: Array<{ name: string; cluster: string; gpuType?: string; gpuAllocated: number; gpuTotal: number }>) => {
      let filtered = nodes || []

      // Global cluster filter
      if (!isAllClustersSelected && selectedClusters.length > 0) {
        filtered = filtered.filter(g =>
          selectedClusters.some(sc => g.cluster.includes(sc) || sc.includes(g.cluster))
        )
      }
      // Local cluster filter
      if (localClusterFilter.length > 0) {
        filtered = filtered.filter(g =>
          localClusterFilter.some(lc => g.cluster.includes(lc) || lc.includes(g.cluster))
        )
      }
      // GPU type filter
      if (selectedGPUType !== 'all') {
        filtered = filtered.filter(g => resolveGPUType(g.gpuType) === selectedGPUType)
      }
      // Node filter
      if (selectedNode !== 'all') {
        filtered = filtered.filter(g => g.name === selectedNode)
      }
      return filtered
    }

  // ── Chart data ─────────────────────────────────────────────────────
  const chartData = useMemo<GPUHistoryDataPoint[]>(() => {
    if (showDemo || (history || []).length === 0) {
      return generateDemoData()
    }

    const points = (history || []).map(snapshot => {
      const filtered = filterGPUNodes(snapshot.gpuNodes || [])
      const allocated = filtered.reduce((sum, g) => sum + (g.gpuAllocated || 0), 0)
      const total = filtered.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      const date = new Date(snapshot.timestamp)

      const point: GPUHistoryDataPoint = {
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: date.getTime(),
        allocated,
        total,
        free: Math.max(total - allocated, 0) }

      // Per-GPU-type breakdown for stacked chart
      if (chartMode === 'by-type') {
        const typeTotals = new Map<string, number>()
        for (const g of filtered) {
          const typeName = resolveGPUType(g.gpuType)
          typeTotals.set(typeName, (typeTotals.get(typeName) || 0) + (g.gpuAllocated || 0))
        }
        for (const [typeName, count] of typeTotals) {
          point[typeName] = count
        }
      }

      return point
    })

    // Defensive filter: if any point in the series has a non-zero total, drop
    // points whose total is zero. A zero-total point next to non-zero points
    // is almost always a transient GPU-fetch glitch that slipped through
    // carry-forward protection in useMetricsHistory. Keeps the chart,
    // stats, and trend math from showing misleading flapping zero bars.
    // If EVERY point has total === 0 (legitimate no-GPU state) we leave the
    // series alone so the empty-state paths still fire correctly.
    const anyNonZero = points.some(p => p.total > 0)
    if (anyNonZero) {
      return points.filter(p => p.total > 0)
    }
    return points
  }, [history, showDemo, filterGPUNodes, chartMode])

  /** All GPU type keys present in chart data */
  const allGPUTypeKeys = useMemo(() => {
    if (chartMode !== 'by-type') return []
    const types = new Set<string>()
    for (const dp of (chartData || [])) {
      for (const key of Object.keys(dp)) {
        if (!['time', 'timestamp', 'allocated', 'total', 'free'].includes(key) && typeof dp[key] === 'number') {
          types.add(key)
        }
      }
    }
    return Array.from(types).sort()
  }, [chartData, chartMode])

  /** Sorted list of GPU types for chart series (overflow aggregated into "Other") */
  const chartGPUTypes = (() => {
    if (allGPUTypeKeys.length <= MAX_CHART_SERIES) return allGPUTypeKeys
    return [...allGPUTypeKeys.slice(0, MAX_CHART_SERIES - 1), 'Other']
  })()

  /** Chart data with overflow types aggregated into "Other" */
  const displayChartData = (() => {
    if (allGPUTypeKeys.length <= MAX_CHART_SERIES) return chartData
    const overflowTypes = new Set(allGPUTypeKeys.slice(MAX_CHART_SERIES - 1))
    return (chartData || []).map(dp => {
      const next = { ...dp }
      let otherTotal = 0
      for (const key of overflowTypes) {
        if (typeof next[key] === 'number') {
          otherTotal += next[key] as number
          delete next[key]
        }
      }
      if (otherTotal > 0) next['Other'] = otherTotal
      return next
    })
  })()

  // ── Current totals ─────────────────────────────────────────────────
  const currentTotals = (() => {
    if ((chartData || []).length === 0) return { allocated: 0, total: 0, free: 0 }
    const latest = chartData[chartData.length - 1]
    return {
      allocated: latest.allocated,
      total: latest.total,
      free: latest.free }
  })()

  // ── Trend ──────────────────────────────────────────────────────────
  const trend = useMemo<'up' | 'down' | 'stable'>(() => {
    if ((chartData || []).length < MIN_TREND_SNAPSHOTS) return 'stable'
    const recent = chartData.slice(-RECENT_SNAPSHOT_WINDOW)
    if (recent.length < MIN_TREND_SNAPSHOTS) return 'stable'

    const halfLen = Math.floor(recent.length / 2)
    const firstHalf = recent.slice(0, halfLen)
    const secondHalf = recent.slice(halfLen)

    const avgFirst = firstHalf.reduce((a, b) => a + b.allocated, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((a, b) => a + b.allocated, 0) / secondHalf.length

    const diff = avgSecond - avgFirst
    if (diff > TREND_CHANGE_THRESHOLD) return 'up'
    if (diff < -TREND_CHANGE_THRESHOLD) return 'down'
    return 'stable'
  }, [chartData])

  // ── Churn metrics ──────────────────────────────────────────────────
  const churnMetrics = useMemo<ChurnMetrics | null>(() => {
    // Drop snapshots with zero total GPUs before diffing so transient empty
    // captures don't show up as massive departure/arrival churn.
    const churnHistory = (history || []).filter(s => {
      const nodes = s.gpuNodes || []
      if (nodes.length === 0) return false
      const total = nodes.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      return total > 0
    })

    if (showDemo || churnHistory.length < MIN_CHURN_SNAPSHOTS) return null

    let totalArrivals = 0
    let totalDepartures = 0
    let diffCount = 0

    for (let i = 1; i < churnHistory.length; i++) {
      const prev = filterGPUNodes(churnHistory[i - 1].gpuNodes || [])
      const curr = filterGPUNodes(churnHistory[i].gpuNodes || [])

      // Per-node diffing captures churn even when allocations and frees cancel at aggregate level
      const prevMap: Record<string, number> = {}
      for (const g of prev) {
        const key = g.name
        prevMap[key] = (prevMap[key] || 0) + (g.gpuAllocated || 0)
      }
      const currMap: Record<string, number> = {}
      for (const g of curr) {
        const key = g.name
        currMap[key] = (currMap[key] || 0) + (g.gpuAllocated || 0)
      }

      const allKeys = new Set([...Object.keys(prevMap), ...Object.keys(currMap)])
      for (const key of allKeys) {
        const delta = (currMap[key] ?? 0) - (prevMap[key] ?? 0)
        if (delta > 0) totalArrivals += delta
        if (delta < 0) totalDepartures += Math.abs(delta)
      }
      diffCount++
    }

    if (diffCount === 0) return null

    const arrivalRate = totalArrivals / diffCount
    const departureRate = totalDepartures / diffCount

    // Little's Law: L/λ — use mean allocated across all data points (not just latest)
    const allocatedValues = (chartData || []).map(dp => dp.allocated)
    const meanAllocated = allocatedValues.length > 0
      ? allocatedValues.reduce((a, b) => a + b, 0) / allocatedValues.length
      : 0
    const avgDurationIntervals = arrivalRate > 0 ? meanAllocated / arrivalRate : 0

    return { arrivalRate, departureRate, avgDurationIntervals }
  }, [history, showDemo, filterGPUNodes, chartData])

  const meanAllocatedGPUs = useMemo(() => {
    const safeData = chartData || []
    if (safeData.length === 0) return 0
    return Math.round(safeData.reduce((s, d) => s + d.allocated, 0) / safeData.length)
  }, [chartData])

  // ── Snapshot interval (computed from history timestamps) ────────────
  /** Median interval between consecutive snapshots in minutes, used to display churn metrics in real time units */
  const snapshotIntervalMin = (() => {
    if ((history || []).length < MIN_CHURN_SNAPSHOTS) return DEFAULT_SNAPSHOT_INTERVAL_MIN
    const intervals: number[] = []
    for (let i = 1; i < (history || []).length; i++) {
      const deltaMs = new Date((history || [])[i].timestamp).getTime() - new Date((history || [])[i - 1].timestamp).getTime()
      if (deltaMs > 0) intervals.push(deltaMs / MS_PER_MINUTE)
    }
    if (intervals.length === 0) return DEFAULT_SNAPSHOT_INTERVAL_MIN
    intervals.sort((a, b) => a - b)
    const mid = Math.floor(intervals.length / 2)
    return Math.round(intervals.length % 2 === 0 ? (intervals[mid - 1] + intervals[mid]) / 2 : intervals[mid])
  })()

  /** Format a duration given in snapshot intervals as a human-readable time string (e.g. "~30 min" or "~2.5 hrs") */
  const formatIntervalDuration = (intervals: number): string => {
    const totalMin = intervals * snapshotIntervalMin
    if (totalMin < MINUTES_PER_HOUR) return `~${Math.round(totalMin)} min`
    return `~${(totalMin / MINUTES_PER_HOUR).toFixed(1)} hrs`
  }

  // ── Table data (per-node, per-type breakdown from latest snapshot) ──
  const tableRows = (() => {
    if (showDemo) return generateDemoTableRows()

    // Walk history from the end and pick the most recent snapshot whose
    // total GPU count is non-zero. Falls back to the literal latest (even if
    // zero) so genuine no-GPU clusters still render an empty table rather
    // than a stale one.
    let latestSnapshot: MetricsSnapshot | null = null
    const hist = history || []
    for (let i = hist.length - 1; i >= 0; i--) {
      const s = hist[i]
      const nodes = s.gpuNodes || []
      const total = nodes.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      if (total > 0) {
        latestSnapshot = s
        break
      }
    }
    if (!latestSnapshot && hist.length > 0) {
      latestSnapshot = hist[hist.length - 1]
    }
    if (!latestSnapshot) return []

    const filtered = filterGPUNodes(latestSnapshot.gpuNodes || [])
    return filtered.map(g => {
      const total = g.gpuTotal || 0
      const allocated = g.gpuAllocated || 0
      return {
        name: g.name,
        cluster: g.cluster,
        gpuType: resolveGPUType(g.gpuType),
        allocated,
        total,
        free: Math.max(total - allocated, 0),
        utilizationPct: total > 0 ? Math.round((allocated / total) * PERCENT_MULTIPLIER) : 0 }
    })
  })()

  const totalTablePages = Math.max(1, Math.ceil((tableRows || []).length / TABLE_PAGE_SIZE))

  // Clamp page to valid range when filters shrink the row count
  const effectivePage = Math.min(tablePage, totalTablePages - 1)

  const paginatedRows = (() => {
    const start = effectivePage * TABLE_PAGE_SIZE
    return (tableRows || []).slice(start, start + TABLE_PAGE_SIZE)
  })()

  const usagePercent = currentTotals.total > 0
    ? Math.round((currentTotals.allocated / currentTotals.total) * PERCENT_MULTIPLIER)
    : 0

  const getUsageColor = () => {
    if (usagePercent >= HIGH_USAGE_PCT) return 'text-red-400'
    if (usagePercent >= MEDIUM_USAGE_PCT) return 'text-yellow-400'
    return 'text-green-400'
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  // ── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full w-full min-w-0 flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={CHART_HEIGHT_STANDARD} className="flex-1" />
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────
  if ((gpuNodes || []).length === 0 && (history || []).length === 0 && !showDemo) {
    return (
      <div className="h-full w-full min-w-0 flex flex-col content-loaded">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">{t('cards:gpuInventoryHistory.noData', 'No GPU History')}</p>
          <p className="text-sm text-muted-foreground">{t('cards:gpuInventoryHistory.noDataDescription', 'No historical GPU data available yet. Data is collected every 10 minutes.')}</p>
        </div>
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t('common:common.loading', 'Loading...')}</div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">{t('cards:gpuInventoryHistory.loadFailed', 'Failed to load GPU inventory')}</p>
          <p className="text-xs mt-1">{t('cards:gpuInventoryHistory.tryRefresh', 'Please refresh the page to try again.')}</p>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────
  // Header uses flex-wrap so controls reflow onto a second line when the card
  // is narrow, preventing overlap and ensuring the snapshots label stays
  // visible. w-full + min-w-0 on the root and inner flex containers ensures
  // the card fills its grid column without forcing horizontal overflow.
  return (
    <div className="h-full w-full min-w-0 flex flex-col content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
            {(chartData || []).length} {t('cards:gpuInventoryHistory.snapshots', 'snapshots')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* GPU Type filter dropdown */}
          {availableGPUTypes.length > 1 && (
            <div className="relative" ref={typeDropdownRef}>
              <button
                onClick={() => { setShowTypeDropdown(v => !v); setShowNodeDropdown(false) }}
                className={cn(
                  'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                  selectedGPUType !== 'all'
                    ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
                )}
                title={t('cards:gpuInventoryHistory.filterByType', 'Filter by GPU type')}
              >
                <Cpu className="w-3 h-3" />
                <span className="max-w-[80px] truncate">{selectedGPUType === 'all' ? t('cards:gpuInventoryHistory.allTypes', 'All Types') : selectedGPUType}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] rounded-md border border-border bg-popover shadow-lg py-1">
                  <button
                    onClick={() => { setSelectedGPUType('all'); setShowTypeDropdown(false) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                      selectedGPUType === 'all' ? 'text-purple-400 font-medium' : 'text-foreground',
                    )}
                  >
                    {t('cards:gpuInventoryHistory.allTypes', 'All Types')}
                  </button>
                  {(availableGPUTypes || []).map(type => (
                    <button
                      key={type}
                      onClick={() => { setSelectedGPUType(type); setShowTypeDropdown(false) }}
                      className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                        selectedGPUType === type ? 'text-purple-400 font-medium' : 'text-foreground',
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Node filter dropdown */}
          {availableNodes.length > 1 && (
            <div className="relative" ref={nodeDropdownRef}>
              <button
                onClick={() => { setShowNodeDropdown(v => !v); setShowTypeDropdown(false) }}
                className={cn(
                  'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                  selectedNode !== 'all'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
                )}
                title={t('cards:gpuInventoryHistory.filterByNode', 'Filter by node')}
              >
                <Server className="w-3 h-3" />
                <span className="max-w-[80px] truncate">{selectedNode === 'all' ? t('cards:gpuInventoryHistory.allNodes', 'All Nodes') : selectedNode}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showNodeDropdown && (
                <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1">
                  <button
                    onClick={() => { setSelectedNode('all'); setShowNodeDropdown(false) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                      selectedNode === 'all' ? 'text-blue-400 font-medium' : 'text-foreground',
                    )}
                  >
                    {t('cards:gpuInventoryHistory.allNodes', 'All Nodes')}
                  </button>
                  {(availableNodes || []).map(node => (
                    <button
                      key={node}
                      onClick={() => { setSelectedNode(node); setShowNodeDropdown(false) }}
                      className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors truncate',
                        selectedNode === node ? 'text-blue-400 font-medium' : 'text-foreground',
                      )}
                    >
                      {node}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cluster filter */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={() => setLocalClusterFilter([])}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button
              onClick={() => setViewMode('chart')}
              className={cn(
                'p-1 transition-colors',
                viewMode === 'chart' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title={t('cards:gpuInventoryHistory.chartView', 'Chart view')}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1 transition-colors',
                viewMode === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title={t('cards:gpuInventoryHistory.tableView', 'Table view')}
            >
              <Table2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats row — 2 columns on narrow widths, 4 columns from sm (>=640px) */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.total} total GPUs`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">{t('common:common.total', 'Total')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.total}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs allocated`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common:common.used', 'In Use')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs available`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common:common.free', 'Free')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50 border border-border" title={`${usagePercent}% GPU utilization — trend: ${trend}`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendIcon className={`w-3 h-3 ${getUsageColor()}`} aria-hidden="true" />
            <span className={`text-xs ${getUsageColor()}`}>{t('cards:gpuInventoryHistory.trend', 'Trend')}</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 min-h-[160px]">
        {viewMode === 'chart' ? (
          <>
            {/* Chart mode toggle (aggregate vs by-type) */}
            {availableGPUTypes.length > 1 && selectedGPUType === 'all' && (
              <div className="flex items-center gap-1 mb-1">
                <button
                  onClick={() => setChartMode('aggregate')}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                    chartMode === 'aggregate' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.aggregate', 'Aggregate')}
                </button>
                <button
                  onClick={() => setChartMode('by-type')}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                    chartMode === 'by-type' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.byType', 'By Type')}
                </button>
              </div>
            )}
            {(chartData || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t('cards:gpuInventoryHistory.collecting', 'Collecting data...')}
              </div>
            ) : (
              <div
                style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }}
                role="img"
                aria-label={`GPU inventory history chart: ${currentTotals.allocated} of ${currentTotals.total} GPUs in use (${usagePercent}% utilization), trend: ${trend}`}
              >
                <GPUInventoryChart
                  displayChartData={displayChartData}
                  chartMode={chartMode}
                  chartGPUTypes={chartGPUTypes}
                  t={t}
                />
              </div>
            )}
          </>
        ) : (
          /* Table view — per-node, per-type breakdown */
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">
                    <span className="flex items-center gap-1">
                      <Server className="w-3 h-3" />
                      {t('cards:gpuInventoryHistory.node', 'Node')}
                    </span>
                  </th>
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.cluster', 'Cluster')}</th>
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.type', 'Type')}</th>
                  <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">
                    <span className="flex items-center justify-end gap-1">
                      <ArrowUpDown className="w-3 h-3" />
                      {t('cards:gpuInventoryHistory.utilization', 'Util.')}
                    </span>
                  </th>
                  <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.allocFree', 'Alloc/Free')}</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedRows || []).map((row, idx) => (
                  <tr key={`${row.name}-${row.cluster}-${idx}`} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-1.5 px-1 text-foreground truncate max-w-[120px]" title={row.name}>{row.name}</td>
                    <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[80px]" title={row.cluster}>{row.cluster}</td>
                    <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[100px]" title={row.gpuType}>{row.gpuType}</td>
                    <td className="py-1.5 px-1 text-right">
                      <span className={cn(
                        'font-medium',
                        row.utilizationPct >= HIGH_USAGE_PCT ? 'text-red-400' :
                        row.utilizationPct >= MEDIUM_USAGE_PCT ? 'text-yellow-400' : 'text-green-400',
                      )}>
                        {row.utilizationPct}%
                      </span>
                    </td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">
                      {row.allocated}/{row.free}
                    </td>
                  </tr>
                ))}
                {(paginatedRows || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      {t('cards:gpuInventoryHistory.noMatchingNodes', 'No matching nodes')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalTablePages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-y-2 mt-2 text-xs text-muted-foreground">
                <span>{t('cards:gpuInventoryHistory.showing', 'Showing')} {tablePage * TABLE_PAGE_SIZE + 1}-{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, (tableRows || []).length)} {t('cards:gpuInventoryHistory.of', 'of')} {(tableRows || []).length}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setTablePage(p => Math.max(0, p - 1))}
                    disabled={tablePage === 0}
                    className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    {t('common:common.prev', 'Prev')}
                  </button>
                  <button
                    onClick={() => setTablePage(p => Math.min(totalTablePages - 1, p + 1))}
                    disabled={tablePage >= totalTablePages - 1}
                    className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    {t('common:common.next', 'Next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — stats + churn metrics */}
      {(chartData || []).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t('cards:gpuInventoryHistory.peakUsage', 'Peak')}:{' '}
            <span className="text-foreground font-medium">
              {Math.max(...(chartData || []).map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.minUsage', 'Min')}:{' '}
            <span className="text-foreground font-medium">
              {Math.min(...(chartData || []).map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.avgUsage', 'Avg')}:{' '}
            <span className="text-foreground font-medium">
              {meanAllocatedGPUs} GPUs
            </span>
          </span>
          {churnMetrics && (
            <>
              <span title={t('cards:gpuInventoryHistory.arrivalRateTooltip', 'Average GPUs newly allocated per snapshot interval')}>
                {t('cards:gpuInventoryHistory.arrivalRate', 'Arrival')}:{' '}
                <span className="text-foreground font-medium">
                  +{churnMetrics.arrivalRate.toFixed(1)}/{snapshotIntervalMin} min
                </span>
              </span>
              <span title={t('cards:gpuInventoryHistory.departureRateTooltip', 'Average GPUs freed per snapshot interval')}>
                {t('cards:gpuInventoryHistory.departureRate', 'Departure')}:{' '}
                <span className="text-foreground font-medium">
                  -{churnMetrics.departureRate.toFixed(1)}/{snapshotIntervalMin} min
                </span>
              </span>
              {churnMetrics.avgDurationIntervals > 0 && (
                <span title={t('cards:gpuInventoryHistory.avgDurationTooltip', 'Approximate average allocation duration in snapshot intervals (~10 min each)')}>
                  {t('cards:gpuInventoryHistory.avgDuration', 'Avg Duration')}:{' '}
                  <span className="text-foreground font-medium">
                    {formatIntervalDuration(churnMetrics.avgDurationIntervals)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
