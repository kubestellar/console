/**
 * BarChartRenderer - Bar chart renderer for ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import {
  DEFAULT_COLORS,
  normalizeAxisConfig,
  buildCategoryAxisChartOption,
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
    ...buildCategoryAxisChartOption(typedData, xField, series, showLegend, yAxis),
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
