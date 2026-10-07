import {
  generateParticles,
  WEATHER_ANIMATION_DIV_STYLE_1,
  WEATHER_ANIMATION_DIV_STYLE_2,
  WEATHER_ANIMATION_DIV_STYLE_3,
  WEATHER_ANIMATION_DIV_STYLE_4,
  WEATHER_ANIMATION_DIV_STYLE_5,
  WEATHER_ANIMATION_DIV_STYLE_6,
  WEATHER_ANIMATION_DIV_STYLE_7,
  WEATHER_ANIMATION_DIV_STYLE_8,
  WEATHER_ANIMATION_DIV_STYLE_9,
  WEATHER_ANIMATION_DIV_STYLE_10,
  WEATHER_ANIMATION_DIV_STYLE_11,
  WEATHER_ANIMATION_DIV_STYLE_12,
  WEATHER_ANIMATION_DIV_STYLE_13,
  WEATHER_AMBIENT_DAY_COLOR,
  WEATHER_AMBIENT_NIGHT_COLOR,
} from './WeatherAnimation.constants'
import type { WeatherSceneProps } from './WeatherAnimation.constants'
import { WindOverlay } from './WeatherAnimation.wind'

// Sun animation (day) / Moon animation (night)
export function SunnyScene({ isDaytime, windSpeed }: WeatherSceneProps) {
  if (isDaytime) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Heat shimmer effect at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 weather-heat-shimmer"
          style={WEATHER_ANIMATION_DIV_STYLE_1}
        />
        {/* Corona glow (outer) */}
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-full weather-corona"
          style={WEATHER_ANIMATION_DIV_STYLE_2}
        />
        {/* Dynamic rotating rays */}
        <div
          className="absolute top-2 right-2 w-24 h-24 weather-sun-ray"
          style={WEATHER_ANIMATION_DIV_STYLE_3}
        />
        {/* Main sun */}
        <div
          className="absolute top-4 right-4 w-14 h-14 rounded-full weather-sun"
          style={WEATHER_ANIMATION_DIV_STYLE_4}
        />
        {/* Inner sun glow pulse */}
        <div
          className="absolute top-5 right-5 w-12 h-12 rounded-full weather-sun-pulse"
          style={WEATHER_ANIMATION_DIV_STYLE_5}
        />
        {/* Lens flare */}
        <div
          className="absolute top-16 right-12 w-24 h-0.5 weather-sun-flare rounded-full"
          style={WEATHER_ANIMATION_DIV_STYLE_6}
        />
        <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
      </div>
    )
  } else {
    // Night clear - realistic stars and moon with glow
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Moon with crater shadows */}
        <div
          className="absolute top-4 right-4 w-12 h-12 rounded-full weather-moon"
          style={WEATHER_ANIMATION_DIV_STYLE_7}
        >
          {/* Crater shadows */}
          <div className="absolute w-2 h-2 rounded-full bg-gray-300/20" style={WEATHER_ANIMATION_DIV_STYLE_8} />
          <div className="absolute w-1.5 h-1.5 rounded-full bg-gray-300/15" style={WEATHER_ANIMATION_DIV_STYLE_9} />
          <div className="absolute w-1 h-1 rounded-full bg-gray-300/20" style={WEATHER_ANIMATION_DIV_STYLE_10} />
        </div>
        {/* Moon glow */}
        <div
          className="absolute top-2 right-2 w-16 h-16 rounded-full opacity-40"
          style={WEATHER_ANIMATION_DIV_STYLE_11}
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
        <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
      </div>
    )
  }
}

// Partly cloudy with layered clouds
export function PartlyCloudyScene({ isDaytime, windSpeed }: WeatherSceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Sun/Moon peeking */}
      {isDaytime ? (
        <>
          <div
            className="absolute top-2 right-8 w-12 h-12 rounded-full weather-sun-pulse"
            style={WEATHER_ANIMATION_DIV_STYLE_12}
          />
          <div
            className="absolute top-0 right-6 w-16 h-16 rounded-full weather-corona opacity-40"
          />
        </>
      ) : (
        <div
          className="absolute top-3 right-10 w-8 h-8 rounded-full weather-moon opacity-70"
          style={WEATHER_ANIMATION_DIV_STYLE_13}
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}

// Cloudy / Overcast with organic layers
export function CloudyScene({ isDaytime, windSpeed }: WeatherSceneProps) {
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}

// Fog with rolling layers at different densities
export function FogScene({ isDaytime, windSpeed }: WeatherSceneProps) {
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
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}

// Default - gentle ambient with optional wind
export function AmbientScene({ isDaytime, windSpeed }: WeatherSceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute top-1/4 left-1/4 w-16 h-16 rounded-full weather-ambient opacity-20"
        style={{ background: isDaytime ? WEATHER_AMBIENT_DAY_COLOR : WEATHER_AMBIENT_NIGHT_COLOR }}
      />
      <WindOverlay isDaytime={isDaytime} windSpeed={windSpeed} />
    </div>
  )
}
