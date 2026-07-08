/**
 * Tests for ThemeContext — covers ThemeProvider state management,
 * localStorage persistence, system preference detection, theme toggling,
 * and CSS class application.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

// Mock analytics to avoid side effects
vi.mock('../../lib/analytics', () => ({
  emitThemeChanged: vi.fn(),
}))

// Mock external config
vi.mock('../../config/externalApis', () => ({
  GOOGLE_FONTS_API_URL: 'https://fonts.googleapis.com/css2',
}))

import { ThemeProvider, useTheme } from '../ThemeContext'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ThemeProvider, null, children)
}

describe('ThemeContext', () => {
  let matchMediaListeners: Array<(e: MediaQueryListEvent) => void> = []
  let matchMediaMatches = true

  beforeEach(() => {
    matchMediaListeners = []
    matchMediaMatches = true
    localStorage.clear()

    // Reset document classes and attributes
    document.documentElement.classList.remove('dark', 'light', 'theme-star-field', 'theme-glow-effects', 'theme-gradient-accents')
    document.documentElement.removeAttribute('data-theme')

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' ? matchMediaMatches : false,
        media: query,
        addEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
          matchMediaListeners.push(handler)
        },
        removeEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
          matchMediaListeners = matchMediaListeners.filter(h => h !== handler)
        },
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('default initialization', () => {
    it('uses kubestellar (dark) theme by default', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themeId).toBe('kubestellar')
      expect(result.current.isDark).toBe(true)
      expect(result.current.resolvedTheme).toBe('dark')
    })

    it('provides theme mode as "dark" by default', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.theme).toBe('dark')
    })

    it('provides a non-empty list of themes', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themes.length).toBeGreaterThan(0)
    })

    it('provides chart colors from the current theme', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.chartColors).toBeDefined()
      expect(Array.isArray(result.current.chartColors)).toBe(true)
      expect(result.current.chartColors.length).toBeGreaterThan(0)
    })
  })

  describe('localStorage persistence', () => {
    it('persists theme selection to localStorage', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('kubestellar-light')
      })
      expect(localStorage.getItem('kubestellar-theme-id')).toBe('kubestellar-light')
    })

    it('hydrates theme from localStorage on mount', () => {
      localStorage.setItem('kubestellar-theme-id', 'kubestellar-light')
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themeId).toBe('kubestellar-light')
      expect(result.current.isDark).toBe(false)
    })

    it('handles legacy "dark" value in localStorage', () => {
      localStorage.setItem('kubestellar-theme-id', 'dark')
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themeId).toBe('kubestellar')
    })

    it('handles legacy "light" value in localStorage', () => {
      localStorage.setItem('kubestellar-theme-id', 'light')
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themeId).toBe('kubestellar-light')
    })
  })

  describe('theme switching', () => {
    it('setTheme switches to light theme', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('kubestellar-light')
      })
      expect(result.current.themeId).toBe('kubestellar-light')
      expect(result.current.isDark).toBe(false)
      expect(result.current.resolvedTheme).toBe('light')
      expect(result.current.theme).toBe('light')
    })

    it('setTheme to "system" uses system preference', () => {
      matchMediaMatches = true
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('system')
      })
      expect(result.current.themeId).toBe('system')
      expect(result.current.theme).toBe('system')
      // System prefers dark, so resolved theme should be dark
      expect(result.current.isDark).toBe(true)
      expect(result.current.resolvedTheme).toBe('dark')
    })

    it('ignores invalid theme IDs', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('nonexistent-theme-xyz')
      })
      // Should remain on default theme
      expect(result.current.themeId).toBe('kubestellar')
    })
  })

  describe('toggleTheme cycling', () => {
    it('toggles from dark to light', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.isDark).toBe(true)
      act(() => {
        result.current.toggleTheme()
      })
      expect(result.current.themeId).toBe('kubestellar-light')
      expect(result.current.isDark).toBe(false)
    })

    it('toggles from light to system', () => {
      localStorage.setItem('kubestellar-theme-id', 'kubestellar-light')
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.isDark).toBe(false)
      act(() => {
        result.current.toggleTheme()
      })
      expect(result.current.themeId).toBe('system')
    })

    it('toggles from system back to last dark theme', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      // Go to light, then system, then back to dark
      act(() => {
        result.current.toggleTheme() // dark → light
      })
      act(() => {
        result.current.toggleTheme() // light → system
      })
      expect(result.current.themeId).toBe('system')
      act(() => {
        result.current.toggleTheme() // system → kubestellar (last dark)
      })
      expect(result.current.themeId).toBe('kubestellar')
      expect(result.current.isDark).toBe(true)
    })
  })

  describe('system preference detection', () => {
    it('responds to system preference changes when in system mode', () => {
      matchMediaMatches = true
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('system')
      })
      expect(result.current.isDark).toBe(true)

      // Simulate system preference changing to light
      act(() => {
        matchMediaListeners.forEach(listener =>
          listener({ matches: false } as MediaQueryListEvent)
        )
      })
      expect(result.current.isDark).toBe(false)
      expect(result.current.resolvedTheme).toBe('light')
    })

    it('system preference change has no effect when not in system mode', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.themeId).toBe('kubestellar')

      // Simulate system preference change — should not affect explicit theme
      act(() => {
        matchMediaListeners.forEach(listener =>
          listener({ matches: false } as MediaQueryListEvent)
        )
      })
      expect(result.current.isDark).toBe(true) // still dark
    })
  })

  describe('CSS class application', () => {
    it('applies "dark" class to document root for dark themes', () => {
      renderHook(() => useTheme(), { wrapper })
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('applies "light" class to document root for light themes', () => {
      localStorage.setItem('kubestellar-theme-id', 'kubestellar-light')
      renderHook(() => useTheme(), { wrapper })
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('sets data-theme attribute on document root', () => {
      renderHook(() => useTheme(), { wrapper })
      expect(document.documentElement.getAttribute('data-theme')).toBe('kubestellar')
    })

    it('applies CSS custom properties for theme colors', () => {
      renderHook(() => useTheme(), { wrapper })
      const root = document.documentElement
      // Verify some CSS variables are set (they should be non-empty)
      expect(root.style.getPropertyValue('--background')).not.toBe('')
      expect(root.style.getPropertyValue('--foreground')).not.toBe('')
      expect(root.style.getPropertyValue('--primary')).not.toBe('')
    })

    it('updates CSS classes when theme changes', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      act(() => {
        result.current.setTheme('kubestellar-light')
      })
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  describe('analytics integration', () => {
    it('emits theme change event on setTheme', async () => {
      const { emitThemeChanged } = await import('../../lib/analytics')
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.setTheme('dracula')
      })
      expect(emitThemeChanged).toHaveBeenCalledWith('dracula', 'settings')
    })

    it('emits theme change event on toggleTheme', async () => {
      const { emitThemeChanged } = await import('../../lib/analytics')
      const { result } = renderHook(() => useTheme(), { wrapper })
      act(() => {
        result.current.toggleTheme()
      })
      expect(emitThemeChanged).toHaveBeenCalledWith('kubestellar-light', 'toggle')
    })
  })
})
