import {
  generateParticles,
  WEATHER_ANIMATION_DIV_STYLE_14,
  WEATHER_ANIMATION_DIV_STYLE_15,
} from './WeatherAnimation.constants'
import type { WeatherSceneProps } from './WeatherAnimation.constants'
import { WindOverlay } from './WeatherAnimation.wind'

// Rain / Drizzle with angled drops, sheets, and splashes
export function RainScene({ type, isDaytime, windSpeed }: WeatherSceneProps & { type: 'rainy' | 'drizzle' }) {
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
            style={WEATHER_ANIMATION_DIV_STYLE_14}
          />
          <div
            className="absolute inset-0 weather-rain-sheet"
            style={WEATHER_ANIMATION_DIV_STYLE_15}
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}

// Thunderstorm with multiple lightning strikes and ambient flash
export function ThunderstormScene({ isDaytime, windSpeed }: WeatherSceneProps) {
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}

// Snow with tumbling motion and varied sizes
export function SnowScene({ isDaytime, windSpeed }: WeatherSceneProps) {
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}
