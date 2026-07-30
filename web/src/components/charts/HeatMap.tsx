import { cn } from '../../lib/cn'

interface HeatMapCell {
  x: string | number
  y: string | number
  value: number
  label?: string
}

interface HeatMapProps {
  data: HeatMapCell[]
  xLabels?: string[]
  yLabels?: string[]
  colorScale?: 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray'
  min?: number
  max?: number
  showValues?: boolean
  cellSize?: number
  title?: string
  formatValue?: (value: number) => string
}

// Color scales for different themes
const COLOR_SCALES = {
  green: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'],
  blue: ['#1e3a5f', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'],
  purple: ['#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd'],
  orange: ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74'],
  red: ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5'],
  gray: ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'],
}

export function HeatMap({
  data,
  xLabels,
  yLabels,
  colorScale = 'purple',
  min,
  max,
  showValues = false,
  cellSize = 40,
  title,
  formatValue = (v) => v.toString(),
}: HeatMapProps) {
  // Calculate min/max from data if not provided
  const values = data.map((d) => d.value)
  const minVal = min ?? (values.length > 0 ? Math.min(...values) : 0)
  const maxVal = max ?? (values.length > 0 ? Math.max(...values) : 0)

  // Get unique x and y values if labels not provided
  const uniqueX = xLabels || [...new Set(data.map((d) => String(d.x)))]
  const uniqueY = yLabels || [...new Set(data.map((d) => String(d.y)))]

  const colors = COLOR_SCALES[colorScale]

  const getColor = (value: number) => {
    if (maxVal === minVal) return colors[Math.floor(colors.length / 2)]
    const normalized = (value - minVal) / (maxVal - minVal)
    const index = Math.floor(normalized * (colors.length - 1))
    return colors[Math.min(index, colors.length - 1)]
  }

  const getCellValue = (x: string, y: string) => {
    const cell = data.find((d) => String(d.x) === x && String(d.y) === y)
    return cell?.value
  }

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div className="overflow-auto">
        <div className="inline-block">
          {/* X-axis labels */}
          <div className="flex" style={{ marginLeft: cellSize + 4 }}>
            {uniqueX.map((label) => (
              <div
                key={label}
                className="text-xs text-muted-foreground text-center truncate"
                style={{ width: cellSize }}
                title={label}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid with Y-axis labels */}
          {uniqueY.map((yLabel) => (
            <div key={yLabel} className="flex items-center gap-1">
              {/* Y-axis label */}
              <div
                className="text-xs text-muted-foreground text-right truncate"
                style={{ width: cellSize }}
                title={yLabel}
              >
                {yLabel}
              </div>

              {/* Row cells */}
              {uniqueX.map((xLabel) => {
                const value = getCellValue(xLabel, yLabel)
                const bgColor = value !== undefined ? getColor(value) : 'transparent'

                return (
                  <div
                    key={`${xLabel}-${yLabel}`}
                    className={cn(
                      'rounded-sm border border-border/30 transition-all hover:scale-110 hover:z-10',
                      value === undefined && 'bg-secondary/30'
                    )}
                    style={{
                      width: cellSize - 2,
                      height: cellSize - 2,
                      backgroundColor: bgColor,
                    }}
                    title={value !== undefined ? `${xLabel} × ${yLabel}: ${formatValue(value)}` : undefined}
                  >
                    {showValues && value !== undefined && (
                      <div className="w-full h-full flex items-center justify-center text-xs font-medium text-white/80">
                        {formatValue(value)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Color scale legend */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-muted-foreground">{formatValue(minVal)}</span>
          <div className="flex h-3 rounded overflow-hidden flex-1 max-w-[120px]">
            {colors.map((color, index) => (
              <div
                key={index}
                className="flex-1"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{formatValue(maxVal)}</span>
        </div>
      </div>
    </div>
  )
}

// Calendar-style heatmap (like GitHub contribution graph)
interface CalendarHeatMapProps {
  data: Array<{
    date: string // YYYY-MM-DD format
    value: number
  }>
  colorScale?: 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray'
  title?: string
  months?: number // Number of months to show
}

export function CalendarHeatMap({
  data,
  colorScale = 'green',
  title,
  months = 12,
}: CalendarHeatMapProps) {
  const colors = COLOR_SCALES[colorScale]
  const values = data.map((d) => d.value)
  const maxVal = Math.max(...values, 1)

  const getColor = (value: number) => {
    if (value === 0) return 'rgb(var(--secondary))'
    const normalized = value / maxVal
    const index = Math.floor(normalized * (colors.length - 1))
    return colors[Math.min(index, colors.length - 1)]
  }

  // Generate date range
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  // Create map for quick lookup
  const dataMap = new Map(data.map((d) => [d.date, d.value]))

  // Generate weeks
  const weeks: Array<Array<{ date: Date; value: number }>> = []
  let currentWeek: Array<{ date: Date; value: number }> = []

  const currentDate = new Date(startDate)
  // Start from Sunday
  while (currentDate.getDay() !== 0) {
    currentDate.setDate(currentDate.getDate() - 1)
  }

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    currentWeek.push({
      date: new Date(currentDate),
      value: dataMap.get(dateStr) || 0,
    })

    if (currentDate.getDay() === 6) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div className="overflow-auto">
        <div className="inline-flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {dayLabels.map((day, i) => (
              <div
                key={day}
                className="text-xs text-muted-foreground h-3 flex items-center"
                style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}
              >
                {day.slice(0, 1)}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-0.5">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className="w-3 h-3 rounded-sm border border-border/20 transition-transform hover:scale-125"
                  style={{ backgroundColor: getColor(day.value) }}
                  title={`${day.date.toLocaleDateString()}: ${day.value}`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-0.5">
            {['rgb(var(--secondary))', ...colors.slice(0, 5)].map((color, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm border border-border/20"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  )
}
