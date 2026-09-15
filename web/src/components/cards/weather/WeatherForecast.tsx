/**
 * Daily forecast list for the Weather card — expandable rows showing the
 * high/low range bar and, when expanded, condition/precipitation detail.
 */
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import { getWeatherCondition, getConditionColor } from './WeatherAnimation'
import type { ForecastDay } from './types'

interface WeatherForecastProps {
  forecast: ForecastDay[]
  forecastLength: 2 | 7 | 14
  expandedDay: string | null
  onToggleDay: (date: string | null) => void
}

export function WeatherForecast({ forecast, forecastLength, expandedDay, onToggleDay }: WeatherForecastProps) {
  if (forecast.length === 0) return null

  const minTemp = Math.min(...forecast.map(d => d.tempLow))
  const maxTemp = Math.max(...forecast.map(d => d.tempHigh))
  const totalRange = maxTemp - minTemp || 1

  return (
    <div className="rounded-2xl bg-secondary border border-border p-4">
      <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Calendar className="w-3 h-3" />
        <span>{forecastLength}-Day Forecast</span>
      </div>
      <div className="space-y-1">
        {forecast.map((day, idx) => {
          const condition = getWeatherCondition(day.weatherCode)
          const Icon = condition.icon
          const isExpanded = expandedDay === day.date
          const tempRange = day.tempHigh - day.tempLow
          const leftPercent = ((day.tempLow - minTemp) / totalRange) * 100
          const widthPercent = (tempRange / totalRange) * 100

          return (
            <div key={day.date}>
              <button
                onClick={() => onToggleDay(isExpanded ? null : day.date)}
                className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-secondary/50 transition-all group"
              >
                <div className="w-16 text-left text-sm font-medium">
                  {day.dayOfWeek}
                </div>

                <Icon className={`w-6 h-6 ${getConditionColor(day.weatherCode)}`} />

                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-8 text-right">
                    {day.tempLow}°
                  </span>
                  <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden relative">
                    <div
                      className="absolute h-full bg-linear-to-r from-blue-400 to-orange-400 rounded-full"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 5)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8">
                    {day.tempHigh}°
                  </span>
                </div>

                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 py-3 ml-6 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <span className="text-muted-foreground">Condition</span>
                    <span className="font-medium">{condition.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <span className="text-muted-foreground">Precipitation</span>
                    <span className="font-medium">{day.precipitation}%</span>
                  </div>
                </div>
              )}

              {idx < forecast.length - 1 && (
                <div className="h-px bg-border/20 mx-2" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
