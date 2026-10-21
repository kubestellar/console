/**
 * LineChartRenderer - Line chart renderer for ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import {
  DEFAULT_COLORS,
  normalizeAxisConfig,
  buildCategoryAxisChartOption,
  type ChartRendererProps } from './chartTheme'

/**
 * Line Chart Renderer
 */
export function LineChartRenderer({
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
    ...buildCategoryAxisChartOption(typedData, xField, series, showLegend, yAxis),
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
