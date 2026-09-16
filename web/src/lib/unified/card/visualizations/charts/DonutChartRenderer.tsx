/**
 * DonutChartRenderer - Donut chart renderer for ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import { EMPHASIS_SHADOW_COLOR } from '../../../../constants'
import {
  DEFAULT_COLORS,
  CHART_THEME_COLORS,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
  type ChartRendererProps } from './chartTheme'

/**
 * Donut Chart Renderer
 */
export function DonutChartRenderer({
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
      textStyle: { color: CHART_THEME_COLORS.tooltipText, fontSize: 12 },
    },
    legend: showLegend ? {
      data: typedData.map(d => d.name),
      bottom: 0,
      textStyle: { color: CHART_THEME_COLORS.legendText, fontSize: 11 },
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
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: EMPHASIS_SHADOW_COLOR },
      },
    }],
  }), [typedData, showLegend])

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}
