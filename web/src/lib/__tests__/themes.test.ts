import { describe, it, expect, beforeEach } from 'vitest'
import {
  themes,
  themeGroups,
  getCustomThemes,
  addCustomTheme,
  removeCustomTheme,
  getAllThemes,
  getThemeById,
  getDefaultTheme,
  type Theme,
} from '../themes'

describe('themes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('themes array', () => {
    it('contains all built-in themes', () => {
      expect(themes.length).toBeGreaterThanOrEqual(20)
    })

    it('every theme has a unique id', () => {
      const ids = themes.map(t => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('every theme has required fields', () => {
      for (const theme of themes) {
        expect(theme.id).toBeTruthy()
        expect(theme.name).toBeTruthy()
        expect(theme.description).toBeTruthy()
        expect(typeof theme.dark).toBe('boolean')
        expect(theme.colors).toBeDefined()
        expect(theme.font).toBeDefined()
      }
    })

    it('every theme has valid color fields', () => {
      for (const theme of themes) {
        expect(theme.colors.background).toBeTruthy()
        expect(theme.colors.foreground).toBeTruthy()
        expect(theme.colors.brandPrimary).toMatch(/^#/)
        expect(theme.colors.success).toMatch(/^#/)
        expect(theme.colors.warning).toMatch(/^#/)
        expect(theme.colors.error).toMatch(/^#/)
        expect(theme.colors.chartColors.length).toBeGreaterThanOrEqual(4)
      }
    })

    it('every theme has valid font fields', () => {
      for (const theme of themes) {
        expect(theme.font.family).toBeTruthy()
        expect(theme.font.monoFamily).toBeTruthy()
        expect(theme.font.weight.normal).toBe(400)
        // bold weight varies by theme (e.g. Matrix uses 400 for uniform monospace)
        expect(theme.font.weight.bold).toBeGreaterThanOrEqual(400)
      }
    })
  })

  describe('themeGroups', () => {
    it('contains multiple groups', () => {
      expect(themeGroups.length).toBeGreaterThanOrEqual(5)
    })

    it('every group references valid theme ids', () => {
      const allIds = new Set(themes.map(t => t.id))
      for (const group of themeGroups) {
        for (const themeId of group.themes) {
          expect(allIds.has(themeId)).toBe(true)
        }
      }
    })

    it('has KubeStellar as first group', () => {
      expect(themeGroups[0].name).toBe('KubeStellar')
    })
  })

  describe('getDefaultTheme', () => {
    it('returns the kubestellar theme', () => {
      const def = getDefaultTheme()
      expect(def.id).toBe('kubestellar')
      expect(def.dark).toBe(true)
    })
  })

  describe('getThemeById', () => {
    it('finds built-in themes by id', () => {
      const theme = getThemeById('dracula')
      expect(theme).toBeDefined()
      expect(theme!.name).toBe('Dracula')
    })

    it('returns undefined for unknown theme id', () => {
      expect(getThemeById('nonexistent-theme')).toBeUndefined()
    })

    it('finds custom themes stored in localStorage', () => {
      const custom: Theme = {
        id: 'my-custom',
        name: 'My Custom',
        description: 'Test theme',
        dark: true,
        colors: getDefaultTheme().colors,
        font: getDefaultTheme().font,
      }
      addCustomTheme(custom)
      const found = getThemeById('my-custom')
      expect(found).toBeDefined()
      expect(found!.name).toBe('My Custom')
    })
  })

  describe('getCustomThemes', () => {
    it('returns empty array when no custom themes exist', () => {
      expect(getCustomThemes()).toEqual([])
    })

    it('returns parsed themes from localStorage', () => {
      const custom: Theme = {
        id: 'test-theme',
        name: 'Test',
        description: 'desc',
        dark: true,
        colors: getDefaultTheme().colors,
        font: getDefaultTheme().font,
      }
      localStorage.setItem('kc-custom-themes', JSON.stringify([custom]))
      const result = getCustomThemes()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('test-theme')
    })

    it('returns empty array on corrupt JSON', () => {
      localStorage.setItem('kc-custom-themes', '{broken')
      expect(getCustomThemes()).toEqual([])
    })
  })

  describe('addCustomTheme', () => {
    it('adds a theme to localStorage', () => {
      const custom: Theme = {
        id: 'added',
        name: 'Added',
        description: 'desc',
        dark: false,
        colors: getDefaultTheme().colors,
        font: getDefaultTheme().font,
      }
      addCustomTheme(custom)
      const stored = getCustomThemes()
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('added')
    })

    it('replaces existing theme with same id', () => {
      const base = { description: '', dark: true as const, colors: getDefaultTheme().colors, font: getDefaultTheme().font }
      const v1: Theme = { id: 'dup', name: 'V1', ...base }
      const v2: Theme = { id: 'dup', name: 'V2', ...base }
      addCustomTheme(v1)
      addCustomTheme(v2)
      const stored = getCustomThemes()
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('V2')
    })
  })

  describe('removeCustomTheme', () => {
    it('removes a theme by id', () => {
      const custom: Theme = { id: 'rm', name: 'RM', description: '', dark: true, colors: getDefaultTheme().colors, font: getDefaultTheme().font }
      addCustomTheme(custom)
      expect(getCustomThemes()).toHaveLength(1)
      removeCustomTheme('rm')
      expect(getCustomThemes()).toHaveLength(0)
    })

    it('does nothing when removing nonexistent theme', () => {
      removeCustomTheme('no-such-theme')
      expect(getCustomThemes()).toEqual([])
    })
  })

  describe('getAllThemes', () => {
    it('includes built-in themes', () => {
      const all = getAllThemes()
      expect(all.length).toBeGreaterThanOrEqual(themes.length)
    })

    it('includes custom themes', () => {
      const custom: Theme = { id: 'extra', name: 'Extra', description: '', dark: true, colors: getDefaultTheme().colors, font: getDefaultTheme().font }
      addCustomTheme(custom)
      const all = getAllThemes()
      expect(all.length).toBe(themes.length + 1)
      expect(all.find(t => t.id === 'extra')).toBeDefined()
    })
  })
})
