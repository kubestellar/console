/**
 * GaugeChartRenderer - Gauge chart renderer (simplified as a half-donut) for
 * ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import { CHART_THEME_COLORS, type ChartRendererProps } from './chartTheme'

/**
 * Gauge Chart Renderer (simplified as a half-donut)
 */
export function GaugeChartRenderer({
  data,
  series,
  height }: Omit<ChartRendererProps, 'xAxis' | 'yAxis' | 'showLegend'>) {
  const value = (() => {
    if (data.length === 0 || series.length === 0) return 0
    const firstItem = data[0] as Record<string, unknown>
    return Number(firstItem[series[0].field] ?? 0)
  })()

  const clampedValue = Math.min(100, Math.max(0, value))
  const color = value >= 90
    ? CHART_THEME_COLORS.gaugeCritical
    : value >= 70
      ? CHART_THEME_COLORS.gaugeWarning
      : CHART_THEME_COLORS.gaugeHealthy

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
        { value: 100 - clampedValue, name: 'remaining', itemStyle: { color: CHART_THEME_COLORS.gaugeRemaining } },
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
