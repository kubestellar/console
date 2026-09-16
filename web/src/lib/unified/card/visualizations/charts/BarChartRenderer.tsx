/**
 * BarChartRenderer - Bar chart renderer for ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import {
  DEFAULT_COLORS,
  CHART_THEME_COLORS,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
  normalizeAxisConfig,
  type ChartRendererProps } from './chartTheme'

/**
 * Bar Chart Renderer
 */
export function BarChartRenderer({
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
      axisLabel: { color: CHART_THEME_COLORS.axisLabel, fontSize: 11 },
      axisLine: { lineStyle: { color: CHART_THEME_COLORS.axisLine } },
      axisTick: { lineStyle: { color: CHART_THEME_COLORS.axisTick } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: CHART_THEME_COLORS.axisLabel, fontSize: 11 },
      axisLine: { lineStyle: { color: CHART_THEME_COLORS.axisLine } },
      axisTick: { lineStyle: { color: CHART_THEME_COLORS.axisTick } },
      splitLine: { lineStyle: { color: CHART_THEME_COLORS.gridLine, type: 'dashed' as const } },
      name: yAxis?.label,
      nameTextStyle: { color: CHART_THEME_COLORS.axisLabel },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: CHART_THEME_COLORS.tooltipText, fontSize: 12 },
    },
    legend: showLegend ? {
      data: series.map(s => s.label ?? s.field),
      bottom: 0,
      textStyle: { color: CHART_THEME_COLORS.legendText, fontSize: 11 },
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
