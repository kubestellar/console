import {
  generateParticles,
  WEATHER_WIND_STREAK_DAY_BASE,
  WEATHER_WIND_STREAK_NIGHT_BASE,
  WEATHER_LEAF_DAY_COLOR,
  WEATHER_LEAF_NIGHT_COLOR,
} from './WeatherAnimation.constants'
import type { WeatherSceneProps } from './WeatherAnimation.constants'

// Wind overlay component (used when wind speed is high)
export function WindOverlay({ isDaytime, windSpeed }: WeatherSceneProps) {
  if (windSpeed < 15) return null
  const isStrong = windSpeed >= 25
  return (
    <>
      {generateParticles(isStrong ? 5 : 3).map((i) => (
        <div
          key={`wind-${i}`}
          className="absolute w-full h-0.5 weather-wind"
          style={{
            top: `${20 + i * 15}%`,
            background: isDaytime
              ? `linear-gradient(90deg, transparent 0%, rgba(${WEATHER_WIND_STREAK_DAY_BASE},${0.4 - i * 0.05}) 30%, rgba(${WEATHER_WIND_STREAK_DAY_BASE},${0.4 - i * 0.05}) 70%, transparent 100%)`
              : `linear-gradient(90deg, transparent 0%, rgba(${WEATHER_WIND_STREAK_NIGHT_BASE},${0.3 - i * 0.04}) 30%, rgba(${WEATHER_WIND_STREAK_NIGHT_BASE},${0.3 - i * 0.04}) 70%, transparent 100%)`,
            animationDelay: `${i * 0.3}s`,
            animationDuration: `${2 + i * 0.5}s`,
          }}
        />
      ))}
      {isStrong && generateParticles(4).map((i) => (
        <div
          key={`leaf-${i}`}
          className="absolute w-2 h-1 rounded-full weather-leaves"
          style={{
            top: `${25 + i * 18}%`,
            background: isDaytime ? WEATHER_LEAF_DAY_COLOR : WEATHER_LEAF_NIGHT_COLOR,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}
    </>
  )
}
