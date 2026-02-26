import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { Theme, themes, getAllThemes, getThemeById, getDefaultTheme } from '../lib/themes'

// Legacy type for backwards compatibility
export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'kubestellar-theme-id'
const LAST_DARK_THEME_KEY = 'kubestellar-last-dark-theme'

// Default fonts already loaded in index.css — no need to lazy-load
const DEFAULT_FONTS = new Set(['Inter', 'JetBrains Mono'])
// Track which fonts have already been injected to avoid duplicates
const loadedFonts = new Set<string>()

/**
 * Lazy-load a Google Font by injecting a <link> tag.
 * Only loads fonts not already in the default CSS @import.
 */
function loadThemeFont(fontFamily: string) {
  // Extract first font name from CSS font-family string (e.g., "'Fira Sans', ..." → "Fira Sans")
  const match = fontFamily.match(/['"]?([^'",:]+)['"]?/)
  const fontName = match?.[1]?.trim()
  if (!fontName || DEFAULT_FONTS.has(fontName) || loadedFonts.has(fontName)) return

  loadedFonts.add(fontName)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
  document.head.appendChild(link)
}

// Get system theme preference
function getSystemPrefersDark(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return true
}

/**
 * Apply theme CSS variables to the document
 */
function applyTheme(theme: Theme) {
  if (!theme || !theme.colors) {
    console.error('Invalid theme object:', theme)
    return
  }

  try {
    const root = document.documentElement
    const colors = theme.colors

    // Apply dark/light class
    if (theme.dark) {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }

  // Apply theme ID as data attribute for special styling
  root.setAttribute('data-theme', theme.id)

  // Apply CSS variables
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

  // Chart colors (as array for JS access)
  root.style.setProperty('--chart-color-1', colors.chartColors[0] || colors.brandPrimary)
  root.style.setProperty('--chart-color-2', colors.chartColors[1] || colors.brandSecondary)
  root.style.setProperty('--chart-color-3', colors.chartColors[2] || colors.success)
  root.style.setProperty('--chart-color-4', colors.chartColors[3] || colors.warning)
  root.style.setProperty('--chart-color-5', colors.chartColors[4] || colors.error)
  root.style.setProperty('--chart-color-6', colors.chartColors[5] || colors.info)
  root.style.setProperty('--chart-color-7', colors.chartColors[6] || colors.brandPrimary)
  root.style.setProperty('--chart-color-8', colors.chartColors[7] || colors.brandSecondary)

  // Font — lazy-load non-default Google Fonts on theme switch
  loadThemeFont(theme.font.family)
  loadThemeFont(theme.font.monoFamily)
  root.style.setProperty('--font-family', theme.font.family)
  root.style.setProperty('--font-mono', theme.font.monoFamily)
  root.style.setProperty('--font-weight-normal', String(theme.font.weight.normal))
  root.style.setProperty('--font-weight-medium', String(theme.font.weight.medium))
  root.style.setProperty('--font-weight-semibold', String(theme.font.weight.semibold))
  root.style.setProperty('--font-weight-bold', String(theme.font.weight.bold))

  // Special effects classes
  if (theme.starField) {
    root.classList.add('theme-star-field')
  } else {
    root.classList.remove('theme-star-field')
  }

  if (theme.glowEffects) {
    root.classList.add('theme-glow-effects')
  } else {
    root.classList.remove('theme-glow-effects')
  }

  if (theme.gradientAccents) {
    root.classList.add('theme-gradient-accents')
  } else {
    root.classList.remove('theme-gradient-accents')
  }
  } catch (error) {
    console.error('Error applying theme:', error)
  }
}

interface ThemeContextValue {
  // Current theme object
  currentTheme: Theme
  // Theme ID
  themeId: string
  // All available themes
  themes: Theme[]
  // Set theme by ID
  setTheme: (id: string) => void
  // Legacy compatibility
  theme: ThemeMode
  resolvedTheme: 'dark' | 'light'
  isDark: boolean
  toggleTheme: () => void
  // Chart colors for current theme
  chartColors: string[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      // Handle legacy 'dark'/'light' values
      if (stored === 'dark') return 'kubestellar'
      if (stored === 'light') return 'kubestellar-light'
      // Keep 'system' as a valid value
      return stored || 'kubestellar'
    }
    return 'kubestellar'
  })

  // Reactive custom themes — re-reads from localStorage when marketplace installs/removes
  const [customThemeVersion, setCustomThemeVersion] = useState(0)
  const allThemes = useMemo(() => getAllThemes(), [customThemeVersion])

  useEffect(() => {
    const handler = () => setCustomThemeVersion(v => v + 1)
    window.addEventListener('kc-custom-themes-changed', handler)
    return () => window.removeEventListener('kc-custom-themes-changed', handler)
  }, [])

  // Track the last selected dark theme for toggle functionality
  const [lastDarkTheme, setLastDarkTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAST_DARK_THEME_KEY) || 'kubestellar'
    }
    return 'kubestellar'
  })

  // Wrapper to track last dark theme when setting theme
  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    // Remember dark themes for toggle functionality
    const theme = getThemeById(id)
    if (theme?.dark && id !== 'system') {
      setLastDarkTheme(id)
      localStorage.setItem(LAST_DARK_THEME_KEY, id)
    }
  }, [])

  // Track system preference for 'system' theme
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)

  // Resolve actual theme when 'system' is selected
  const resolvedThemeId = themeId === 'system'
    ? (systemPrefersDark ? 'kubestellar' : 'kubestellar-light')
    : themeId

  const currentTheme = getThemeById(resolvedThemeId) || getDefaultTheme()

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(currentTheme)
    localStorage.setItem(STORAGE_KEY, themeId)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }, [currentTheme, themeId])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setTheme = useCallback((id: string) => {
    const newTheme = getThemeById(id)
    if (newTheme || id === 'system') {
      setThemeId(id)
    }
  }, [setThemeId])

  const toggleTheme = useCallback(() => {
    // Cycle through: current dark theme -> light -> system -> back to dark theme
    const currentTheme = getThemeById(themeId === 'system' ? (systemPrefersDark ? 'kubestellar' : 'kubestellar-light') : themeId)

    if (themeId === 'system') {
      // From system, go to the user's last selected dark theme
      setThemeId(lastDarkTheme)
    } else if (currentTheme?.dark) {
      // From any dark theme, go to light
      setThemeId('kubestellar-light')
    } else {
      // From light theme, go to system
      setThemeId('system')
    }
  }, [themeId, lastDarkTheme, systemPrefersDark, setThemeId])

  const value: ThemeContextValue = {
    currentTheme,
    themeId,
    themes: allThemes,
    setTheme,
    // Legacy compatibility - theme returns 'system' when in system mode
    theme: themeId === 'system' ? 'system' : (currentTheme.dark ? 'dark' : 'light'),
    resolvedTheme: currentTheme.dark ? 'dark' : 'light',
    isDark: currentTheme.dark,
    toggleTheme,
    chartColors: currentTheme.colors.chartColors,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    // Fallback for when used outside provider (backwards compatibility)
    const defaultTheme = getDefaultTheme()
    return {
      currentTheme: defaultTheme,
      themeId: 'kubestellar',
      themes,
      setTheme: () => {},
      theme: 'dark',
      resolvedTheme: 'dark',
      isDark: true,
      toggleTheme: () => {},
      chartColors: defaultTheme.colors.chartColors,
    }
  }
  return context
}

// Export Theme type for convenience
export type { Theme }
