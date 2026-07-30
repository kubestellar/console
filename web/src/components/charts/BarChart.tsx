import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_TEXT_COLOR,
  CHART_TOOLTIP_LABEL_COLOR,
  CHART_TICK_COLOR,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
} from '../../lib/constants'
import type { CSSProperties } from 'react'

// Inline style constants
const BAR_CHART_DIV_STYLE_1: CSSProperties = { minWidth: 0 }


interface DataItem {
  name: string
  value: number
  color?: string
}

interface BarChartProps {
  data: DataItem[]
  color?: string
  height?: number
  showGrid?: boolean
  horizontal?: boolean
  title?: string
  unit?: string
}

export function BarChart({
  data,
  color = '#9333ea',
  height = 200,
  showGrid = false,
  horizontal = false,
  title,
  unit = '',
}: BarChartProps) {
  const option = useMemo(() => {
    const categoryData = data.map(d => d.name)
    const valueData = data.map(d => d.value)
    const colorData = data.map(d => d.color || color)

    const categoryAxis = {
      type: 'category' as const,
      data: categoryData,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: horizontal ? { show: false } : { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    }

    const valueAxis = {
      type: 'value' as const,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: showGrid ? { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } } : { show: false },
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: horizontal ? 65 : 45, right: 20, top: 5, bottom: 5, containLabel: false },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis, axisLabel: { ...categoryAxis.axisLabel, width: 55, overflow: 'truncate' as const } } : valueAxis,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow-sm' as const },
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
        formatter: (params: Array<{ name: string; value: number; color: string }>) => {
          const p = Array.isArray(params) ? params[0] : params
          return `<span style="color:${CHART_TOOLTIP_LABEL_COLOR};font-weight:500">${p.name}</span><br/><span style="color:${CHART_TOOLTIP_TEXT_COLOR}">${p.value}${unit}</span>`
        },
      },
      series: [{
        type: 'bar',
        data: valueData.map((v, i) => ({ value: v, itemStyle: { color: colorData[i] } })),
        barMaxWidth: 80,
        itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      }],
    }
  }, [data, color, horizontal, showGrid, unit])

  return (
    <div className="w-full overflow-hidden" style={BAR_CHART_DIV_STYLE_1}>
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <ReactECharts
        option={option}
        style={{ height, width: '100%' }}
        notMerge={true}
        opts={{ renderer: 'svg' }}
      />
    </div>
  )
}

// Stacked bar chart for comparing categories
interface StackedBarChartProps {
  data: Array<Record<string, string | number>>
  categories: Array<{
    dataKey: string
    color: string
    name?: string
  }>
  xAxisKey?: string
  height?: number
  title?: string
}

export function StackedBarChart({
  data,
  categories,
  xAxisKey = 'name',
  height = 200,
  title,
}: StackedBarChartProps) {
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 45, right: 20, top: 5, bottom: 5, containLabel: false },
    xAxis: {
      type: 'category' as const,
      data: data.map(d => d[xAxisKey]),
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow-sm' as const },
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
    },
    series: categories.map(cat => ({
      name: cat.name || cat.dataKey,
      type: 'bar',
      stack: 'total',
      data: data.map(d => d[cat.dataKey]),
      itemStyle: { color: cat.color },
      barMaxWidth: 80,
    })),
  }), [data, categories, xAxisKey])

  return (
    <div className="w-full overflow-hidden" style={BAR_CHART_DIV_STYLE_1}>
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <ReactECharts
        option={option}
        style={{ height, width: '100%' }}
        notMerge={true}
        opts={{ renderer: 'svg' }}
      />
    </div>
  )
}
