/**
 * Tests for lib/themes/storage.ts
 *
 * Covers getCustomThemes, addCustomTheme, and removeCustomTheme using
 * jsdom localStorage (auto-cleared between tests via beforeEach).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCustomThemes, addCustomTheme, removeCustomTheme } from '../storage'
import type { Theme } from '../types'

const STORAGE_KEY = 'kc-custom-themes'

function makeTheme(id: string, name: string = id): Theme {
  return {
    id,
    name,
    description: `${name} theme`,
    dark: true,
    colors: {
      background: '0 0% 4%',
      foreground: '0 0% 100%',
      card: '222 47% 8%',
      cardForeground: '0 0% 100%',
      primary: '210 100% 50%',
      primaryForeground: '0 0% 100%',
      secondary: '220 13% 18%',
      secondaryForeground: '0 0% 80%',
      muted: '220 13% 12%',
      mutedForeground: '0 0% 55%',
      accent: '200 100% 50%',
      accentForeground: '0 0% 100%',
      destructive: '0 72% 51%',
      destructiveForeground: '0 0% 100%',
      border: '220 13% 20%',
      input: '220 13% 18%',
      ring: '210 100% 50%',
      brandPrimary: '#3B82F6',
      brandSecondary: '#06B6D4',
      brandTertiary: '#8B5CF6',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
      glassBackground: 'rgba(255,255,255,0.05)',
      glassBorder: 'rgba(255,255,255,0.1)',
      glassShadow: 'rgba(0,0,0,0.3)',
      scrollbarThumb: '#374151',
      scrollbarThumbHover: '#4B5563',
      chartColors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6'],
    },
    font: {
      family: 'Inter, sans-serif',
      monoFamily: 'JetBrains Mono, monospace',
      weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    },
  }
}

describe('getCustomThemes', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty array when no custom themes stored', () => {
    expect(getCustomThemes()).toEqual([])
  })

  it('returns stored themes', () => {
    const theme = makeTheme('my-theme')
    localStorage.setItem(STORAGE_KEY, JSON.stringify([theme]))
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].id).toBe('my-theme')
  })

  it('returns empty array when stored JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{')
    expect(getCustomThemes()).toEqual([])
  })

  it('returns empty array when stored value is null', () => {
    localStorage.removeItem(STORAGE_KEY)
    expect(getCustomThemes()).toEqual([])
  })
})

describe('addCustomTheme', () => {
  beforeEach(() => localStorage.clear())

  it('persists a new theme', () => {
    const theme = makeTheme('custom-a')
    addCustomTheme(theme)
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].id).toBe('custom-a')
  })

  it('appends to existing themes', () => {
    addCustomTheme(makeTheme('first'))
    addCustomTheme(makeTheme('second'))
    const themes = getCustomThemes()
    expect(themes).toHaveLength(2)
    expect(themes.map(t => t.id)).toContain('first')
    expect(themes.map(t => t.id)).toContain('second')
  })

  it('replaces existing theme with same id', () => {
    addCustomTheme(makeTheme('dup', 'Original'))
    addCustomTheme(makeTheme('dup', 'Updated'))
    const themes = getCustomThemes()
    expect(themes).toHaveLength(1)
    expect(themes[0].name).toBe('Updated')
  })

  it('writes to localStorage with the correct key', () => {
    addCustomTheme(makeTheme('write-check'))
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw).toContain('write-check')
  })
})

describe('removeCustomTheme', () => {
  beforeEach(() => localStorage.clear())

  it('removes theme with matching id', () => {
    addCustomTheme(makeTheme('remove-me'))
    removeCustomTheme('remove-me')
    expect(getCustomThemes()).toHaveLength(0)
  })

  it('keeps other themes when removing one', () => {
    addCustomTheme(makeTheme('keep'))
    addCustomTheme(makeTheme('remove'))
    removeCustomTheme('remove')
    const themes = getCustomThemes()
    expect(themes).toHaveLength(1)
    expect(themes[0].id).toBe('keep')
  })

  it('is a no-op when id does not exist', () => {
    addCustomTheme(makeTheme('stays'))
    removeCustomTheme('nonexistent')
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].id).toBe('stays')
  })

  it('handles removal when storage is empty', () => {
    expect(() => removeCustomTheme('ghost')).not.toThrow()
    expect(getCustomThemes()).toEqual([])
  })
})
