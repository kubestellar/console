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
  colorScale?: ColorScale
  min?: number
  max?: number
  showValues?: boolean
  cellSize?: number
  title?: string
  formatValue?: (value: number) => string
}

type ColorScale = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray'

// Increasing intensity moves away from the current theme's surface.
const SCALE_STOPS = [20, 32, 44, 56, 68, 80, 92]

function buildScale(color: string) {
  return SCALE_STOPS.map(stop => `color-mix(in srgb, ${color} ${stop}%, hsl(var(--card)))`)
}

const COLOR_SCALES: Record<ColorScale, string[]> = {
  green: buildScale('var(--color-success)'),
  blue: buildScale('var(--ks-blue)'),
  purple: buildScale('hsl(var(--primary))'),
  orange: buildScale('var(--color-warning)'),
  red: buildScale('var(--color-error)'),
  gray: buildScale('hsl(var(--foreground))'),
}

function getScaleColor(colors: string[], normalized: number) {
  const clamped = Math.min(1, Math.max(0, normalized))
  return colors[Math.floor(clamped * (colors.length - 1))]
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
    return getScaleColor(colors, (value - minVal) / (maxVal - minVal))
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
                const color = value === undefined ? undefined : getColor(value)

                return (
                  <div
                    key={`${xLabel}-${yLabel}`}
                    className={cn(
                      'rounded-sm border border-border/30 transition-all hover:scale-110 hover:z-10',
                      value === undefined ? 'bg-secondary/30' : 'bg-current'
                    )}
                    style={{
                      width: cellSize - 2,
                      height: cellSize - 2,
                      color,
                    }}
                    title={value !== undefined ? `${xLabel} × ${yLabel}: ${formatValue(value)}` : undefined}
                  >
                    {showValues && value !== undefined && (
                      <div className="w-full h-full flex items-center justify-center text-xs font-medium">
                        <span className="rounded-sm bg-card px-0.5 text-card-foreground">{formatValue(value)}</span>
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
                className="flex-1 bg-current"
                style={{ color }}
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
  colorScale?: ColorScale
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
                  className={cn(
                    'w-3 h-3 rounded-sm border border-border/20 transition-transform hover:scale-125',
                    day.value > 0 ? 'bg-current' : 'bg-secondary',
                  )}
                  style={{ color: day.value > 0 ? getScaleColor(colors, day.value / maxVal) : undefined }}
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
            <div className="w-3 h-3 rounded-sm border border-border/20 bg-secondary" />
            {colors.map((color, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm border border-border/20 bg-current"
                style={{ color }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  )
}
