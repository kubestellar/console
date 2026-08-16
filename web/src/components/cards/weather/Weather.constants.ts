/**
 * Constants for Weather card component
 */

import type { CurrentWeather, ForecastDay, HourlyForecast, SavedLocation } from './types'

export interface WeatherData {
  current: CurrentWeather | null
  forecast: ForecastDay[]
  hourly: HourlyForecast[]
}

export const INITIAL_WEATHER: WeatherData = {
  current: null,
  forecast: [],
  hourly: [],
}

export const DEFAULT_LOCATION: SavedLocation = {
  id: 'default',
  cityName: 'New York, NY',
  latitude: 40.7128,
  longitude: -74.006,
}

export const FORECAST_DEMO_WEATHER_CODES = [0, 1, 2, 3, 61, 80, 95]
export const HOURLY_DEMO_WEATHER_PATTERN = [0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1]
export const HOURLY_FORECAST_LENGTH = 24
export const DEFAULT_FORECAST_LENGTH: 2 | 7 | 14 = 7
