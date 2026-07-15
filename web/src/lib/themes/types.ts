/**
 * Theme type definitions
 */

export interface ThemeColors {
  // Core colors (HSL format without hsl())
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  border: string
  input: string
  ring: string

  // Brand/accent colors (hex)
  brandPrimary: string
  brandSecondary: string
  brandTertiary: string

  // Status colors (hex)
  success: string
  warning: string
  error: string
  info: string

  // Glass effect
  glassBackground: string
  glassBorder: string
  glassShadow: string

  // Scrollbar
  scrollbarThumb: string
  scrollbarThumbHover: string

  // Chart colors (array of hex)
  chartColors: string[]
}

export interface ThemeFont {
  family: string
  monoFamily: string
  weight: {
    normal: number
    medium: number
    semibold: number
    bold: number
  }
}

export interface Theme {
  id: string
  name: string
  description: string
  author?: string
  dark: boolean
  colors: ThemeColors
  font: ThemeFont
  // Special effects
  starField?: boolean
  glowEffects?: boolean
  gradientAccents?: boolean
}
