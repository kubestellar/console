import { useMemo } from 'react'
import { LazyEChart } from '../charts/LazyEChart'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_MUTED } from '../../lib/constants'
import { MS_PER_HOUR } from '../../lib/constants/time'

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
const GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const GPU_INVENTORY_HISTORY_CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const
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

type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

/** Extracted chart sub-component to keep the main component readable */
function GPUInventoryChart({ displayChartData, chartMode, chartGPUTypes, t }: {
  displayChartData: GPUHistoryDataPoint[]
  chartMode: ChartMode
  chartGPUTypes: string[]
  t: TranslateFn
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
      style={GPU_INVENTORY_HISTORY_CHART_STYLE}
      notMerge={true}
      opts={{ renderer: 'svg' }}
    />
  )
}

export {
  MIN_TREND_SNAPSHOTS, RECENT_SNAPSHOT_WINDOW, TREND_CHANGE_THRESHOLD,
  HIGH_USAGE_PCT, MEDIUM_USAGE_PCT,
  GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE, GPU_INVENTORY_HISTORY_CHART_STYLE,
  DEMO_POINT_COUNT, DEMO_BASE_TOTAL, DEMO_BASE_ALLOCATED, DEMO_HOURS_RANGE, DEMO_FLUCTUATION,
  PERCENT_MULTIPLIER, UNKNOWN_GPU_TYPE, DEMO_GPU_TYPE_COUNT, DEMO_NODE_COUNT,
  DEFAULT_SNAPSHOT_INTERVAL_MIN, MIN_CHURN_SNAPSHOTS, TABLE_PAGE_SIZE, MAX_CHART_SERIES,
  GPU_TYPE_COLORS, FREE_AREA_COLOR,
  generateDemoData, generateDemoTableRows, resolveGPUType, getTypeColor,
  GPUInventoryChart,
}
export type { ViewMode, ChartMode, GPUHistoryDataPoint, NodeTableRow, ChurnMetrics, TranslateFn }
