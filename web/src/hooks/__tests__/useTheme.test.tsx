import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockEmitThemeChanged = vi.hoisted(() => vi.fn())

vi.mock('../../lib/analytics', () => ({
  emitThemeChanged: mockEmitThemeChanged,
}))

// ---------------------------------------------------------------------------
// Import after mocks are wired
// ---------------------------------------------------------------------------
import { ThemeProvider, useTheme } from '../useTheme'
import { getThemeById, getDefaultTheme, getAllThemes } from '../../lib/themes'
import type { Theme } from '../../lib/themes'

// ---------------------------------------------------------------------------
// Constants matching the source module
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'kubestellar-theme-id'
const LAST_DARK_THEME_KEY = 'kubestellar-last-dark-theme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrapper component that provides ThemeProvider to renderHook */
function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

/**
 * Capture the current list of change listeners registered on a
 * matchMedia query so we can fire synthetic events.
 */
let matchMediaChangeHandlers: Array<(e: MediaQueryListEvent) => void> = []

function createMatchMediaMock(prefersDark: boolean) {
  matchMediaChangeHandlers = []
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        matchMediaChangeHandlers.push(handler)
      }
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        matchMediaChangeHandlers = matchMediaChangeHandlers.filter(h => h !== handler)
      }
    }),
    dispatchEvent: vi.fn(),
  }))
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear()
  mockEmitThemeChanged.mockClear()
  // Default: system prefers dark
  window.matchMedia = createMatchMediaMock(true)
  // Reset DOM classes / styles that applyTheme sets
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ===========================================================================
// 1. Default theme initialization (dark mode)
// ===========================================================================
describe('Default theme initialization', () => {
  it('returns the default dark theme when no localStorage value exists', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.themeId).toBe('kubestellar')
    expect(result.current.isDark).toBe(true)
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.theme).toBe('dark')
  })

  it('currentTheme matches getDefaultTheme()', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const defaultTheme = getDefaultTheme()

    expect(result.current.currentTheme.id).toBe(defaultTheme.id)
    expect(result.current.currentTheme.name).toBe(defaultTheme.name)
  })

  it('provides chart colors from the default theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const defaultTheme = getDefaultTheme()

    expect(result.current.chartColors).toEqual(defaultTheme.colors.chartColors)
  })

  it('exposes the list of all available themes', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const allThemes = getAllThemes()

    expect(result.current.themes.length).toBe(allThemes.length)
    expect(result.current.themes.map(t => t.id)).toEqual(allThemes.map(t => t.id))
  })
})

// ===========================================================================
// 2. Theme toggling (light/dark)
// ===========================================================================
describe('Theme toggling', () => {
  it('toggles from dark to light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    // Start: dark (kubestellar)
    expect(result.current.isDark).toBe(true)

    act(() => {
      result.current.toggleTheme()
    })

    // After first toggle: dark -> light
    expect(result.current.themeId).toBe('kubestellar-light')
    expect(result.current.isDark).toBe(false)
    expect(result.current.resolvedTheme).toBe('light')
  })

  it('toggles from light to system', () => {
    // Start with light theme stored
    localStorage.setItem(STORAGE_KEY, 'kubestellar-light')

    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.themeId).toBe('kubestellar-light')

    act(() => {
      result.current.toggleTheme()
    })

    // light -> system
    expect(result.current.themeId).toBe('system')
    expect(result.current.theme).toBe('system')
  })

  it('toggles from system back to last dark theme', () => {
    localStorage.setItem(STORAGE_KEY, 'system')

    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('system')

    act(() => {
      result.current.toggleTheme()
    })

    // system -> last dark theme (defaults to 'kubestellar')
    expect(result.current.themeId).toBe('kubestellar')
    expect(result.current.isDark).toBe(true)
  })

  it('cycles through dark -> light -> system -> dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    // dark -> light
    act(() => result.current.toggleTheme())
    expect(result.current.themeId).toBe('kubestellar-light')

    // light -> system
    act(() => result.current.toggleTheme())
    expect(result.current.themeId).toBe('system')

    // system -> dark
    act(() => result.current.toggleTheme())
    expect(result.current.themeId).toBe('kubestellar')
  })

  it('emits analytics events on toggle', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleTheme()
    })

    expect(mockEmitThemeChanged).toHaveBeenCalledWith('kubestellar-light', 'toggle')
  })
})

// ===========================================================================
// 3. System preference detection
// ===========================================================================
describe('System preference detection', () => {
  it('resolves to dark theme when system prefers dark and theme is "system"', () => {
    window.matchMedia = createMatchMediaMock(true)
    localStorage.setItem(STORAGE_KEY, 'system')

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('system')
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(result.current.currentTheme.id).toBe('kubestellar')
  })

  it('resolves to light theme when system prefers light and theme is "system"', () => {
    window.matchMedia = createMatchMediaMock(false)
    localStorage.setItem(STORAGE_KEY, 'system')

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('system')
    expect(result.current.resolvedTheme).toBe('light')
    expect(result.current.isDark).toBe(false)
    expect(result.current.currentTheme.id).toBe('kubestellar-light')
  })

  it('reacts to system preference changes in real time', () => {
    window.matchMedia = createMatchMediaMock(true)
    localStorage.setItem(STORAGE_KEY, 'system')

    const { result } = renderHook(() => useTheme(), { wrapper })

    // Initially dark
    expect(result.current.isDark).toBe(true)

    // Simulate system switching to light mode
    act(() => {
      matchMediaChangeHandlers.forEach(handler =>
        handler({ matches: false } as MediaQueryListEvent)
      )
    })

    expect(result.current.isDark).toBe(false)
    expect(result.current.resolvedTheme).toBe('light')
  })
})

// ===========================================================================
// 4. localStorage persistence
// ===========================================================================
describe('localStorage persistence', () => {
  it('persists selected theme ID to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('kubestellar-light')
  })

  it('restores theme ID from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'kubestellar-light')

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.themeId).toBe('kubestellar-light')
    expect(result.current.isDark).toBe(false)
  })

  it('handles legacy "dark" value in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')

    const { result } = renderHook(() => useTheme(), { wrapper })

    // Legacy 'dark' maps to 'kubestellar'
    expect(result.current.themeId).toBe('kubestellar')
    expect(result.current.isDark).toBe(true)
  })

  it('handles legacy "light" value in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    const { result } = renderHook(() => useTheme(), { wrapper })

    // Legacy 'light' maps to 'kubestellar-light'
    expect(result.current.themeId).toBe('kubestellar-light')
    expect(result.current.isDark).toBe(false)
  })

  it('stores "system" in localStorage when system theme is selected', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('system')
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('system')
  })

  it('remembers the last selected dark theme for toggle', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    // Select a specific dark theme (e.g., dracula)
    const dracula = getAllThemes().find(t => t.id === 'dracula')
    if (dracula) {
      act(() => {
        result.current.setTheme('dracula')
      })

      expect(localStorage.getItem(LAST_DARK_THEME_KEY)).toBe('dracula')

      // Toggle to light
      act(() => result.current.toggleTheme())
      expect(result.current.themeId).toBe('kubestellar-light')

      // Toggle to system
      act(() => result.current.toggleTheme())
      expect(result.current.themeId).toBe('system')

      // Toggle back — should return to dracula (last dark), not kubestellar
      act(() => result.current.toggleTheme())
      expect(result.current.themeId).toBe('dracula')
    }
  })
})

// ===========================================================================
// 5. ThemeProvider context wrapping
// ===========================================================================
describe('ThemeProvider context wrapping', () => {
  it('returns fallback values when used outside ThemeProvider', () => {
    // Render without wrapper
    const { result } = renderHook(() => useTheme())

    expect(result.current.themeId).toBe('kubestellar')
    expect(result.current.isDark).toBe(true)
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.theme).toBe('dark')
    expect(result.current.currentTheme).toBeDefined()
    expect(result.current.chartColors).toBeDefined()
  })

  it('fallback setTheme is a no-op', () => {
    const { result } = renderHook(() => useTheme())

    // Should not throw
    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    // Still returns default since there is no provider
    expect(result.current.themeId).toBe('kubestellar')
  })

  it('fallback toggleTheme is a no-op', () => {
    const { result } = renderHook(() => useTheme())

    // Should not throw
    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.themeId).toBe('kubestellar')
  })

  it('provides themes list even outside provider', () => {
    const { result } = renderHook(() => useTheme())

    expect(Array.isArray(result.current.themes)).toBe(true)
    expect(result.current.themes.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// 6. Custom theme application (setTheme by ID)
// ===========================================================================
describe('Custom theme application via setTheme', () => {
  it('switches to a different built-in theme by ID', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(result.current.themeId).toBe('kubestellar-light')
    expect(result.current.isDark).toBe(false)
    expect(result.current.currentTheme.id).toBe('kubestellar-light')
  })

  it('emits analytics event with source "settings" on setTheme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(mockEmitThemeChanged).toHaveBeenCalledWith('kubestellar-light', 'settings')
  })

  it('applies CSS variables to document when theme changes', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    const lightTheme = getThemeById('kubestellar-light')!
    const root = document.documentElement

    expect(root.style.getPropertyValue('--background')).toBe(lightTheme.colors.background)
    expect(root.style.getPropertyValue('--foreground')).toBe(lightTheme.colors.foreground)
    expect(root.style.getPropertyValue('--primary')).toBe(lightTheme.colors.primary)
  })

  it('applies dark/light class on the document root', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement

    // Default dark theme
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('sets data-theme attribute on the document root', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement

    expect(root.getAttribute('data-theme')).toBe('kubestellar')

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(root.getAttribute('data-theme')).toBe('kubestellar-light')
  })

  it('ignores invalid theme IDs gracefully', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('nonexistent-theme-id')
    })

    // Should remain on current theme
    expect(result.current.themeId).toBe('kubestellar')
    expect(mockEmitThemeChanged).not.toHaveBeenCalled()
  })

  it('applies special effect classes for themes that have them', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement

    // Find a theme with special effects
    const allThemes = getAllThemes()
    const starFieldTheme = allThemes.find(t => t.starField)
    const glowTheme = allThemes.find(t => t.glowEffects)
    const gradientTheme = allThemes.find(t => t.gradientAccents)

    if (starFieldTheme) {
      act(() => result.current.setTheme(starFieldTheme.id))
      expect(root.classList.contains('theme-star-field')).toBe(true)
    }

    if (glowTheme) {
      act(() => result.current.setTheme(glowTheme.id))
      expect(root.classList.contains('theme-glow-effects')).toBe(true)
    }

    if (gradientTheme) {
      act(() => result.current.setTheme(gradientTheme.id))
      expect(root.classList.contains('theme-gradient-accents')).toBe(true)
    }
  })

  it('removes special effect classes when switching to a theme without them', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement

    const allThemes = getAllThemes()
    const starFieldTheme = allThemes.find(t => t.starField)

    if (starFieldTheme) {
      // Switch to a theme with star field
      act(() => result.current.setTheme(starFieldTheme.id))
      expect(root.classList.contains('theme-star-field')).toBe(true)

      // Switch back to default (no star field)
      act(() => result.current.setTheme('kubestellar'))
      expect(root.classList.contains('theme-star-field')).toBe(false)
    }
  })

  it('applies brand colors as CSS variables', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    const defaultTheme = getDefaultTheme()
    const root = document.documentElement

    expect(root.style.getPropertyValue('--ks-purple')).toBe(defaultTheme.colors.brandPrimary)
    expect(root.style.getPropertyValue('--ks-blue')).toBe(defaultTheme.colors.brandSecondary)
    expect(root.style.getPropertyValue('--ks-pink')).toBe(defaultTheme.colors.brandTertiary)
    expect(root.style.getPropertyValue('--ks-green')).toBe(defaultTheme.colors.success)
    expect(root.style.getPropertyValue('--ks-cyan')).toBe(defaultTheme.colors.info)
  })

  it('applies status colors as CSS variables', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    const defaultTheme = getDefaultTheme()
    const root = document.documentElement

    expect(root.style.getPropertyValue('--color-success')).toBe(defaultTheme.colors.success)
    expect(root.style.getPropertyValue('--color-warning')).toBe(defaultTheme.colors.warning)
    expect(root.style.getPropertyValue('--color-error')).toBe(defaultTheme.colors.error)
    expect(root.style.getPropertyValue('--color-info')).toBe(defaultTheme.colors.info)
  })

  it('applies chart colors as CSS variables', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    const defaultTheme = getDefaultTheme()
    const root = document.documentElement

    expect(root.style.getPropertyValue('--chart-color-1')).toBe(
      defaultTheme.colors.chartColors[0] || defaultTheme.colors.brandPrimary
    )
    expect(root.style.getPropertyValue('--chart-color-2')).toBe(
      defaultTheme.colors.chartColors[1] || defaultTheme.colors.brandSecondary
    )
  })
})

// ===========================================================================
// 7. Font loading behavior
// ===========================================================================
describe('Font loading behavior', () => {
  it('applies font family CSS variables from the theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement
    const defaultTheme = getDefaultTheme()

    expect(root.style.getPropertyValue('--font-family')).toBe(defaultTheme.font.family)
    expect(root.style.getPropertyValue('--font-mono')).toBe(defaultTheme.font.monoFamily)
  })

  it('applies font weight CSS variables from the theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const root = document.documentElement
    const defaultTheme = getDefaultTheme()

    expect(root.style.getPropertyValue('--font-weight-normal')).toBe(
      String(defaultTheme.font.weight.normal)
    )
    expect(root.style.getPropertyValue('--font-weight-medium')).toBe(
      String(defaultTheme.font.weight.medium)
    )
    expect(root.style.getPropertyValue('--font-weight-semibold')).toBe(
      String(defaultTheme.font.weight.semibold)
    )
    expect(root.style.getPropertyValue('--font-weight-bold')).toBe(
      String(defaultTheme.font.weight.bold)
    )
  })

  it('does not inject link tags for default fonts (Inter, JetBrains Mono)', () => {
    renderHook(() => useTheme(), { wrapper })

    // Default fonts (Inter, JetBrains Mono) are loaded via index.css @import,
    // so no <link> should be injected for them
    const links = document.head.querySelectorAll('link[rel="stylesheet"]')
    const googleFontLinks = Array.from(links).filter(
      link => link.getAttribute('href')?.includes('fonts.googleapis.com')
    )
    // Default theme uses Inter — should NOT produce a Google Fonts link
    const interLinks = googleFontLinks.filter(
      link => link.getAttribute('href')?.includes('Inter')
    )
    expect(interLinks.length).toBe(0)
  })

  it('injects a Google Fonts link for non-default font families', () => {
    const allThemes = getAllThemes()
    // Find a theme that uses a non-default font (not Inter or JetBrains Mono)
    const customFontTheme = allThemes.find(t => {
      const match = t.font.family.match(/['"]?([^'",:]+)['"]?/)
      const fontName = match?.[1]?.trim()
      return fontName && fontName !== 'Inter' && fontName !== 'JetBrains Mono'
    })

    if (customFontTheme) {
      const { result } = renderHook(() => useTheme(), { wrapper })

      act(() => {
        result.current.setTheme(customFontTheme.id)
      })

      const links = document.head.querySelectorAll('link[rel="stylesheet"]')
      const googleFontLinks = Array.from(links).filter(
        link => link.getAttribute('href')?.includes('fonts.googleapis.com')
      )
      expect(googleFontLinks.length).toBeGreaterThan(0)
    }
  })

  it('updates font CSS variables when switching themes', () => {
    const allThemes = getAllThemes()
    const otherTheme = allThemes.find(t => t.id !== 'kubestellar' && t.font.family !== getDefaultTheme().font.family)

    if (otherTheme) {
      const { result } = renderHook(() => useTheme(), { wrapper })
      const root = document.documentElement

      act(() => {
        result.current.setTheme(otherTheme.id)
      })

      expect(root.style.getPropertyValue('--font-family')).toBe(otherTheme.font.family)
      expect(root.style.getPropertyValue('--font-mono')).toBe(otherTheme.font.monoFamily)
    }
  })
})

// ===========================================================================
// 8. Settings changed event
// ===========================================================================
describe('Settings changed event', () => {
  it('dispatches kubestellar-settings-changed event when theme changes', () => {
    const eventHandler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', eventHandler)

    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setTheme('kubestellar-light')
    })

    expect(eventHandler).toHaveBeenCalled()

    window.removeEventListener('kubestellar-settings-changed', eventHandler)
  })
})

// ===========================================================================
// 9. Legacy compatibility
// ===========================================================================
describe('Legacy compatibility', () => {
  it('returns "dark" for theme property when a dark theme is active', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('dark')
  })

  it('returns "light" for theme property when a light theme is active', () => {
    localStorage.setItem(STORAGE_KEY, 'kubestellar-light')
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('light')
  })

  it('returns "system" for theme property when system theme is active', () => {
    localStorage.setItem(STORAGE_KEY, 'system')
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('system')
  })
})
