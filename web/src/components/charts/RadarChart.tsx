import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_TEXT_COLOR,
  CHART_TICK_COLOR,
  CHART_GRID_STROKE,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
} from '../../lib/constants'

interface DataPoint {
  name: string
  value: number
  fullMark?: number
  [key: string]: string | number | undefined
}

interface RadarChartProps {
  data: DataPoint[]
  dataKey?: string
  color?: string
  fillOpacity?: number
  size?: number
  showGrid?: boolean
  showAxis?: boolean
  title?: string
}

export function RadarChart({
  data,
  dataKey = 'value',
  color = '#9333ea',
  fillOpacity = 0.3,
  size = 200,
  showGrid = true,
  showAxis = true,
  title,
}: RadarChartProps) {
  const option = useMemo(() => {
    const maxVal = Math.max(...data.map(d => {
      const v = d[dataKey]
      return typeof v === 'number' ? v : 0
    }), 1)

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
      },
      radar: {
        indicator: data.map(d => ({
          name: showAxis ? d.name : '',
          max: d.fullMark || maxVal,
        })),
        shape: 'polygon' as const,
        splitNumber: 4,
        axisName: {
          color: CHART_TICK_COLOR,
          fontSize: CHART_AXIS_FONT_SIZE,
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: CHART_GRID_STROKE },
        },
        splitArea: { show: false },
        axisLine: {
          show: showGrid,
          lineStyle: { color: CHART_GRID_STROKE },
        },
      },
      series: [{
        type: 'radar',
        data: [{
          value: data.map(d => {
            const v = d[dataKey]
            return typeof v === 'number' ? v : 0
          }),
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          areaStyle: { color, opacity: fillOpacity },
        }],
      }],
    }
  }, [data, dataKey, color, fillOpacity, showGrid, showAxis])

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: size, width: '100%' }}>
        <ReactECharts
          option={option}
          style={{ height: size, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}

// Multi-series radar chart for comparing multiple datasets
interface MultiRadarChartProps {
  data: DataPoint[]
  series: Array<{
    dataKey: string
    color: string
    name?: string
  }>
  size?: number
  showGrid?: boolean
  showLegend?: boolean
  title?: string
}

export function MultiRadarChart({
  data,
  series,
  size = 200,
  showGrid = true,
  showLegend = true,
  title,
}: MultiRadarChartProps) {
  const option = useMemo(() => {
    const maxVals = data.map(d => {
      let max = 0
      for (const s of series) {
        const v = d[s.dataKey]
        if (typeof v === 'number' && v > max) max = v
      }
      return max || 100
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
      },
      legend: showLegend ? {
        data: series.map(s => s.name || s.dataKey),
        bottom: 0,
        textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_BODY_FONT_SIZE },
      } : undefined,
      radar: {
        indicator: data.map((d, i) => ({
          name: d.name,
          max: d.fullMark || maxVals[i] || 100,
        })),
        shape: 'polygon' as const,
        axisName: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
        splitLine: {
          show: showGrid,
          lineStyle: { color: CHART_GRID_STROKE },
        },
        splitArea: { show: false },
        axisLine: {
          show: showGrid,
          lineStyle: { color: CHART_GRID_STROKE },
        },
      },
      series: [{
        type: 'radar',
        data: series.map(s => ({
          value: data.map(d => {
            const v = d[s.dataKey]
            return typeof v === 'number' ? v : 0
          }),
          name: s.name || s.dataKey,
          lineStyle: { color: s.color, width: 2 },
          itemStyle: { color: s.color },
          areaStyle: { color: s.color, opacity: 0.2 },
        })),
      }],
    }
  }, [data, series, showGrid, showLegend])

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: size, width: '100%' }}>
        <ReactECharts
          option={option}
          style={{ height: size, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}
