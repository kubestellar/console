/**
 * SparklineRenderer - Minimal line chart renderer for ChartVisualization
 */

import { useMemo } from 'react'
import { LazyEChart } from '../../../../../components/charts/LazyEChart'
import { DEFAULT_COLORS, type ChartRendererProps } from './chartTheme'

/**
 * Sparkline Renderer (minimal line chart)
 */
export function SparklineRenderer({
  data,
  series,
  height }: Omit<ChartRendererProps, 'xAxis' | 'yAxis' | 'showLegend'>) {
  const primarySeries = series[0]
  const typedData = data as Record<string, unknown>[]
  const option = useMemo(() => {
    if (!primarySeries) {
      return null
    }

    return {
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
    }
  }, [typedData, primarySeries])

  if (!option) {
    return <div className="text-muted-foreground text-sm">No series configured</div>
  }

  return (
    <div style={{ width: '100%', height }}>
      <LazyEChart option={option} style={{ height, width: '100%' }} notMerge={true} opts={{ renderer: 'svg' }} />
    </div>
  )
}
