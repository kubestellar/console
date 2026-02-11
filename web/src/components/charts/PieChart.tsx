import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface DataItem {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface PieChartProps {
  data: DataItem[]
  size?: number
  innerRadius?: number
  showLegend?: boolean
  title?: string
  centerLabel?: string
  centerValue?: string | number
}

export function PieChart({
  data,
  size = 150,
  innerRadius = 0,
  showLegend = true,
  title,
  centerLabel,
  centerValue,
}: PieChartProps) {
  const isDonut = innerRadius > 0

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div className="flex items-center gap-4">
        <div className="relative" style={{ width: size, height: size, minWidth: size, minHeight: size }}>
          <ResponsiveContainer width={size} height={size} minWidth={size} minHeight={size}>
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={size / 2 - 5}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1e2e',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e0e0e0',
                }}
                labelStyle={{ color: '#ccc', fontWeight: 500 }}
                itemStyle={{ color: '#e0e0e0' }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
          {isDonut && (centerLabel || centerValue) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {centerValue && (
                <span className="text-2xl font-bold text-foreground">{centerValue}</span>
              )}
              {centerLabel && (
                <span className="text-xs text-muted-foreground">{centerLabel}</span>
              )}
            </div>
          )}
        </div>
        {showLegend && (
          <div className="flex-1 space-y-2">
            {data.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Donut chart shorthand
interface DonutChartProps extends Omit<PieChartProps, 'innerRadius'> {
  thickness?: number
}

export function DonutChart({ thickness = 20, size = 150, ...props }: DonutChartProps) {
  const innerRadius = size / 2 - thickness - 5
  return <PieChart {...props} size={size} innerRadius={Math.max(innerRadius, 20)} />
}
