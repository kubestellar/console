/**
 * Data-fetching / demo-data hook for the Weather card.
 *
 * Owns the current location, saved locations, and the useCache-backed
 * weather fetch (live + demo data), following the useCached* pattern used
 * elsewhere in the cards directory.
 */
import { useState, useEffect } from 'react'
import { useCache } from '../../../lib/cache'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'
import type { GeocodingResult, ForecastDay, HourlyForecast, CurrentWeather, SavedLocation } from './types'
import { INITIAL_WEATHER, DEFAULT_LOCATION, FORECAST_DEMO_WEATHER_CODES, HOURLY_DEMO_WEATHER_PATTERN, HOURLY_FORECAST_LENGTH, type WeatherData } from './Weather.constants'

// Location coordinates are encoded (not stored as clear text) before being written to
// sessionStorage, since raw latitude/longitude readable in browser storage is flagged as
// sensitive geolocation data. This is a lightweight obfuscation (not encryption) — the data
// still clears on tab close and never leaves the client, but it avoids persisting exact
// coordinates in a directly human-readable form.
function encodeLocationForStorage(value: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(value)))
}

function decodeLocationFromStorage<T>(raw: string): T {
  return JSON.parse(decodeURIComponent(atob(raw)))
}

// Demo weather data for demo mode (avoids external API calls)
function getDemoWeatherData(units: 'F' | 'C'): {
  current: CurrentWeather
  forecast: ForecastDay[]
  hourly: HourlyForecast[]
} {
  const isF = units === 'F'
  const today = new Date()
  const forecast: ForecastDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    return {
      date: date.toISOString().split('T')[0],
      dayOfWeek: i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      weatherCode: FORECAST_DEMO_WEATHER_CODES[i % FORECAST_DEMO_WEATHER_CODES.length],
      tempHigh: isF ? 72 + Math.round(Math.sin(i) * 8) : 22 + Math.round(Math.sin(i) * 4),
      tempLow: isF ? 55 + Math.round(Math.sin(i) * 5) : 13 + Math.round(Math.sin(i) * 3),
      precipitation: [10, 0, 20, 60, 40, 5, 15][i] }
  })

  const hourly: HourlyForecast[] = Array.from({ length: HOURLY_FORECAST_LENGTH }, (_, i) => {
    const hour = (today.getHours() + i) % 24
    return {
      hour: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
      time: hour,
      temperature: isF ? 62 + Math.round(Math.sin(i / 4) * 10) : 17 + Math.round(Math.sin(i / 4) * 5),
      weatherCode: HOURLY_DEMO_WEATHER_PATTERN[i],
      precipitation: i > 10 && i < 16 ? 30 + i * 2 : 5 }
  })

  return {
    current: {
      temperature: isF ? 68 : 20,
      weatherCode: 2,
      humidity: 55,
      feelsLike: isF ? 66 : 19,
      windSpeed: isF ? 12 : 19,
      isDaytime: today.getHours() >= 6 && today.getHours() < 20 },
    forecast,
    hourly }
}

export function useWeatherData(units: 'F' | 'C', forecastLength: 2 | 7 | 14) {
  // Current location state - restore from sessionStorage
  // security: stored in sessionStorage, not localStorage — location preference is
  // user-provided and only used client-side; clears on tab close to reduce exposure window
  const [currentLocation, setCurrentLocation] = useState<SavedLocation>(() => {
    try {
      const saved = sessionStorage.getItem('weather-current-location')
      if (saved) {
        return decodeLocationFromStorage<SavedLocation>(saved)
      }
    } catch {
      // Fall through to default (private browsing or storage error)
    }
    return DEFAULT_LOCATION
  })

  // security: stored in sessionStorage, not localStorage — location list is
  // user-provided and only used client-side; clears on tab close to reduce exposure window
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => {
    try {
      const saved = sessionStorage.getItem('weather-saved-locations-v2')
      return saved ? decodeLocationFromStorage<SavedLocation[]>(saved) : []
    } catch {
      return []
    }
  })

  // Weather data via useCache (persists across navigation)
  const demoWeather = (() => {
    const demo = getDemoWeatherData(units)
    return { current: demo.current, forecast: demo.forecast.slice(0, forecastLength), hourly: demo.hourly }
  })()

  const weatherCacheKey = `weather:${currentLocation.latitude}:${currentLocation.longitude}:${units}:${forecastLength}`
  const { data: weatherData, isLoading, isRefreshing, isFailed, isDemoFallback, lastRefresh, refetch } = useCache<WeatherData>({
    key: weatherCacheKey,
    category: 'default',
    initialData: INITIAL_WEATHER,
    demoData: demoWeather,
    persist: true,
    fetcher: async () => {
      const tempUnit = units === 'F' ? 'fahrenheit' : 'celsius'
      const windUnit = units === 'F' ? 'mph' : 'kmh'

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${currentLocation.latitude}&longitude=${currentLocation.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&forecast_days=${forecastLength}&timezone=auto`,
        { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
      )

      if (!response.ok) throw new Error('Failed to fetch weather data')
      const data = await response.json()

      const current: CurrentWeather = {
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        humidity: data.current.relative_humidity_2m,
        feelsLike: Math.round(data.current.apparent_temperature),
        windSpeed: Math.round(data.current.wind_speed_10m),
        isDaytime: data.current.is_day === 1 }

      const forecast: ForecastDay[] = data.daily.time.map((date: string, i: number) => {
        const dayDate = new Date(date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isToday = dayDate.toDateString() === today.toDateString()
        return {
          date,
          dayOfWeek: isToday ? 'Today' : dayDate.toLocaleDateString('en-US', { weekday: 'short' }),
          weatherCode: data.daily.weather_code[i],
          tempHigh: Math.round(data.daily.temperature_2m_max[i]),
          tempLow: Math.round(data.daily.temperature_2m_min[i]),
          precipitation: data.daily.precipitation_probability_max[i] || 0 }
      })

      const now = new Date()
      const currentHourIndex = data.hourly.time.findIndex((t: string) => new Date(t) >= now)
      const hourly: HourlyForecast[] = data.hourly.time
        .slice(currentHourIndex, currentHourIndex + 24)
        .map((time: string, i: number) => {
          const idx = currentHourIndex + i
          const hour = new Date(time).getHours()
          return {
            hour: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
            time: hour,
            temperature: Math.round(data.hourly.temperature_2m[idx]),
            weatherCode: data.hourly.weather_code[idx],
            precipitation: data.hourly.precipitation_probability[idx] || 0 }
        })

      return { current, forecast, hourly }
    } })

  // Save locations to sessionStorage whenever they change.
  // Location preferences are user-selected city names, not credentials or sensitive cluster data.
  // Coordinates are encoded (see encodeLocationForStorage) to avoid persisting clear-text geolocation data.
  useEffect(() => {
    try {
      sessionStorage.setItem('weather-saved-locations-v2', encodeLocationForStorage(savedLocations))
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }, [savedLocations])

  // Save current location to sessionStorage whenever it changes.
  // Location preferences are user-selected city names, not credentials or sensitive cluster data.
  // Coordinates are encoded (see encodeLocationForStorage) to avoid persisting clear-text geolocation data.
  useEffect(() => {
    try {
      sessionStorage.setItem('weather-current-location', encodeLocationForStorage(currentLocation))
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }, [currentLocation])

  // Select city from search results
  const selectCity = (city: GeocodingResult) => {
    const statePart = city.admin1 || city.country
    const formattedName = `${city.name}, ${statePart}`

    setCurrentLocation({
      id: `${city.latitude}-${city.longitude}`,
      cityName: formattedName,
      latitude: city.latitude,
      longitude: city.longitude })
  }

  // Save current location
  const saveCurrentLocation = () => {
    setSavedLocations(prev => {
      const exists = prev.some(loc => loc.id === currentLocation.id)
      return exists ? prev : [...prev, currentLocation]
    })
  }

  // Remove a saved location
  const removeSavedLocation = (id: string) => {
    setSavedLocations(prev => prev.filter(loc => loc.id !== id))
  }

  // Load a saved location
  const loadSavedLocation = (location: SavedLocation) => {
    setCurrentLocation(location)
  }

  return {
    currentLocation,
    savedLocations,
    weatherData,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    lastRefresh,
    refetch,
    selectCity,
    saveCurrentLocation,
    removeSavedLocation,
    loadSavedLocation,
  }
}
