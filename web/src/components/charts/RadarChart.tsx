import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { CHART_TOOLTIP_BG } from '../../lib/constants'

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
  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: size, width: '100%' }}>
      <ResponsiveContainer width="100%" height={size} minHeight={size}>
        <RechartsRadarChart data={data}>
          {showGrid && <PolarGrid stroke="#333" />}
          {showAxis && (
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: '#888', fontSize: 10 }}
            />
          )}
          <PolarRadiusAxis
            tick={{ fill: '#666', fontSize: 9 }}
            axisLine={false}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Radar
            dataKey={dataKey}
            stroke={color}
            fill={color}
            fillOpacity={fillOpacity}
            strokeWidth={2}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
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
  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: size, width: '100%' }}>
      <ResponsiveContainer width="100%" height={size} minHeight={size}>
        <RechartsRadarChart data={data}>
          {showGrid && <PolarGrid stroke="#333" />}
          <PolarAngleAxis
            dataKey="name"
            tick={{ fill: '#888', fontSize: 10 }}
          />
          <PolarRadiusAxis
            tick={{ fill: '#666', fontSize: 9 }}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
            }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
            />
          )}
          {series.map((s) => (
            <Radar
              key={s.dataKey}
              name={s.name || s.dataKey}
              dataKey={s.dataKey}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </RechartsRadarChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
