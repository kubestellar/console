/**
 * ChartVisualization - Renders data as various chart types
 *
 * Supports: line, bar, donut, gauge, sparkline, area
 * Uses echarts-for-react for rendering.
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../components/charts/LazyEChart'
import type { CardContentChart, CardChartSeries, CardAxisConfig } from '../../types'
import { CHART_TOOLTIP_CONTENT_STYLE_GRAY } from '../../../constants'

export interface ChartVisualizationProps {
  /** Content configuration */
  content: CardContentChart
  /** Data to display */
  data: unknown[]
}

// Default color palette for series
const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
]

/**
 * ChartVisualization - Renders charts from config
 */
export function ChartVisualization({ content, data }: ChartVisualizationProps) {
  const {
    chartType,
    series: rawSeries,
    xAxis,
    yAxis,
    showLegend = true,
    height = 200 } = content

  // Derive series from yAxis if not explicitly provided
  const series: CardChartSeries[] = rawSeries ?? (
    Array.isArray(yAxis)
      ? yAxis.map(field => ({ field }))
      : yAxis && typeof yAxis === 'string'
        ? [{ field: yAxis }]
        : []
  )

  // Render the appropriate chart type
  switch (chartType) {
    case 'line':
      return (
        <LineChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'area':
      return (
        <AreaChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'bar':
      return (
        <BarChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'donut':
      return (
        <DonutChartRenderer
          data={data}
          series={series}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'gauge':
      return (
        <GaugeChartRenderer
          data={data}
          series={series}
          height={height}
        />
      )

    case 'sparkline':
      return (
        <SparklineRenderer
          data={data}
          series={series}
          height={height}
        />
      )

    default:
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Unknown chart type: {chartType}
        </div>
      )
  }
}

interface ChartRendererProps {
  data: unknown[]
  series: CardChartSeries[]
  xAxis?: CardAxisConfig | string
  yAxis?: CardAxisConfig | string | string[]
  showLegend?: boolean
  height: number
}

/**
 * Normalize axis config to full CardAxisConfig object
 */
function normalizeAxisConfig(axis?: CardAxisConfig | string | string[]): CardAxisConfig | undefined {
  if (!axis) return undefined
  if (typeof axis === 'string') {
    return { field: axis }
  }
  if (Array.isArray(axis)) {
    return { field: axis[0] }
  }
  return axis
}

/** Extract tooltip style from the GRAY constant */
const TOOLTIP_BG = (CHART_TOOLTIP_CONTENT_STYLE_GRAY as Record<string, unknown>).backgroundColor as string
const TOOLTIP_BORDER = (CHART_TOOLTIP_CONTENT_STYLE_GRAY as Record<string, unknown>).borderColor as string

/**
 * Line Chart Renderer
 */
function LineChartRenderer({
  data,
  series,
  xAxis: xAxisProp,
  yAxis: yAxisProp,
  showLegend,
  height }: ChartRendererProps) {
  const xAxis = normalizeAxisConfig(xAxisProp)
  const yAxis = normalizeAxisConfig(yAxisProp)
  const xField = xAxis?.field ?? 'time'
  const typedData = data as Record<string, unknown>[]

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 10, top: 10, bottom: showLegend ? 40 : 25 },
    xAxis: {
      type: 'category' as const,
      data: typedData.map(d => d[xField]),
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
      splitLine: { lineStyle: { color: '#374151', type: 'dashed' as const } },
      name: yAxis?.label,
      nameTextStyle: { color: '#9ca3af' },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: showLegend ? {
      data: series.map(s => s.label ?? s.field),
      bottom: 0,
      textStyle: { color: '#e5e7eb', fontSize: 11 },
    } : undefined,
    series: series.map((s, i) => ({
      name: s.label ?? s.field,
      type: 'line',
      data: typedData.map(d => d[s.field]),
      smooth: true,
      showSymbol: false,
      lineStyle: {
        color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        width: 2,
        ...(s.style === 'dashed' ? { type: 'dashed' as const } : s.style === 'dotted' ? { type: 'dotted' as const } : {}),
      },
      itemStyle: { color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] },
    })),
  }), [typedData, series, xField, yAxis, showLegend])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}

/**
 * Area Chart Renderer
 */
function AreaChartRenderer({
  data,
  series,
  xAxis: xAxisProp,
  yAxis: yAxisProp,
  showLegend,
  height }: ChartRendererProps) {
  const xAxis = normalizeAxisConfig(xAxisProp)
  const yAxis = normalizeAxisConfig(yAxisProp)
  const xField = xAxis?.field ?? 'time'
  const typedData = data as Record<string, unknown>[]

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 10, top: 10, bottom: showLegend ? 40 : 25 },
    xAxis: {
      type: 'category' as const,
      data: typedData.map(d => d[xField]),
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
      splitLine: { lineStyle: { color: '#374151', type: 'dashed' as const } },
      name: yAxis?.label,
      nameTextStyle: { color: '#9ca3af' },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: showLegend ? {
      data: series.map(s => s.label ?? s.field),
      bottom: 0,
      textStyle: { color: '#e5e7eb', fontSize: 11 },
    } : undefined,
    series: series.map((s, i) => {
      const color = s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
      return {
        name: s.label ?? s.field,
        type: 'line',
        data: typedData.map(d => d[s.field]),
        smooth: true,
        showSymbol: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.3 },
      }
    }),
  }), [typedData, series, xField, yAxis, showLegend])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}

/**
 * Bar Chart Renderer
 */
function BarChartRenderer({
  data,
  series,
  xAxis: xAxisProp,
  yAxis: yAxisProp,
  showLegend,
  height }: ChartRendererProps) {
  const xAxis = normalizeAxisConfig(xAxisProp)
  const yAxis = normalizeAxisConfig(yAxisProp)
  const xField = xAxis?.field ?? 'name'
  const typedData = data as Record<string, unknown>[]

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 10, top: 10, bottom: showLegend ? 40 : 25 },
    xAxis: {
      type: 'category' as const,
      data: typedData.map(d => d[xField]),
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisTick: { lineStyle: { color: '#4b5563' } },
      splitLine: { lineStyle: { color: '#374151', type: 'dashed' as const } },
      name: yAxis?.label,
      nameTextStyle: { color: '#9ca3af' },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: showLegend ? {
      data: series.map(s => s.label ?? s.field),
      bottom: 0,
      textStyle: { color: '#e5e7eb', fontSize: 11 },
    } : undefined,
    series: series.map((s, i) => ({
      name: s.label ?? s.field,
      type: 'bar',
      data: typedData.map(d => d[s.field]),
      itemStyle: {
        color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        borderRadius: [4, 4, 0, 0],
      },
    })),
  }), [typedData, series, xField, yAxis, showLegend])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}

/**
 * Donut Chart Renderer
 */
function DonutChartRenderer({
  data,
  series,
  showLegend,
  height }: Omit<ChartRendererProps, 'xAxis' | 'yAxis'>) {
  const chartData = (() => {
    if (series.length === 0) return data
    const primarySeries = series.find((s) => s.primary) ?? series[0]
    if (!primarySeries) return data
    return (data as Record<string, unknown>[]).map((item, i) => ({
      name: String(item.name ?? item.label ?? `Item ${i + 1}`),
      value: Number(item[primarySeries.field] ?? 0),
      color: series[i]?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }))
  })()

  const typedData = chartData as Array<{ name: string; value: number; color?: string }>

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: showLegend ? {
      data: typedData.map(d => d.name),
      bottom: 0,
      textStyle: { color: '#e5e7eb', fontSize: 11 },
    } : undefined,
    series: [{
      type: 'pie',
      radius: ['60%', '80%'],
      center: ['50%', '50%'],
      padAngle: 2,
      data: typedData.map((d, i) => ({
        value: d.value,
        name: d.name,
        itemStyle: { color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] },
      })),
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
      },
    }],
  }), [typedData, showLegend])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}

/**
 * Gauge Chart Renderer (simplified as a half-donut)
 */
function GaugeChartRenderer({
  data,
  series,
  height }: Omit<ChartRendererProps, 'xAxis' | 'yAxis' | 'showLegend'>) {
  const value = (() => {
    if (data.length === 0 || series.length === 0) return 0
    const firstItem = data[0] as Record<string, unknown>
    return Number(firstItem[series[0].field] ?? 0)
  })()

  const clampedValue = Math.min(100, Math.max(0, value))
  const color = value >= 90 ? '#ef4444' : value >= 70 ? '#f59e0b' : '#22c55e'

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'pie',
      radius: ['60%', '80%'],
      center: ['50%', '70%'],
      startAngle: 180,
      silent: true,
      data: [
        { value: clampedValue, name: 'value', itemStyle: { color } },
        { value: 100 - clampedValue, name: 'remaining', itemStyle: { color: '#374151' } },
      ],
      label: { show: false },
    }],
  }), [clampedValue, color])

  return (
    <div style={{ width: '100%', height }} className="relative">
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
      <div className="absolute inset-0 flex items-center justify-center pt-4">
        <span className="text-2xl font-bold text-foreground">{Math.round(value)}%</span>
      </div>
    </div>
  )
}

/**
 * Sparkline Renderer (minimal line chart)
 */
function SparklineRenderer({
  data,
  series,
  height }: Omit<ChartRendererProps, 'xAxis' | 'yAxis' | 'showLegend'>) {
  if (series.length === 0) {
    return <div className="text-muted-foreground text-sm">No series configured</div>
  }

  const primarySeries = series[0]
  const typedData = data as Record<string, unknown>[]

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    xAxis: { type: 'category' as const, show: false, data: typedData.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false },
    series: [{
      type: 'line',
      data: typedData.map(d => d[primarySeries.field]),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: primarySeries.color ?? DEFAULT_COLORS[0], width: 2 },
      itemStyle: { color: primarySeries.color ?? DEFAULT_COLORS[0] },
    }],
  }), [typedData, primarySeries])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}

export default ChartVisualization
