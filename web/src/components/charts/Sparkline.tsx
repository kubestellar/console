import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  width?: number
  fill?: boolean
  showDot?: boolean
}

export function Sparkline({
  data,
  color = '#9333ea',
  height = 30,
  width,
  fill = false,
  showDot = false,
}: SparklineProps) {
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    xAxis: { type: 'category' as const, show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false },
    series: [{
      type: 'line',
      data,
      smooth: true,
      showSymbol: showDot,
      symbolSize: showDot ? 4 : 0,
      lineStyle: { color, width: 1.5 },
      itemStyle: { color },
      ...(fill ? {
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '4D' },
              { offset: 1, color: color + '00' },
            ],
          },
        },
      } : {}),
    }],
  }), [data, color, fill, showDot])

  return (
    <div style={{ width: width || '100%', height, minHeight: height }}>
      <ReactECharts
        option={option}
        style={{ height, width: '100%' }}
        notMerge={true}
        opts={{ renderer: 'svg' }}
      />
    </div>
  )
}

// Stat card with sparkline
interface StatWithSparklineProps {
  label: string
  value: string | number
  trend?: number // percentage change
  data: number[]
  color?: string
  unit?: string
}

export function StatWithSparkline({
  label,
  value,
  trend,
  data,
  color = '#9333ea',
  unit = '',
}: StatWithSparklineProps) {
  const trendColor = trend === undefined ? '' : trend >= 0 ? 'text-green-400' : 'text-red-400'
  const trendIcon = trend === undefined ? '' : trend >= 0 ? '\u2191' : '\u2193'

  return (
    <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {trend !== undefined && (
          <span className={`text-xs ${trendColor}`}>
            {trendIcon} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-foreground">
          {value}
          {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
        </span>
        <Sparkline data={data} color={color} height={24} width={60} fill />
      </div>
    </div>
  )
}
