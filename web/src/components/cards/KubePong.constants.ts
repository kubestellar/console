// Game constants
export const CANVAS_WIDTH = 400
export const CANVAS_HEIGHT = 300
export const PADDLE_WIDTH = 10
export const PADDLE_HEIGHT = 60
export const PADDLE_SPEED = 6
export const BALL_SIZE = 10
export const INITIAL_BALL_SPEED = 5
export const MAX_BALL_SPEED = 12
export const WINNING_SCORE = 7

// Colors (Kubernetes theme)
export const FALLBACK_COLORS = {
  background: '#0a1628',
  paddle: '#326ce5',
  ball: '#00d4aa',
  net: '#1e3a5f',
  text: '#fff',
  score: '#326ce5' }

export type ThemeColors = typeof FALLBACK_COLORS

function getCssVariableColor(style: CSSStyleDeclaration, variableName: string, fallback: string): string {
  const value = style.getPropertyValue(variableName).trim()
  if (!value) return fallback
  return value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')
    ? value
    : `hsl(${value})`
}

export function getThemeColors(): ThemeColors {
  if (typeof document === 'undefined') return FALLBACK_COLORS

  const style = getComputedStyle(document.documentElement)
  return {
    background: getCssVariableColor(style, '--background', FALLBACK_COLORS.background),
    paddle: getCssVariableColor(style, '--primary', FALLBACK_COLORS.paddle),
    ball: getCssVariableColor(style, '--accent', FALLBACK_COLORS.ball),
    net: getCssVariableColor(style, '--border', FALLBACK_COLORS.net),
    text: getCssVariableColor(style, '--foreground', FALLBACK_COLORS.text),
    score: getCssVariableColor(style, '--primary', FALLBACK_COLORS.score),
  }
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  speed: number
}

export interface Paddle {
  y: number
  score: number
}
