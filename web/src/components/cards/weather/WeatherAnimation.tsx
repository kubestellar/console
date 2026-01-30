import { Sun, Cloud, CloudRain, CloudSnow, CloudFog } from 'lucide-react'
import type { WeatherCondition } from './types'

// WMO Weather interpretation codes to condition mapping
export function getWeatherCondition(code: number): WeatherCondition {
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

// Get icon color based on weather code
export function getConditionColor(code: number): string {
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
export function WeatherAnimation({ weatherCode, isDaytime, windSpeed = 0 }: { weatherCode: number; isDaytime: boolean; windSpeed?: number }) {
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
