import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Cloud, CloudRain, CloudSnow, Sun, Wind, Droplets, Gauge, Eye,
  MapPin, Calendar, Search as SearchIcon, Star, X,
  ExternalLink, ChevronRight, ChevronDown, Loader2, CloudFog
} from 'lucide-react'
import { RefreshButton } from '../ui/RefreshIndicator'

// Geocoding API types
interface GeocodingResult {
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
interface WeatherCondition {
  type: string
  icon: typeof Sun
  label: string
  dayGradient: string
  nightGradient: string
}

// WMO Weather interpretation codes to condition mapping
function getWeatherCondition(code: number): WeatherCondition {
  // Clear
  if (code === 0) return { type: 'sunny', icon: Sun, label: 'Clear', dayGradient: 'from-blue-400 via-sky-400 to-blue-200', nightGradient: 'from-indigo-900 via-purple-900 to-indigo-800' }
  // Mainly clear, partly cloudy
  if (code === 1 || code === 2) return { type: 'partly_cloudy', icon: Cloud, label: 'Partly Cloudy', dayGradient: 'from-blue-300 via-slate-300 to-blue-200', nightGradient: 'from-slate-800 via-slate-700 to-slate-600' }
  // Overcast
  if (code === 3) return { type: 'cloudy', icon: Cloud, label: 'Cloudy', dayGradient: 'from-gray-400 via-slate-300 to-gray-200', nightGradient: 'from-slate-800 via-slate-700 to-slate-600' }
  // Fog
  if (code === 45 || code === 48) return { type: 'fog', icon: CloudFog, label: 'Foggy', dayGradient: 'from-gray-300 via-slate-200 to-gray-200', nightGradient: 'from-slate-700 via-slate-600 to-slate-500' }
  // Drizzle
  if (code >= 51 && code <= 57) return { type: 'drizzle', icon: CloudRain, label: 'Drizzle', dayGradient: 'from-slate-500 via-blue-400 to-slate-400', nightGradient: 'from-slate-800 via-blue-800 to-slate-700' }
  // Rain
  if (code >= 61 && code <= 67) return { type: 'rainy', icon: CloudRain, label: 'Rainy', dayGradient: 'from-slate-600 via-blue-500 to-slate-500', nightGradient: 'from-slate-900 via-blue-900 to-slate-800' }
  // Snow
  if (code >= 71 && code <= 77) return { type: 'snowy', icon: CloudSnow, label: 'Snowy', dayGradient: 'from-blue-200 via-slate-200 to-blue-100', nightGradient: 'from-slate-700 via-blue-800 to-slate-600' }
  // Rain showers
  if (code >= 80 && code <= 82) return { type: 'rainy', icon: CloudRain, label: 'Showers', dayGradient: 'from-slate-600 via-blue-500 to-slate-500', nightGradient: 'from-slate-900 via-blue-900 to-slate-800' }
  // Snow showers
  if (code === 85 || code === 86) return { type: 'snowy', icon: CloudSnow, label: 'Snow Showers', dayGradient: 'from-blue-200 via-slate-200 to-blue-100', nightGradient: 'from-slate-700 via-blue-800 to-slate-600' }
  // Thunderstorm
  if (code >= 95 && code <= 99) return { type: 'thunderstorm', icon: CloudRain, label: 'Thunderstorm', dayGradient: 'from-slate-700 via-purple-600 to-slate-600', nightGradient: 'from-slate-900 via-purple-900 to-slate-800' }
  // Default
  return { type: 'cloudy', icon: Cloud, label: 'Cloudy', dayGradient: 'from-gray-400 via-slate-300 to-gray-200', nightGradient: 'from-slate-800 via-slate-700 to-slate-600' }
}

interface ForecastDay {
  date: string
  dayOfWeek: string
  weatherCode: number
  tempHigh: number
  tempLow: number
  precipitation: number
}

interface HourlyForecast {
  hour: string
  time: number
  temperature: number
  weatherCode: number
  precipitation: number
}

interface CurrentWeather {
  temperature: number
  weatherCode: number
  humidity: number
  feelsLike: number
  windSpeed: number
  isDaytime: boolean
}

interface WeatherConfig {
  zipcode?: string
  units?: 'F' | 'C'
  forecastLength?: 2 | 7 | 14
}

interface SavedLocation {
  id: string
  cityName: string
  latitude: number
  longitude: number
}

// Get icon color based on weather code
function getConditionColor(code: number): string {
  const condition = getWeatherCondition(code)
  const colorMap: Record<string, string> = {
    'sunny': 'text-yellow-400',
    'partly_cloudy': 'text-gray-300',
    'cloudy': 'text-gray-400',
    'fog': 'text-gray-300',
    'drizzle': 'text-blue-300',
    'rainy': 'text-blue-400',
    'snowy': 'text-blue-200',
    'thunderstorm': 'text-purple-400',
  }
  return colorMap[condition.type] || 'text-gray-400'
}

// Weather Animation Component with realistic day/night variants
function WeatherAnimation({ weatherCode, isDaytime, windSpeed = 0 }: { weatherCode: number; isDaytime: boolean; windSpeed?: number }) {
  const condition = getWeatherCondition(weatherCode)
  const type = condition.type

  // Generate particles based on condition
  const generateParticles = (count: number) => Array.from({ length: count }, (_, i) => i)

  // Wind overlay component (used when wind speed is high)
  const WindOverlay = () => {
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
                ? `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${0.4 - i * 0.05}) 30%, rgba(255,255,255,${0.4 - i * 0.05}) 70%, transparent 100%)`
                : `linear-gradient(90deg, transparent 0%, rgba(200,210,230,${0.3 - i * 0.04}) 30%, rgba(200,210,230,${0.3 - i * 0.04}) 70%, transparent 100%)`,
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
              background: isDaytime ? 'rgba(180,160,120,0.8)' : 'rgba(120,110,90,0.7)',
              animationDelay: `${i * 1.5}s`,
            }}
          />
        ))}
      </>
    )
  }

  // Sun animation (day) / Moon animation (night)
  if (type === 'sunny') {
    if (isDaytime) {
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Heat shimmer effect at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1/3 weather-heat-shimmer"
            style={{
              background: 'linear-gradient(180deg, transparent 0%, rgba(255,250,230,0.1) 30%, rgba(255,245,200,0.2) 60%, rgba(255,250,230,0.15) 100%)',
            }}
          />
          {/* Corona glow (outer) */}
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full weather-corona"
            style={{
              background: 'radial-gradient(circle, rgba(255,220,120,0.6) 0%, rgba(255,200,80,0.3) 40%, rgba(255,180,60,0.1) 70%, transparent 100%)',
            }}
          />
          {/* Dynamic rotating rays */}
          <div
            className="absolute top-2 right-2 w-24 h-24 weather-sun-ray"
            style={{ opacity: 0.5 }}
          />
          {/* Main sun */}
          <div
            className="absolute top-4 right-4 w-14 h-14 rounded-full weather-sun"
            style={{
              background: 'radial-gradient(circle, rgba(255,250,200,1) 0%, rgba(255,230,120,0.95) 40%, rgba(255,200,80,0.8) 70%, rgba(255,180,60,0.5) 100%)',
              boxShadow: '0 0 30px rgba(255,220,100,0.8), 0 0 60px rgba(255,200,80,0.5), 0 0 90px rgba(255,180,60,0.3)',
            }}
          />
          {/* Inner sun glow pulse */}
          <div
            className="absolute top-5 right-5 w-12 h-12 rounded-full weather-sun-pulse"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,240,0.9) 0%, rgba(255,245,180,0.6) 50%, transparent 100%)',
            }}
          />
          {/* Lens flare */}
          <div
            className="absolute top-16 right-12 w-24 h-0.5 weather-sun-flare rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,250,200,0.8) 30%, rgba(255,255,255,0.9) 50%, rgba(255,250,200,0.8) 70%, transparent 100%)',
            }}
          />
          <WindOverlay />
        </div>
      )
    } else {
      // Night clear - realistic stars and moon with glow
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Moon with crater shadows */}
          <div
            className="absolute top-4 right-4 w-12 h-12 rounded-full weather-moon"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(250,252,255,1) 0%, rgba(230,240,250,0.95) 40%, rgba(200,215,235,0.9) 70%, rgba(180,195,220,0.85) 100%)',
              boxShadow: '0 0 25px rgba(200,220,255,0.5), 0 0 50px rgba(180,200,240,0.3)',
            }}
          >
            {/* Crater shadows */}
            <div className="absolute w-2 h-2 rounded-full bg-gray-300/20" style={{ top: '25%', left: '20%' }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-gray-300/15" style={{ top: '50%', left: '60%' }} />
            <div className="absolute w-1 h-1 rounded-full bg-gray-300/20" style={{ top: '65%', left: '30%' }} />
          </div>
          {/* Moon glow */}
          <div
            className="absolute top-2 right-2 w-16 h-16 rounded-full opacity-40"
            style={{
              background: 'radial-gradient(circle, rgba(200,220,255,0.5) 0%, rgba(180,200,240,0.2) 50%, transparent 100%)',
              filter: 'blur(4px)',
            }}
          />
          {/* Twinkling stars - varied sizes and timings */}
          {generateParticles(15).map((i) => {
            const size = i % 3 === 0 ? 2 : i % 2 === 0 ? 1.5 : 1
            const isBright = i % 4 === 0
            return (
              <div
                key={i}
                className={`absolute rounded-full ${isBright ? 'weather-star' : 'weather-star-pulse'}`}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  top: `${8 + (i * 11) % 55}%`,
                  left: `${3 + (i * 13) % 75}%`,
                  background: isBright
                    ? 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(220,230,255,0.8) 100%)'
                    : 'rgba(255,255,255,0.7)',
                  boxShadow: isBright ? '0 0 4px rgba(255,255,255,0.8)' : 'none',
                  animationDelay: `${i * 0.4}s`,
                  animationDuration: `${2 + (i % 3)}s`,
                }}
              />
            )
          })}
          <WindOverlay />
        </div>
      )
    }
  }

  // Partly cloudy with layered clouds
  if (type === 'partly_cloudy') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Sun/Moon peeking */}
        {isDaytime ? (
          <>
            <div
              className="absolute top-2 right-8 w-12 h-12 rounded-full weather-sun-pulse"
              style={{
                background: 'radial-gradient(circle, rgba(255,245,180,0.95) 0%, rgba(255,220,100,0.7) 50%, rgba(255,200,80,0.3) 100%)',
                boxShadow: '0 0 20px rgba(255,220,100,0.6)',
              }}
            />
            <div
              className="absolute top-0 right-6 w-16 h-16 rounded-full weather-corona opacity-40"
            />
          </>
        ) : (
          <div
            className="absolute top-3 right-10 w-8 h-8 rounded-full weather-moon opacity-70"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(240,245,255,1) 0%, rgba(200,215,235,0.9) 100%)',
              boxShadow: '0 0 15px rgba(200,220,255,0.4)',
            }}
          />
        )}
        {/* Layered clouds with parallax */}
        <div
          className="absolute rounded-[40%] weather-cloud-layer-1"
          style={{
            top: '8%',
            width: '80px',
            height: '30px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.95) 0%, rgba(245,248,255,0.85) 50%, rgba(230,235,245,0.6) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(90,100,120,0.9) 0%, rgba(70,80,100,0.7) 100%)',
            boxShadow: isDaytime ? '0 4px 15px rgba(0,0,0,0.1)' : 'none',
          }}
        />
        <div
          className="absolute rounded-[45%] weather-cloud-layer-2"
          style={{
            top: '25%',
            width: '100px',
            height: '35px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 40% 35%, rgba(255,255,255,0.9) 0%, rgba(240,245,255,0.8) 60%, rgba(220,230,245,0.5) 100%)'
              : 'radial-gradient(ellipse at 40% 35%, rgba(80,90,110,0.85) 0%, rgba(60,70,90,0.65) 100%)',
            boxShadow: isDaytime ? '0 6px 20px rgba(0,0,0,0.08)' : 'none',
          }}
        />
        <div
          className="absolute rounded-[50%] weather-cloud-layer-3"
          style={{
            top: '40%',
            width: '70px',
            height: '25px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 50% 30%, rgba(250,252,255,0.85) 0%, rgba(235,242,250,0.7) 100%)'
              : 'radial-gradient(ellipse at 50% 30%, rgba(75,85,105,0.8) 0%, rgba(55,65,85,0.6) 100%)',
          }}
        />
        <WindOverlay />
      </div>
    )
  }

  // Cloudy / Overcast with organic layers
  if (type === 'cloudy') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Multiple cloud layers with different speeds and depths */}
        <div
          className="absolute rounded-[50%] weather-cloud-layer-1"
          style={{
            top: '5%',
            width: '90px',
            height: '32px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 25% 40%, rgba(220,225,235,0.95) 0%, rgba(195,205,220,0.85) 50%, rgba(175,185,200,0.6) 100%)'
              : 'radial-gradient(ellipse at 25% 40%, rgba(70,80,100,0.9) 0%, rgba(55,65,85,0.7) 100%)',
            boxShadow: isDaytime ? 'inset 0 -8px 15px rgba(150,160,180,0.3)' : 'inset 0 -5px 10px rgba(40,50,70,0.3)',
          }}
        />
        <div
          className="absolute rounded-[45%] weather-cloud-layer-2"
          style={{
            top: '20%',
            width: '110px',
            height: '38px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 35% 35%, rgba(210,218,230,0.92) 0%, rgba(185,195,215,0.8) 60%, rgba(165,175,195,0.55) 100%)'
              : 'radial-gradient(ellipse at 35% 35%, rgba(65,75,95,0.88) 0%, rgba(50,60,80,0.68) 100%)',
            boxShadow: isDaytime ? 'inset 0 -10px 20px rgba(140,150,170,0.35)' : 'inset 0 -6px 12px rgba(35,45,65,0.35)',
          }}
        />
        <div
          className="absolute rounded-[40%] weather-cloud-layer-3"
          style={{
            top: '38%',
            width: '85px',
            height: '28px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 45% 30%, rgba(200,210,225,0.88) 0%, rgba(175,185,205,0.7) 100%)'
              : 'radial-gradient(ellipse at 45% 30%, rgba(60,70,90,0.85) 0%, rgba(45,55,75,0.65) 100%)',
          }}
        />
        <div
          className="absolute rounded-[55%] weather-cloud-layer-1"
          style={{
            top: '55%',
            width: '95px',
            height: '30px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 55% 35%, rgba(190,200,215,0.85) 0%, rgba(165,175,195,0.65) 100%)'
              : 'radial-gradient(ellipse at 55% 35%, rgba(55,65,85,0.82) 0%, rgba(40,50,70,0.62) 100%)',
            animationDelay: '-20s',
          }}
        />
        <WindOverlay />
      </div>
    )
  }

  // Fog with rolling layers at different densities
  if (type === 'fog') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Dense fog layer (slowest, closest) */}
        <div
          className="absolute w-[200%] h-16 weather-fog-layer-1"
          style={{
            top: '60%',
            background: isDaytime
              ? 'linear-gradient(180deg, transparent 0%, rgba(200,210,225,0.5) 30%, rgba(190,200,220,0.7) 50%, rgba(200,210,225,0.5) 70%, transparent 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(70,80,100,0.5) 30%, rgba(60,70,95,0.65) 50%, rgba(70,80,100,0.5) 70%, transparent 100%)',
          }}
        />
        {/* Medium fog layer */}
        <div
          className="absolute w-[180%] h-12 weather-fog-layer-2"
          style={{
            top: '40%',
            background: isDaytime
              ? 'linear-gradient(180deg, transparent 0%, rgba(210,220,235,0.4) 30%, rgba(200,210,230,0.55) 50%, rgba(210,220,235,0.4) 70%, transparent 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(75,85,105,0.4) 30%, rgba(65,75,100,0.5) 50%, rgba(75,85,105,0.4) 70%, transparent 100%)',
          }}
        />
        {/* Light fog layer (fastest, furthest) */}
        <div
          className="absolute w-[160%] h-10 weather-fog-layer-3"
          style={{
            top: '20%',
            background: isDaytime
              ? 'linear-gradient(180deg, transparent 0%, rgba(220,228,240,0.35) 30%, rgba(210,220,235,0.45) 50%, rgba(220,228,240,0.35) 70%, transparent 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(80,90,110,0.35) 30%, rgba(70,80,105,0.42) 50%, rgba(80,90,110,0.35) 70%, transparent 100%)',
          }}
        />
        {/* Ground haze */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/4"
          style={{
            background: isDaytime
              ? 'linear-gradient(180deg, transparent 0%, rgba(200,210,225,0.6) 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(60,70,90,0.6) 100%)',
            filter: 'blur(4px)',
          }}
        />
        <WindOverlay />
      </div>
    )
  }

  // Rain / Drizzle with angled drops, sheets, and splashes
  if (type === 'rainy' || type === 'drizzle') {
    const isHeavy = type === 'rainy'
    const dropCount = isHeavy ? 30 : 18
    const rainAngle = windSpeed > 20 ? 25 : windSpeed > 10 ? 15 : 8

    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Rain sheet/curtain effect */}
        {isHeavy && (
          <>
            <div
              className="absolute inset-0 weather-rain-sheet"
              style={{ animationDelay: '0s' }}
            />
            <div
              className="absolute inset-0 weather-rain-sheet"
              style={{ animationDelay: '-2s', opacity: 0.7 }}
            />
          </>
        )}
        {/* Dark storm clouds with internal shading */}
        <div
          className="absolute rounded-[50%] weather-cloud-layer-1"
          style={{
            top: '2%',
            width: '100px',
            height: '35px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 30% 40%, rgba(140,150,170,0.95) 0%, rgba(110,120,145,0.85) 50%, rgba(90,100,125,0.7) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(45,55,75,0.95) 0%, rgba(35,45,65,0.85) 100%)',
            boxShadow: 'inset 0 -8px 15px rgba(80,90,110,0.4)',
          }}
        />
        <div
          className="absolute rounded-[45%] weather-cloud-layer-2"
          style={{
            top: '15%',
            width: '120px',
            height: '40px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 40% 35%, rgba(130,140,165,0.92) 0%, rgba(100,110,135,0.8) 60%, rgba(80,90,115,0.6) 100%)'
              : 'radial-gradient(ellipse at 40% 35%, rgba(40,50,70,0.92) 0%, rgba(30,40,60,0.75) 100%)',
            boxShadow: 'inset 0 -10px 20px rgba(70,80,100,0.45)',
          }}
        />
        {/* Angled rain drops */}
        {generateParticles(dropCount).map((i) => {
          const variation = (i % 5) - 2
          const dropHeight = isHeavy ? 16 + (i % 4) * 5 : 10 + (i % 3) * 4
          const dropWidth = isHeavy ? 1.5 : 1
          return (
            <div
              key={`rain-${i}`}
              className={`absolute ${isHeavy ? 'weather-rain-heavy' : 'weather-rain-angled'}`}
              style={{
                left: `${(i * 3.3) % 100}%`,
                width: `${dropWidth}px`,
                height: `${dropHeight}px`,
                background: isDaytime
                  ? `linear-gradient(${180 + rainAngle}deg, rgba(170,195,230,0.95) 0%, rgba(130,165,210,0.7) 50%, rgba(100,140,200,0.4) 100%)`
                  : `linear-gradient(${180 + rainAngle}deg, rgba(120,150,200,0.9) 0%, rgba(90,120,175,0.65) 50%, rgba(70,100,160,0.35) 100%)`,
                borderRadius: '0 0 50% 50%',
                animationDelay: `${(i * 0.07) % 0.8}s`,
                transform: `rotate(${rainAngle + variation}deg)`,
              }}
            />
          )
        })}
        {/* Splash ripples at bottom */}
        {isHeavy && generateParticles(5).map((i) => (
          <div
            key={`splash-${i}`}
            className="absolute bottom-4 w-3 h-1.5 rounded-full weather-splash-ripple"
            style={{
              left: `${15 + i * 18}%`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
        <WindOverlay />
      </div>
    )
  }

  // Thunderstorm with multiple lightning strikes and ambient flash
  if (type === 'thunderstorm') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Ambient lightning flash overlay */}
        <div className="absolute inset-0 weather-lightning-ambient" />
        {/* Heavy storm clouds */}
        <div
          className="absolute rounded-[50%] weather-cloud-layer-1"
          style={{
            top: '0%',
            width: '110px',
            height: '38px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 30% 40%, rgba(100,105,125,0.98) 0%, rgba(75,80,100,0.9) 50%, rgba(60,65,85,0.75) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(35,40,55,0.98) 0%, rgba(25,30,45,0.9) 100%)',
            boxShadow: 'inset 0 -10px 20px rgba(50,55,75,0.5)',
          }}
        />
        <div
          className="absolute rounded-[45%] weather-cloud-layer-2"
          style={{
            top: '12%',
            width: '130px',
            height: '45px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 40% 35%, rgba(90,95,115,0.95) 0%, rgba(65,70,90,0.85) 60%, rgba(50,55,75,0.65) 100%)'
              : 'radial-gradient(ellipse at 40% 35%, rgba(30,35,50,0.95) 0%, rgba(20,25,40,0.85) 100%)',
            boxShadow: 'inset 0 -12px 25px rgba(40,45,65,0.5)',
          }}
        />
        {/* Multiple lightning bolts */}
        <svg className="absolute top-8 left-[25%] w-6 h-16 weather-lightning-1" viewBox="0 0 24 64" fill="none">
          <path d="M14 0L8 28H16L6 64L12 32H4L14 0Z" fill="rgba(255,255,255,0.95)" />
        </svg>
        <svg className="absolute top-6 left-[55%] w-5 h-14 weather-lightning-2" viewBox="0 0 24 64" fill="none">
          <path d="M14 0L8 28H16L6 64L12 32H4L14 0Z" fill="rgba(240,245,255,0.9)" />
        </svg>
        <svg className="absolute top-10 left-[75%] w-4 h-10 weather-lightning-3" viewBox="0 0 24 64" fill="none">
          <path d="M14 0L8 28H16L6 64L12 32H4L14 0Z" fill="rgba(230,240,255,0.85)" />
        </svg>
        {/* Heavy rain with angle */}
        {generateParticles(25).map((i) => (
          <div
            key={`rain-${i}`}
            className="absolute weather-rain-heavy"
            style={{
              left: `${(i * 4) % 100}%`,
              width: '1.5px',
              height: `${18 + (i % 4) * 5}px`,
              background: 'linear-gradient(195deg, rgba(160,185,220,0.9) 0%, rgba(120,150,200,0.6) 50%, rgba(90,120,180,0.3) 100%)',
              borderRadius: '0 0 50% 50%',
              animationDelay: `${(i * 0.06) % 0.6}s`,
              transform: 'rotate(20deg)',
            }}
          />
        ))}
        {/* Splash effects */}
        {generateParticles(4).map((i) => (
          <div
            key={`splash-${i}`}
            className="absolute bottom-3 w-4 h-2 rounded-full weather-splash-ripple"
            style={{
              left: `${10 + i * 22}%`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
        <WindOverlay />
      </div>
    )
  }

  // Snow with tumbling motion and varied sizes
  if (type === 'snowy') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Snow clouds */}
        <div
          className="absolute rounded-[50%] weather-cloud-layer-1"
          style={{
            top: '3%',
            width: '90px',
            height: '32px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 30% 40%, rgba(225,230,240,0.95) 0%, rgba(200,210,225,0.85) 50%, rgba(185,195,215,0.65) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(80,90,110,0.92) 0%, rgba(60,70,90,0.8) 100%)',
            boxShadow: isDaytime ? 'inset 0 -6px 12px rgba(180,190,210,0.3)' : 'none',
          }}
        />
        <div
          className="absolute rounded-[45%] weather-cloud-layer-2"
          style={{
            top: '18%',
            width: '105px',
            height: '36px',
            background: isDaytime
              ? 'radial-gradient(ellipse at 40% 35%, rgba(220,228,240,0.92) 0%, rgba(195,205,225,0.8) 60%, rgba(180,190,215,0.6) 100%)'
              : 'radial-gradient(ellipse at 40% 35%, rgba(75,85,105,0.9) 0%, rgba(55,65,85,0.75) 100%)',
          }}
        />
        {/* Tumbling snowflakes with varied sizes */}
        {generateParticles(25).map((i) => {
          const sizeClass = i % 4
          const size = sizeClass === 0 ? 8 : sizeClass === 1 ? 6 : sizeClass === 2 ? 4 : 3
          const duration = 7 + (i % 5) * 2
          const drift = windSpeed > 15 ? 30 : windSpeed > 8 ? 15 : 5
          return (
            <div
              key={`snow-${i}`}
              className="absolute rounded-full weather-snow-tumble"
              style={{
                left: `${(i * 4) % 100}%`,
                width: `${size}px`,
                height: `${size}px`,
                background: isDaytime
                  ? `radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(240,248,255,${0.9 - sizeClass * 0.1}) 60%, rgba(220,235,255,${0.6 - sizeClass * 0.1}) 100%)`
                  : `radial-gradient(circle, rgba(230,240,255,0.98) 0%, rgba(200,220,245,${0.85 - sizeClass * 0.1}) 60%, rgba(180,200,235,${0.55 - sizeClass * 0.1}) 100%)`,
                boxShadow: sizeClass < 2 ? `0 0 ${size}px rgba(255,255,255,0.6)` : 'none',
                animationDelay: `${(i * 0.5) % duration}s`,
                animationDuration: `${duration}s, 3s`,
                ['--drift' as string]: `${drift}px`,
              }}
            />
          )
        })}
        {/* Ground snow accumulation hint */}
        <div
          className="absolute bottom-0 left-0 right-0 h-3"
          style={{
            background: isDaytime
              ? 'linear-gradient(180deg, transparent 0%, rgba(245,250,255,0.4) 50%, rgba(240,248,255,0.6) 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(180,200,230,0.3) 50%, rgba(170,190,220,0.45) 100%)',
            filter: 'blur(2px)',
          }}
        />
        <WindOverlay />
      </div>
    )
  }

  // Default - gentle ambient with optional wind
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute top-1/4 left-1/4 w-16 h-16 rounded-full weather-ambient opacity-20"
        style={{ background: isDaytime ? 'rgba(200,210,220,0.5)' : 'rgba(80,90,110,0.5)' }}
      />
      <WindOverlay />
    </div>
  )
}

export function Weather({ config }: { config?: WeatherConfig }) {
  const [units, setUnits] = useState<'F' | 'C'>(config?.units || 'F')
  const [forecastLength, setForecastLength] = useState<2 | 7 | 14>(config?.forecastLength || 7)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [showSettings, setShowSettings] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hourlyScrollRef = useRef<HTMLDivElement>(null)

  // Current location state - restore from localStorage
  const [currentLocation, setCurrentLocation] = useState<SavedLocation>(() => {
    const saved = localStorage.getItem('weather-current-location')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // Fall through to default
      }
    }
    return {
      id: 'default',
      cityName: 'New York, NY',
      latitude: 40.7128,
      longitude: -74.006,
    }
  })

  // City search state
  const [citySearchInput, setCitySearchInput] = useState('')
  const [citySearchResults, setCitySearchResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => {
    const saved = localStorage.getItem('weather-saved-locations-v2')
    return saved ? JSON.parse(saved) : []
  })

  // Weather data state
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null)
  const [forecast, setForecast] = useState<ForecastDay[]>([])
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecast[]>([])

  // Save locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weather-saved-locations-v2', JSON.stringify(savedLocations))
  }, [savedLocations])

  // Save current location to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('weather-current-location', JSON.stringify(currentLocation))
  }, [currentLocation])

  // Fetch weather data from Open-Meteo API
  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const tempUnit = units === 'F' ? 'fahrenheit' : 'celsius'
      const windUnit = units === 'F' ? 'mph' : 'kmh'

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&forecast_days=${forecastLength}&timezone=auto`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch weather data')
      }

      const data = await response.json()

      // Parse current weather
      setCurrentWeather({
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        humidity: data.current.relative_humidity_2m,
        feelsLike: Math.round(data.current.apparent_temperature),
        windSpeed: Math.round(data.current.wind_speed_10m),
        isDaytime: data.current.is_day === 1,
      })

      // Parse daily forecast
      const dailyForecast: ForecastDay[] = data.daily.time.map((date: string, i: number) => {
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
          precipitation: data.daily.precipitation_probability_max[i] || 0,
        }
      })
      setForecast(dailyForecast)

      // Parse hourly forecast (next 24 hours)
      const now = new Date()
      const currentHourIndex = data.hourly.time.findIndex((t: string) => new Date(t) >= now)
      const hourlyData: HourlyForecast[] = data.hourly.time
        .slice(currentHourIndex, currentHourIndex + 24)
        .map((time: string, i: number) => {
          const idx = currentHourIndex + i
          const hour = new Date(time).getHours()
          return {
            hour: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
            time: hour,
            temperature: Math.round(data.hourly.temperature_2m[idx]),
            weatherCode: data.hourly.weather_code[idx],
            precipitation: data.hourly.precipitation_probability[idx] || 0,
          }
        })
      setHourlyForecast(hourlyData)

      setLastRefresh(new Date())
    } catch (err) {
      console.error('Weather fetch error:', err)
      setError('Failed to load weather data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [units, forecastLength])

  // Fetch weather when location or settings change
  useEffect(() => {
    fetchWeather(currentLocation.latitude, currentLocation.longitude)
  }, [currentLocation, fetchWeather])

  // City search with Open-Meteo Geocoding API
  const searchCities = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setCitySearchResults([])
      setShowCityDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
      )

      if (response.ok) {
        const data = await response.json()
        setCitySearchResults(data.results || [])
        setShowCityDropdown(true)
      } else {
        setCitySearchResults([])
        setShowCityDropdown(false)
      }
    } catch (error) {
      console.error('City search error:', error)
      setCitySearchResults([])
      setShowCityDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced city search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchCities(citySearchInput)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [citySearchInput, searchCities])

  // Select city from search results
  const selectCity = useCallback((city: GeocodingResult) => {
    const statePart = city.admin1 || city.country
    const formattedName = `${city.name}, ${statePart}`

    setCurrentLocation({
      id: `${city.latitude}-${city.longitude}`,
      cityName: formattedName,
      latitude: city.latitude,
      longitude: city.longitude,
    })
    setCitySearchInput('')
    setShowCityDropdown(false)
    setCitySearchResults([])
  }, [])

  // Save current location
  const saveCurrentLocation = useCallback(() => {
    const exists = savedLocations.some(loc => loc.id === currentLocation.id)
    if (!exists) {
      setSavedLocations(prev => [...prev, currentLocation])
    }
  }, [currentLocation, savedLocations])

  // Remove a saved location
  const removeSavedLocation = useCallback((id: string) => {
    setSavedLocations(prev => prev.filter(loc => loc.id !== id))
  }, [])

  // Load a saved location
  const loadSavedLocation = useCallback((location: SavedLocation) => {
    setCurrentLocation(location)
  }, [])

  // Refresh weather data
  const refreshWeather = useCallback(() => {
    setIsRefreshing(true)
    fetchWeather(currentLocation.latitude, currentLocation.longitude)
  }, [currentLocation, fetchWeather])

  // Get current weather condition
  const currentCondition = currentWeather ? getWeatherCondition(currentWeather.weatherCode) : null
  const CurrentIcon = currentCondition?.icon || Cloud

  // Get appropriate gradient based on time of day
  const backgroundGradient = currentCondition
    ? (currentWeather?.isDaytime ? currentCondition.dayGradient : currentCondition.nightGradient)
    : 'from-gray-400 to-gray-600'

  // Wind speed unit
  const windSpeedUnit = units === 'F' ? 'mph' : 'km/h'

  // Check if current location is saved
  const isCurrentLocationSaved = savedLocations.some(loc => loc.id === currentLocation.id)

  if (isLoading && !currentWeather) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">Loading weather...</span>
      </div>
    )
  }

  if (error && !currentWeather) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card">
        <Cloud className="w-8 h-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">{error}</span>
        <button
          onClick={refreshWeather}
          className="mt-2 px-3 py-1 text-sm rounded-lg bg-primary/20 text-primary hover:bg-primary/30"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/50 text-muted-foreground'}`}
        >
          <SearchIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Change Location</span>
        </button>
        <RefreshButton
          isRefreshing={isRefreshing}
          lastRefresh={lastRefresh}
          onRefresh={refreshWeather}
        />
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-3 p-3 rounded-xl bg-secondary/30 backdrop-blur-sm border border-border/30 space-y-3">
          {/* City Search */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Search for a city</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={citySearchInput}
                onChange={(e) => setCitySearchInput(e.target.value)}
                onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground placeholder:text-muted-foreground"
                placeholder="Type city name..."
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              )}

              {/* City Search Dropdown */}
              {showCityDropdown && citySearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-secondary/95 backdrop-blur-sm border border-border/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {citySearchResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => selectCity(city)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors border-b border-border/20 last:border-0"
                    >
                      <div className="text-sm font-medium">{city.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[city.admin1, city.country].filter(Boolean).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Location + Save Button */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">{currentLocation.cityName}</div>
                <div className="text-xs text-muted-foreground">Current location</div>
              </div>
            </div>
            {isCurrentLocationSaved ? (
              <button
                onClick={() => removeSavedLocation(currentLocation.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            ) : (
              <button
                onClick={saveCurrentLocation}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
                Save
              </button>
            )}
          </div>

          {/* Saved Locations */}
          {savedLocations.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Saved locations</label>
              <div className="space-y-1.5">
                {savedLocations.map((location) => {
                  const isCurrentLoc = location.id === currentLocation.id

                  return (
                    <div
                      key={location.id}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                        isCurrentLoc
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-secondary/30 hover:bg-secondary/50'
                      }`}
                      onClick={() => !isCurrentLoc && loadSavedLocation(location)}
                    >
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{location.cityName}</div>
                      </div>
                      {!isCurrentLoc && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeSavedLocation(location.id)
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Settings Row */}
          <div className="flex gap-3 pt-2 border-t border-border/30">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Units</label>
              <select
                value={units}
                onChange={(e) => setUnits(e.target.value as 'F' | 'C')}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value="F">°F (Fahrenheit)</option>
                <option value="C">°C (Celsius)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Forecast</label>
              <select
                value={forecastLength}
                onChange={(e) => setForecastLength(Number(e.target.value) as 2 | 7 | 14)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value={2}>2 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Weather Display */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {/* Hero Section */}
        {currentWeather && (
          <div
            key={`weather-hero-${currentLocation.id}`}
            className={`relative rounded-3xl bg-gradient-to-b ${backgroundGradient} overflow-hidden shadow-lg`}
          >
            <div className="absolute inset-0 bg-black/20 z-0"></div>

            {/* Weather Animation */}
            <WeatherAnimation weatherCode={currentWeather.weatherCode} isDaytime={currentWeather.isDaytime} windSpeed={currentWeather.windSpeed} />

            <div className="relative z-10 text-white p-4">
              {/* Location */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <MapPin className="w-4 h-4" />
                <h2 className="text-base font-semibold">{currentLocation.cityName}</h2>
              </div>

              {/* Large Temperature */}
              <div className="text-center">
                <div className="text-7xl font-light tracking-tight">
                  {currentWeather.temperature}°
                </div>
                <div className="flex items-center justify-center gap-2 text-lg mt-1">
                  <CurrentIcon className="w-5 h-5" />
                  <span>{currentCondition?.label}</span>
                </div>
                {forecast[0] && (
                  <div className="text-sm opacity-90 mt-1">
                    H:{forecast[0].tempHigh}° L:{forecast[0].tempLow}°
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick location switcher */}
        {savedLocations.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
            {savedLocations.map((location) => {
              const isCurrentLoc = location.id === currentLocation.id
              return (
                <button
                  key={location.id}
                  onClick={() => loadSavedLocation(location)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors border ${
                    isCurrentLoc
                      ? 'bg-primary/20 text-primary border-primary/30'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border-border/30'
                  }`}
                >
                  <span className="font-medium">{location.cityName.split(',')[0]}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Hourly Forecast */}
        {hourlyForecast.length > 0 && (
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Calendar className="w-3 h-3" />
              <span>Hourly Forecast</span>
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
        )}

        {/* Daily Forecast */}
        {forecast.length > 0 && (
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
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
                const minTemp = Math.min(...forecast.map(d => d.tempLow))
                const maxTemp = Math.max(...forecast.map(d => d.tempHigh))
                const totalRange = maxTemp - minTemp || 1
                const leftPercent = ((day.tempLow - minTemp) / totalRange) * 100
                const widthPercent = (tempRange / totalRange) * 100

                return (
                  <div key={day.date}>
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : day.date)}
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
                            className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
                            style={{
                              left: `${leftPercent}%`,
                              width: `${Math.max(widthPercent, 5)}%`,
                            }}
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
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Condition</span>
                          <span className="font-medium">{condition.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
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
        )}

        {/* Current Conditions Grid */}
        {currentWeather && (
          <div className="grid grid-cols-2 gap-3">
            {/* Feels Like */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Gauge className="w-3 h-3" />
                <span>Feels Like</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.feelsLike}°
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.feelsLike > currentWeather.temperature ? 'Warmer' : currentWeather.feelsLike < currentWeather.temperature ? 'Cooler' : 'Same as actual'}
              </div>
            </div>

            {/* Humidity */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Droplets className="w-3 h-3" />
                <span>Humidity</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.humidity}%
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.humidity > 70 ? 'High' : currentWeather.humidity > 40 ? 'Moderate' : 'Low'}
              </div>
            </div>

            {/* Wind */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Wind className="w-3 h-3" />
                <span>Wind</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.windSpeed}
              </div>
              <div className="text-sm text-muted-foreground">
                {windSpeedUnit}
              </div>
            </div>

            {/* Condition */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Eye className="w-3 h-3" />
                <span>Condition</span>
              </div>
              <div className="text-xl font-semibold mb-1">
                {currentCondition?.label}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.isDaytime ? 'Daytime' : 'Nighttime'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/30 text-xs text-center text-muted-foreground">
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          Weather data from Open-Meteo
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
