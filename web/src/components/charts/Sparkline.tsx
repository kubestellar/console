import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from 'recharts'

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
  const chartData = data.map((value, index) => ({ value, index }))

  if (fill) {
    return (
      <div style={{ width: width || '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`sparkline-gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#sparkline-gradient-${color})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div style={{ width: width || '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={showDot ? { fill: color, r: 2 } : false}
          />
        </LineChart>
      </ResponsiveContainer>
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
  const trendIcon = trend === undefined ? '' : trend >= 0 ? '↑' : '↓'

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
        <span className="text-2xl font-bold text-white">
          {value}
          {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
        </span>
        <Sparkline data={data} color={color} height={24} width={60} fill />
      </div>
    </div>
  )
}
