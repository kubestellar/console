import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

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
  return (
    <div className="w-full overflow-hidden" style={{ minWidth: 0 }}>
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ width: '100%', height, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <ResponsiveContainer width="99%" height={height}>
          <RechartsBarChart
            data={data}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 5, right: 20, left: horizontal ? 60 : 5, bottom: 5 }}
          >
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
            {horizontal ? (
              <>
                <XAxis
                  type="number"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={{ stroke: '#333' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              contentStyle={{
                backgroundColor: '#1e1e2e',
                border: '1px solid #444',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e0e0e0',
              }}
              labelStyle={{ color: '#ccc', fontWeight: 500 }}
              itemStyle={{ color: '#e0e0e0' }}
              formatter={(value) => [`${value}${unit}`, 'Value']}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || color} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
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
  return (
    <div className="w-full overflow-hidden" style={{ minWidth: 0 }}>
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ width: '100%', height, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <ResponsiveContainer width="99%" height={height}>
          <RechartsBarChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: '#888', fontSize: 10 }}
              axisLine={{ stroke: '#333' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#888', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              contentStyle={{
                backgroundColor: '#1e1e2e',
                border: '1px solid #444',
                borderRadius: '8px',
                color: '#e0e0e0',
              }}
              labelStyle={{ color: '#ccc', fontWeight: 500 }}
              itemStyle={{ color: '#e0e0e0' }}
            />
            {categories.map((cat) => (
              <Bar
                key={cat.dataKey}
                dataKey={cat.dataKey}
                stackId="a"
                fill={cat.color}
                name={cat.name || cat.dataKey}
                maxBarSize={80}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
