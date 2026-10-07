import { getWeatherCondition } from './WeatherAnimation.conditions'
import {
  SunnyScene,
  PartlyCloudyScene,
  CloudyScene,
  FogScene,
  AmbientScene,
} from './WeatherAnimation.sky'
import { RainScene, ThunderstormScene, SnowScene } from './WeatherAnimation.precipitation'

// Weather Animation Component with realistic day/night variants
export function WeatherAnimation({ weatherCode, isDaytime, windSpeed = 0 }: { weatherCode: number; isDaytime: boolean; windSpeed?: number }) {
  const condition = getWeatherCondition(weatherCode)
  const type = condition.type

  // Sun animation (day) / Moon animation (night)
  if (type === 'sunny') {
    return <SunnyScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Partly cloudy with layered clouds
  if (type === 'partly_cloudy') {
    return <PartlyCloudyScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Cloudy / Overcast with organic layers
  if (type === 'cloudy') {
    return <CloudyScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Fog with rolling layers at different densities
  if (type === 'fog') {
    return <FogScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Rain / Drizzle with angled drops, sheets, and splashes
  if (type === 'rainy' || type === 'drizzle') {
    return <RainScene type={type} isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Thunderstorm with multiple lightning strikes and ambient flash
  if (type === 'thunderstorm') {
    return <ThunderstormScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Snow with tumbling motion and varied sizes
  if (type === 'snowy') {
    return <SnowScene isDaytime={isDaytime} windSpeed={windSpeed} />
  }

  // Default - gentle ambient with optional wind
  return <AmbientScene isDaytime={isDaytime} windSpeed={windSpeed} />
}
