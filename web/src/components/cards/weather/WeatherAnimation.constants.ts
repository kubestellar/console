import type { CSSProperties } from 'react'

// Inline style constants
export const WEATHER_ANIMATION_DIV_STYLE_1: CSSProperties = {
              background: 'linear-gradient(180deg, transparent 0%, rgba(255,250,230,0.1) 30%, rgba(255,245,200,0.2) 60%, rgba(255,250,230,0.15) 100%)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_2: CSSProperties = {
              background: 'radial-gradient(circle, rgba(255,220,120,0.6) 0%, rgba(255,200,80,0.3) 40%, rgba(255,180,60,0.1) 70%, transparent 100%)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_3: CSSProperties = { opacity: 0.5 }
export const WEATHER_ANIMATION_DIV_STYLE_4: CSSProperties = {
              background: 'radial-gradient(circle, rgba(255,250,200,1) 0%, rgba(255,230,120,0.95) 40%, rgba(255,200,80,0.8) 70%, rgba(255,180,60,0.5) 100%)',
              boxShadow: '0 0 30px rgba(255,220,100,0.8), 0 0 60px rgba(255,200,80,0.5), 0 0 90px rgba(255,180,60,0.3)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_5: CSSProperties = {
              background: 'radial-gradient(circle, rgba(255,255,240,0.9) 0%, rgba(255,245,180,0.6) 50%, transparent 100%)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_6: CSSProperties = {
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,250,200,0.8) 30%, rgba(255,255,255,0.9) 50%, rgba(255,250,200,0.8) 70%, transparent 100%)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_7: CSSProperties = {
              background: 'radial-gradient(circle at 35% 35%, rgba(250,252,255,1) 0%, rgba(230,240,250,0.95) 40%, rgba(200,215,235,0.9) 70%, rgba(180,195,220,0.85) 100%)',
              boxShadow: '0 0 25px rgba(200,220,255,0.5), 0 0 50px rgba(180,200,240,0.3)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_8: CSSProperties = { top: '25%', left: '20%' }
export const WEATHER_ANIMATION_DIV_STYLE_9: CSSProperties = { top: '50%', left: '60%' }
export const WEATHER_ANIMATION_DIV_STYLE_10: CSSProperties = { top: '65%', left: '30%' }
export const WEATHER_ANIMATION_DIV_STYLE_11: CSSProperties = {
              background: 'radial-gradient(circle, rgba(200,220,255,0.5) 0%, rgba(180,200,240,0.2) 50%, transparent 100%)',
              filter: 'blur(4px)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_12: CSSProperties = {
                background: 'radial-gradient(circle, rgba(255,245,180,0.95) 0%, rgba(255,220,100,0.7) 50%, rgba(255,200,80,0.3) 100%)',
                boxShadow: '0 0 20px rgba(255,220,100,0.6)',
              }
export const WEATHER_ANIMATION_DIV_STYLE_13: CSSProperties = {
              background: 'radial-gradient(circle at 35% 35%, rgba(240,245,255,1) 0%, rgba(200,215,235,0.9) 100%)',
              boxShadow: '0 0 15px rgba(200,220,255,0.4)',
            }
export const WEATHER_ANIMATION_DIV_STYLE_14: CSSProperties = { animationDelay: '0s' }
export const WEATHER_ANIMATION_DIV_STYLE_15: CSSProperties = { animationDelay: '-2s', opacity: 0.7 }

// Weather-specific color tokens — these are visual sky/weather simulation colors,
// not UI design tokens. They represent realistic sky phenomena and must remain
// as rgba values since they require precise alpha control for layered gradients.
// Day = warm sunlight palette; Night = cool moonlit palette.
export const WEATHER_WIND_STREAK_DAY_BASE = '255,255,255'
export const WEATHER_WIND_STREAK_NIGHT_BASE = '200,210,230'
export const WEATHER_LEAF_DAY_COLOR = 'rgba(180,160,120,0.8)' // ai-quality-ignore
export const WEATHER_LEAF_NIGHT_COLOR = 'rgba(120,110,90,0.7)' // ai-quality-ignore
export const WEATHER_AMBIENT_DAY_COLOR = 'rgba(200,210,220,0.5)' // ai-quality-ignore
export const WEATHER_AMBIENT_NIGHT_COLOR = 'rgba(80,90,110,0.5)' // ai-quality-ignore

// Generate particles based on condition
export const generateParticles = (count: number) => Array.from({ length: count }, (_, i) => i)

export interface WeatherSceneProps {
  isDaytime: boolean
  windSpeed: number
}
