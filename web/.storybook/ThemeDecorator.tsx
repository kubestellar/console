import { useEffect } from 'react'
import type { Decorator } from '@storybook/react'
import { themes, type Theme } from '../src/lib/themes'

/**
 * Apply theme CSS variables to the document root.
 * Replicates the logic from useTheme.tsx applyTheme() without requiring
 * React context providers that aren't available in Storybook.
 */
function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement
  const colors = theme.colors

  // Dark/light class
  if (theme.dark) {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }

  root.setAttribute('data-theme', theme.id)

  // Core semantic colors
  root.style.setProperty('--background', colors.background)
  root.style.setProperty('--foreground', colors.foreground)
  root.style.setProperty('--card', colors.card)
  root.style.setProperty('--card-foreground', colors.cardForeground)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-foreground', colors.primaryForeground)
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--secondary-foreground', colors.secondaryForeground)
  root.style.setProperty('--muted', colors.muted)
  root.style.setProperty('--muted-foreground', colors.mutedForeground)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--accent-foreground', colors.accentForeground)
  root.style.setProperty('--destructive', colors.destructive)
  root.style.setProperty('--destructive-foreground', colors.destructiveForeground)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--input', colors.input)
  root.style.setProperty('--ring', colors.ring)

  // Brand colors
  root.style.setProperty('--ks-purple', colors.brandPrimary)
  root.style.setProperty('--ks-blue', colors.brandSecondary)
  root.style.setProperty('--ks-pink', colors.brandTertiary)
  root.style.setProperty('--ks-green', colors.success)
  root.style.setProperty('--ks-cyan', colors.info)

  // Status colors
  root.style.setProperty('--color-success', colors.success)
  root.style.setProperty('--color-warning', colors.warning)
  root.style.setProperty('--color-error', colors.error)
  root.style.setProperty('--color-info', colors.info)

  // Glass effect
  root.style.setProperty('--glass-background', colors.glassBackground)
  root.style.setProperty('--glass-border', colors.glassBorder)
  root.style.setProperty('--glass-shadow', colors.glassShadow)

  // Scrollbar
  root.style.setProperty('--scrollbar-thumb', colors.scrollbarThumb)
  root.style.setProperty('--scrollbar-thumb-hover', colors.scrollbarThumbHover)

  // Chart colors
  const chartDefaults = [
    colors.brandPrimary, colors.brandSecondary, colors.success,
    colors.warning, colors.error, colors.info,
    colors.brandPrimary, colors.brandSecondary,
  ]
  for (let i = 0; i < chartDefaults.length; i++) {
    root.style.setProperty(`--chart-color-${i + 1}`, colors.chartColors[i] || chartDefaults[i])
  }

  // Font
  root.style.setProperty('--font-family', theme.font.family)
  root.style.setProperty('--font-mono', theme.font.monoFamily)
  root.style.setProperty('--font-weight-normal', String(theme.font.weight.normal))
  root.style.setProperty('--font-weight-medium', String(theme.font.weight.medium))
  root.style.setProperty('--font-weight-semibold', String(theme.font.weight.semibold))
  root.style.setProperty('--font-weight-bold', String(theme.font.weight.bold))

  // Special effect classes
  root.classList.toggle('theme-star-field', !!theme.starField)
  root.classList.toggle('theme-glow-effects', !!theme.glowEffects)
  root.classList.toggle('theme-gradient-accents', !!theme.gradientAccents)
}

/** Find first light theme for the "Light" option */
const lightTheme = themes.find(t => !t.dark) || themes[0]

export const ThemeDecorator: Decorator = (Story, context) => {
  const themeId = context.globals.theme || 'kubestellar'

  useEffect(() => {
    let theme: Theme | undefined

    if (themeId === 'light') {
      theme = lightTheme
    } else {
      theme = themes.find(t => t.id === themeId)
    }

    if (theme) {
      applyThemeToDocument(theme)
    }
  }, [themeId])

  return (
    <div className="bg-background text-foreground p-4 min-h-[100px]">
      <Story />
    </div>
  )
}
