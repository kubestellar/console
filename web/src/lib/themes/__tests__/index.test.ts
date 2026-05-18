/**
 * Tests for lib/themes/index.ts
 *
 * Covers getAllThemes, getThemeById, getDefaultTheme, themes array, and
 * themeGroups shape. Custom-theme integration (via getCustomThemes) is
 * verified through localStorage stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  themes,
  themeGroups,
  getAllThemes,
  getThemeById,
  getDefaultTheme,
} from '../index'
import type { Theme } from '../types'

const CUSTOM_THEMES_KEY = 'kc-custom-themes'

function makeMinimalTheme(id: string): Theme {
  return {
    id,
    name: id,
    description: '',
    dark: false,
    colors: {
      background: '', foreground: '', card: '', cardForeground: '',
      primary: '', primaryForeground: '', secondary: '', secondaryForeground: '',
      muted: '', mutedForeground: '', accent: '', accentForeground: '',
      destructive: '', destructiveForeground: '', border: '', input: '', ring: '',
      brandPrimary: '', brandSecondary: '', brandTertiary: '',
      success: '', warning: '', error: '', info: '',
      glassBackground: '', glassBorder: '', glassShadow: '',
      scrollbarThumb: '', scrollbarThumbHover: '',
      chartColors: [],
    },
    font: { family: '', monoFamily: '', weight: { normal: 400, medium: 500, semibold: 600, bold: 700 } },
  }
}

describe('themes array', () => {
  it('contains at least one theme', () => {
    expect(themes.length).toBeGreaterThan(0)
  })

  it('includes the kubestellar theme', () => {
    expect(themes.find(t => t.id === 'kubestellar')).toBeDefined()
  })

  it('all themes have unique IDs', () => {
    const ids = themes.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all theme IDs are non-empty strings', () => {
    expect(themes.every(t => typeof t.id === 'string' && t.id.length > 0)).toBe(true)
  })
})

describe('themeGroups', () => {
  it('contains multiple groups', () => {
    expect(themeGroups.length).toBeGreaterThan(0)
  })

  it('each group has a non-empty name and themes array', () => {
    for (const group of themeGroups) {
      expect(typeof group.name).toBe('string')
      expect(group.name.length).toBeGreaterThan(0)
      expect(Array.isArray(group.themes)).toBe(true)
      expect(group.themes.length).toBeGreaterThan(0)
    }
  })

  it('KubeStellar group exists', () => {
    expect(themeGroups.find(g => g.name === 'KubeStellar')).toBeDefined()
  })

  it('kubestellar appears in KubeStellar group', () => {
    const ksGroup = themeGroups.find(g => g.name === 'KubeStellar')
    expect(ksGroup?.themes).toContain('kubestellar')
  })
})

describe('getAllThemes', () => {
  beforeEach(() => localStorage.clear())

  it('returns at least the built-in themes', () => {
    expect(getAllThemes().length).toBeGreaterThanOrEqual(themes.length)
  })

  it('includes custom themes from localStorage', () => {
    const custom = makeMinimalTheme('my-custom')
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify([custom]))
    const all = getAllThemes()
    expect(all.find(t => t.id === 'my-custom')).toBeDefined()
  })

  it('does not duplicate built-in themes', () => {
    const all = getAllThemes()
    const ids = all.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns a new array each call (non-mutating)', () => {
    const a = getAllThemes()
    const b = getAllThemes()
    expect(a).not.toBe(b)
  })
})

describe('getThemeById', () => {
  beforeEach(() => localStorage.clear())

  it('returns the kubestellar theme by id', () => {
    const t = getThemeById('kubestellar')
    expect(t).toBeDefined()
    expect(t?.id).toBe('kubestellar')
  })

  it('returns undefined for unknown id', () => {
    expect(getThemeById('does-not-exist')).toBeUndefined()
  })

  it('finds custom theme by id', () => {
    const custom = makeMinimalTheme('special')
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify([custom]))
    expect(getThemeById('special')).toBeDefined()
    expect(getThemeById('special')?.id).toBe('special')
  })

  it('returns undefined for empty string id', () => {
    expect(getThemeById('')).toBeUndefined()
  })
})

describe('getDefaultTheme', () => {
  it('returns a theme object', () => {
    const d = getDefaultTheme()
    expect(d).toBeDefined()
    expect(typeof d.id).toBe('string')
  })

  it('returns the kubestellar theme as default', () => {
    expect(getDefaultTheme().id).toBe('kubestellar')
  })

  it('returns same reference on repeated calls', () => {
    expect(getDefaultTheme()).toBe(getDefaultTheme())
  })
})
