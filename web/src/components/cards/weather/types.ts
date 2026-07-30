import type { Sun } from 'lucide-react'

// Geocoding API types
export interface GeocodingResult {
  id: number
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
  timezone?: string
  postal_code?: string
}

// Weather condition mapping from WMO codes
export interface WeatherCondition {
  type: string
  icon: typeof Sun
  label: string
  dayGradient: string
  nightGradient: string
}

export interface ForecastDay {
  date: string
  dayOfWeek: string
  weatherCode: number
  tempHigh: number
  tempLow: number
  precipitation: number
}

export interface HourlyForecast {
  hour: string
  time: number
  temperature: number
  weatherCode: number
  precipitation: number
}

export interface CurrentWeather {
  temperature: number
  weatherCode: number
  humidity: number
  feelsLike: number
  windSpeed: number
  isDaytime: boolean
}

export interface WeatherConfig {
  zipcode?: string
  units?: 'F' | 'C'
  forecastLength?: 2 | 7 | 14
}

export interface SavedLocation {
  id: string
  cityName: string
  latitude: number
  longitude: number
}
