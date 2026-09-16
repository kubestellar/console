/**
 * Hourly forecast strip for the Weather card.
 */
import type { RefObject } from 'react'
import { Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getWeatherCondition, getConditionColor } from './WeatherAnimation'
import type { HourlyForecast } from './types'

interface WeatherHourlyProps {
  hourlyForecast: HourlyForecast[]
  hourlyScrollRef: RefObject<HTMLDivElement | null>
}

export function WeatherHourly({ hourlyForecast, hourlyScrollRef }: WeatherHourlyProps) {
  const { t } = useTranslation('common')

  if (hourlyForecast.length === 0) return null

  return (
    <div className="rounded-2xl bg-secondary border border-border p-4">
      <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Calendar className="w-3 h-3" />
        <span>{t('weather.hourlyForecast')}</span>
      </div>
      <div
        ref={hourlyScrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent"
      >
        {hourlyForecast.map((hour, idx) => {
          const condition = getWeatherCondition(hour.weatherCode)
          const HourIcon = condition.icon
          const isNow = idx === 0

          return (
            <div
              key={idx}
              className="flex flex-col items-center gap-2 min-w-[60px] text-center"
            >
              <div className="text-sm font-medium">
                {isNow ? 'Now' : hour.hour}
              </div>
              <HourIcon className={`w-6 h-6 ${getConditionColor(hour.weatherCode)}`} />
              <div className="text-lg font-semibold">
                {hour.temperature}°
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
