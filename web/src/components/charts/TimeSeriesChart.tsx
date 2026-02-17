import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import { CHART_TOOLTIP_BG, CHART_TICK_COLOR } from '../../lib/constants'

interface DataPoint {
  time: string
  value: number
  [key: string]: string | number
}

interface TimeSeriesChartProps {
  data: DataPoint[]
  dataKey?: string
  color?: string
  gradient?: boolean
  showGrid?: boolean
  showAxis?: boolean
  height?: number
  unit?: string
  title?: string
}

export function TimeSeriesChart({
  data,
  dataKey = 'value',
  color = '#9333ea',
  gradient = true,
  showGrid = false,
  showAxis = true,
  height = 200,
  unit = '',
  title,
}: TimeSeriesChartProps) {
  const gradientId = `gradient-${dataKey}`

  if (gradient) {
    return (
      <div className="w-full">
        {title && (
          <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
        )}
        <div style={{ minHeight: Math.max(height, 100), width: '100%' }}>
        <ResponsiveContainer width="100%" height={height} minHeight={100}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            )}
            {showAxis && (
              <>
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={{ stroke: '#333' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}${unit}`}
                />
              </>
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_TOOLTIP_BG,
                border: '1px solid #333',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: CHART_TICK_COLOR }}
              itemStyle={{ color: '#fff' }}
              formatter={(value) => [`${value}${unit}`, dataKey]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: Math.max(height, 100), width: '100%' }}>
      <ResponsiveContainer width="100%" height={height} minHeight={100}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          )}
          {showAxis && (
            <>
              <XAxis
                dataKey="time"
                tick={{ fill: '#888', fontSize: 10 }}
                axisLine={{ stroke: '#333' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

// Multi-line chart for comparing multiple series
interface MultiSeriesChartProps {
  data: DataPoint[]
  series: Array<{
    dataKey: string
    color: string
    name?: string
  }>
  height?: number
  showGrid?: boolean
  title?: string
}

export function MultiSeriesChart({
  data,
  series,
  height = 200,
  showGrid = false,
  title,
}: MultiSeriesChartProps) {
  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: Math.max(height, 100), width: '100%' }}>
      <ResponsiveContainer width="100%" height={height} minHeight={100}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          )}
          <XAxis
            dataKey="time"
            tick={{ fill: '#888', fontSize: 10 }}
            axisLine={{ stroke: '#333' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#888', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
            }}
          />
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              name={s.name || s.dataKey}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
