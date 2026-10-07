import { Sun, Cloud, CloudRain, CloudSnow, CloudFog } from 'lucide-react'
import type { WeatherCondition } from './types'

// WMO Weather interpretation codes to condition mapping
export function getWeatherCondition(code: number): WeatherCondition {
  // Clear
  if (code === 0) return { type: 'sunny', icon: Sun, label: 'Clear', dayGradient: 'from-blue-400 via-blue-300 to-blue-200', nightGradient: 'from-blue-900 via-purple-900 to-blue-800' }
  // Mainly clear, partly cloudy
  if (code === 1 || code === 2) return { type: 'partly_cloudy', icon: Cloud, label: 'Partly Cloudy', dayGradient: 'from-blue-300 via-gray-300 to-blue-200', nightGradient: 'from-gray-800 via-gray-700 to-gray-600' }
  // Overcast
  if (code === 3) return { type: 'cloudy', icon: Cloud, label: 'Cloudy', dayGradient: 'from-gray-400 via-gray-300 to-gray-200', nightGradient: 'from-gray-800 via-gray-700 to-gray-600' }
  // Fog
  if (code === 45 || code === 48) return { type: 'fog', icon: CloudFog, label: 'Foggy', dayGradient: 'from-gray-300 via-gray-200 to-gray-200', nightGradient: 'from-gray-700 via-gray-600 to-gray-500' }
  // Drizzle
  if (code >= 51 && code <= 57) return { type: 'drizzle', icon: CloudRain, label: 'Drizzle', dayGradient: 'from-gray-500 via-blue-400 to-gray-400', nightGradient: 'from-gray-800 via-blue-800 to-gray-700' }
  // Rain
  if (code >= 61 && code <= 67) return { type: 'rainy', icon: CloudRain, label: 'Rainy', dayGradient: 'from-gray-600 via-blue-500 to-gray-500', nightGradient: 'from-gray-900 via-blue-900 to-gray-800' }
  // Snow
  if (code >= 71 && code <= 77) return { type: 'snowy', icon: CloudSnow, label: 'Snowy', dayGradient: 'from-blue-200 via-gray-200 to-blue-100', nightGradient: 'from-gray-700 via-blue-800 to-gray-600' }
  // Rain showers
  if (code >= 80 && code <= 82) return { type: 'rainy', icon: CloudRain, label: 'Showers', dayGradient: 'from-gray-600 via-blue-500 to-gray-500', nightGradient: 'from-gray-900 via-blue-900 to-gray-800' }
  // Snow showers
  if (code === 85 || code === 86) return { type: 'snowy', icon: CloudSnow, label: 'Snow Showers', dayGradient: 'from-blue-200 via-gray-200 to-blue-100', nightGradient: 'from-gray-700 via-blue-800 to-gray-600' }
  // Thunderstorm
  if (code >= 95 && code <= 99) return { type: 'thunderstorm', icon: CloudRain, label: 'Thunderstorm', dayGradient: 'from-gray-700 via-purple-600 to-gray-600', nightGradient: 'from-gray-900 via-purple-900 to-gray-800' }
  // Default
  return { type: 'cloudy', icon: Cloud, label: 'Cloudy', dayGradient: 'from-gray-400 via-gray-300 to-gray-200', nightGradient: 'from-gray-800 via-gray-700 to-gray-600' }
}

// Get icon color based on weather code
export function getConditionColor(code: number): string {
  const condition = getWeatherCondition(code)
  const colorMap: Record<string, string> = {
    'sunny': 'text-yellow-400',
    'partly_cloudy': 'text-gray-500',
    'cloudy': 'text-muted-foreground',
    'fog': 'text-gray-500',
    'drizzle': 'text-blue-300',
    'rainy': 'text-blue-400',
    'snowy': 'text-blue-200',
    'thunderstorm': 'text-purple-400',
  }
  return colorMap[condition.type] || 'text-muted-foreground'
}
