import { useMemo } from 'react'
import { LazyEChart } from '../../charts/LazyEChart'
import { CHART_HEIGHT_STANDARD, CHART_GRID_STROKE, CHART_AXIS_STROKE, CHART_TOOLTIP_CONTENT_STYLE, CHART_TICK_COLOR, CHART_AXIS_FONT_SIZE, CHART_BODY_FONT_SIZE } from '../../../lib/constants'
import { ORANGE_500, YELLOW_500, GREEN_500_BRIGHT, hexToRgba } from '../../../lib/theme/chartColors'

export interface HealthPoint {
  time: string
  healthy: number
  issues: number
  pending: number
}

/** Opacity at the top of area-fill gradients */
const AREA_GRADIENT_TOP_ALPHA = 0.4
/** Opacity at the bottom of area-fill gradients (fully transparent) */
const AREA_GRADIENT_BOTTOM_ALPHA = 0

const CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const

export function PodHealthTrendChart({ visibleHistory }: { visibleHistory: HealthPoint[] }) {
  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: visibleHistory.map(d => d.time),
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
    },
    series: [
      {
        name: 'Issues',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.issues),
        lineStyle: { color: ORANGE_500, width: 2 },
        itemStyle: { color: ORANGE_500 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(ORANGE_500, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(ORANGE_500, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Pending',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.pending),
        lineStyle: { color: YELLOW_500, width: 2 },
        itemStyle: { color: YELLOW_500 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(YELLOW_500, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(YELLOW_500, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Healthy',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.healthy),
        lineStyle: { color: GREEN_500_BRIGHT, width: 2 },
        itemStyle: { color: GREEN_500_BRIGHT },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(GREEN_500_BRIGHT, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(GREEN_500_BRIGHT, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Issues (trend)',
        type: 'line',
        data: visibleHistory.map(d => d.issues),
        smooth: true,
        lineStyle: { color: ORANGE_500, width: 2, type: 'dashed' as const },
        itemStyle: { color: ORANGE_500 },
        showSymbol: false,
        silent: true,
      },
    ],
  }), [visibleHistory])

  return (
    <div className="flex-1 min-h-[160px]">
      {visibleHistory.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          No pod data available
        </div>
      ) : (
        <div style={CHART_CONTAINER_STYLE}>
          <LazyEChart
            option={chartOption}
            style={CHART_STYLE}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
        </div>
      )}
    </div>
  )
}
