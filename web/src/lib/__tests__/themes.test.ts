import { describe, it, expect, beforeEach } from 'vitest'
import {
  themes,
  themeGroups,
  getAllThemes,
  getThemeById,
  getDefaultTheme,
  getCustomThemes,
  addCustomTheme,
  removeCustomTheme,
} from '../themes'
import type { Theme, ThemeColors } from '../themes'
import { STORAGE_KEY_CUSTOM_THEMES } from '../constants/storage'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Built-in themes collection
// ---------------------------------------------------------------------------

describe('themes collection', () => {
  it('exports a non-empty array of themes', () => {
    expect(Array.isArray(themes)).toBe(true)
    expect(themes.length).toBeGreaterThan(0)
  })

  it('contains at least the kubestellar default theme', () => {
    const ks = themes.find(t => t.id === 'kubestellar')
    expect(ks).toBeDefined()
    expect(ks!.name).toBe('KubeStellar')
  })

  it('all themes have unique ids', () => {
    const ids = themes.map(t => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('all themes have required properties', () => {
    for (const theme of themes) {
      expect(typeof theme.id).toBe('string')
      expect(theme.id.length).toBeGreaterThan(0)
      expect(typeof theme.name).toBe('string')
      expect(theme.name.length).toBeGreaterThan(0)
      expect(typeof theme.description).toBe('string')
      expect(typeof theme.dark).toBe('boolean')
      expect(theme.colors).toBeDefined()
      expect(theme.font).toBeDefined()
    }
  })

  it('all themes have font with required weight properties', () => {
    for (const theme of themes) {
      expect(typeof theme.font.family).toBe('string')
      expect(typeof theme.font.monoFamily).toBe('string')
      expect(typeof theme.font.weight.normal).toBe('number')
      expect(typeof theme.font.weight.medium).toBe('number')
      expect(typeof theme.font.weight.semibold).toBe('number')
      expect(typeof theme.font.weight.bold).toBe('number')
    }
  })

  it('all themes have complete ThemeColors', () => {
    const requiredColorKeys: Array<keyof ThemeColors> = [
      'background', 'foreground', 'card', 'cardForeground',
      'primary', 'primaryForeground', 'secondary', 'secondaryForeground',
      'muted', 'mutedForeground', 'accent', 'accentForeground',
      'destructive', 'destructiveForeground', 'border', 'input', 'ring',
      'brandPrimary', 'brandSecondary', 'brandTertiary',
      'success', 'warning', 'error', 'info',
      'glassBackground', 'glassBorder', 'glassShadow',
      'scrollbarThumb', 'scrollbarThumbHover',
      'chartColors',
    ]

    for (const theme of themes) {
      for (const key of requiredColorKeys) {
        expect(theme.colors).toHaveProperty(key)
      }
    }
  })

  it('all themes have chartColors array with at least one entry', () => {
    for (const theme of themes) {
      expect(Array.isArray(theme.colors.chartColors)).toBe(true)
      expect(theme.colors.chartColors.length).toBeGreaterThan(0)
    }
  })

  it('includes both dark and light themes', () => {
    const hasDark = themes.some(t => t.dark === true)
    const hasLight = themes.some(t => t.dark === false)
    expect(hasDark).toBe(true)
    expect(hasLight).toBe(true)
  })

  it('contains expected well-known themes', () => {
    const expectedIds = [
      'kubestellar', 'kubestellar-classic', 'kubestellar-light',
      'dracula', 'nord', 'tokyo-night', 'monokai', 'gruvbox',
      'catppuccin', 'matrix', 'cyberpunk', 'solarized-dark',
      'batman', 'one-dark', 'github-light',
    ]
    for (const id of expectedIds) {
      expect(themes.find(t => t.id === id)).toBeDefined()
    }
  })

  it('kubestellar-classic extends kubestellar colors', () => {
    const ks = themes.find(t => t.id === 'kubestellar')!
    const classic = themes.find(t => t.id === 'kubestellar-classic')!
    // classic shares most colors from kubestellar
    expect(classic.colors.background).toBe(ks.colors.background)
    expect(classic.colors.foreground).toBe(ks.colors.foreground)
    expect(classic.colors.primary).toBe(ks.colors.primary)
    // but overrides glassShadow
    expect(classic.colors.glassShadow).not.toBe(ks.colors.glassShadow)
  })

  it('kubestellar-classic has starField and glowEffects enabled', () => {
    const classic = themes.find(t => t.id === 'kubestellar-classic')!
    expect(classic.starField).toBe(true)
    expect(classic.glowEffects).toBe(true)
    expect(classic.gradientAccents).toBe(true)
  })

  it('batman theme has correct brand colors', () => {
    const batman = themes.find(t => t.id === 'batman')!
    expect(batman.colors.brandPrimary).toBe('#fbbf24')
    expect(batman.dark).toBe(true)
    expect(batman.author).toBe('Gotham')
  })

  it('matrix theme uses monospace for all font weights', () => {
    const matrix = themes.find(t => t.id === 'matrix')!
    // Matrix uses identical weights for all
    expect(matrix.font.weight.normal).toBe(matrix.font.weight.bold)
  })

  it('themes with author field have non-empty author', () => {
    const themed = themes.filter(t => t.author !== undefined)
    for (const theme of themed) {
      expect(typeof theme.author).toBe('string')
      expect(theme.author!.length).toBeGreaterThan(0)
    }
  })

  it('starField property defaults as expected for non-space themes', () => {
    const nord = themes.find(t => t.id === 'nord')!
    expect(nord.starField).toBe(false)

    const sunset = themes.find(t => t.id === 'sunset')!
    expect(sunset.starField).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Theme groups
// ---------------------------------------------------------------------------

describe('themeGroups', () => {
  it('is a non-empty array of groups', () => {
    expect(Array.isArray(themeGroups)).toBe(true)
    expect(themeGroups.length).toBeGreaterThan(0)
  })

  it('each group has name and themes array', () => {
    for (const group of themeGroups) {
      expect(typeof group.name).toBe('string')
      expect(group.name.length).toBeGreaterThan(0)
      expect(Array.isArray(group.themes)).toBe(true)
      expect(group.themes.length).toBeGreaterThan(0)
    }
  })

  it('all theme ids referenced in groups exist in the themes array', () => {
    const themeIds = new Set(themes.map(t => t.id))
    for (const group of themeGroups) {
      for (const themeId of group.themes) {
        expect(themeIds.has(themeId)).toBe(true)
      }
    }
  })

  it('contains the KubeStellar group first', () => {
    expect(themeGroups[0].name).toBe('KubeStellar')
    expect(themeGroups[0].themes).toContain('kubestellar')
  })

  it('has expected group names', () => {
    const groupNames = themeGroups.map(g => g.name)
    expect(groupNames).toContain('Popular')
    expect(groupNames).toContain('Developer')
    expect(groupNames).toContain('Iconic')
    expect(groupNames).toContain('Nature')
  })
})

// ---------------------------------------------------------------------------
// getDefaultTheme
// ---------------------------------------------------------------------------

describe('getDefaultTheme', () => {
  it('returns the kubestellar theme', () => {
    const def = getDefaultTheme()
    expect(def.id).toBe('kubestellar')
    expect(def.name).toBe('KubeStellar')
  })

  it('returned theme has dark mode enabled', () => {
    expect(getDefaultTheme().dark).toBe(true)
  })

  it('returned theme is the same object as in the themes array', () => {
    const def = getDefaultTheme()
    const fromArray = themes.find(t => t.id === 'kubestellar')
    expect(def).toBe(fromArray)
  })
})

// ---------------------------------------------------------------------------
// getThemeById
// ---------------------------------------------------------------------------

describe('getThemeById', () => {
  it('returns the correct theme for a known id', () => {
    const result = getThemeById('dracula')
    expect(result).toBeDefined()
    expect(result!.id).toBe('dracula')
    expect(result!.name).toBe('Dracula')
  })

  it('returns undefined for an unknown id', () => {
    expect(getThemeById('nonexistent-theme')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getThemeById('')).toBeUndefined()
  })

  it('returns the correct theme for each built-in theme', () => {
    for (const theme of themes) {
      const found = getThemeById(theme.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(theme.id)
    }
  })

  it('finds custom themes added to localStorage', () => {
    const custom: Theme = {
      id: 'my-custom',
      name: 'My Custom',
      description: 'A custom theme',
      dark: true,
      colors: themes[0].colors,
      font: themes[0].font,
    }
    addCustomTheme(custom)

    const found = getThemeById('my-custom')
    expect(found).toBeDefined()
    expect(found!.name).toBe('My Custom')
  })
})

// ---------------------------------------------------------------------------
// Custom themes management
// ---------------------------------------------------------------------------

describe('getCustomThemes', () => {
  it('returns empty array when no custom themes stored', () => {
    expect(getCustomThemes()).toEqual([])
  })

  it('returns custom themes from localStorage', () => {
    const custom: Theme = {
      id: 'custom-1',
      name: 'Custom 1',
      description: 'Test',
      dark: true,
      colors: themes[0].colors,
      font: themes[0].font,
    }
    localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify([custom]))

    const result = getCustomThemes()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('custom-1')
  })

  it('returns empty array for invalid JSON in localStorage', () => {
    localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, '{invalid json')
    expect(getCustomThemes()).toEqual([])
  })

  it('returns empty array for null/empty localStorage value', () => {
    localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, '')
    // empty string parses as falsy in the || '[]' fallback
    expect(getCustomThemes()).toEqual([])
  })
})

describe('addCustomTheme', () => {
  it('adds a new custom theme to localStorage', () => {
    const custom: Theme = {
      id: 'added-theme',
      name: 'Added Theme',
      description: 'Testing add',
      dark: false,
      colors: themes[0].colors,
      font: themes[0].font,
    }
    addCustomTheme(custom)

    const stored = getCustomThemes()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('added-theme')
  })

  it('replaces existing theme with same id', () => {
    const v1: Theme = {
      id: 'replace-me',
      name: 'Version 1',
      description: 'V1',
      dark: true,
      colors: themes[0].colors,
      font: themes[0].font,
    }
    const v2: Theme = {
      id: 'replace-me',
      name: 'Version 2',
      description: 'V2',
      dark: false,
      colors: themes[0].colors,
      font: themes[0].font,
    }

    addCustomTheme(v1)
    addCustomTheme(v2)

    const stored = getCustomThemes()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Version 2')
  })

  it('appends to existing custom themes', () => {
    const c1: Theme = {
      id: 'c1', name: 'C1', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    const c2: Theme = {
      id: 'c2', name: 'C2', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }

    addCustomTheme(c1)
    addCustomTheme(c2)

    const stored = getCustomThemes()
    expect(stored).toHaveLength(2)
    expect(stored.map(t => t.id)).toEqual(['c1', 'c2'])
  })
})

describe('removeCustomTheme', () => {
  it('removes a custom theme by id', () => {
    const c1: Theme = {
      id: 'to-remove', name: 'Remove Me', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    addCustomTheme(c1)
    expect(getCustomThemes()).toHaveLength(1)

    removeCustomTheme('to-remove')
    expect(getCustomThemes()).toHaveLength(0)
  })

  it('does nothing if id does not exist', () => {
    const c1: Theme = {
      id: 'keeper', name: 'Keeper', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    addCustomTheme(c1)

    removeCustomTheme('nonexistent')
    expect(getCustomThemes()).toHaveLength(1)
    expect(getCustomThemes()[0].id).toBe('keeper')
  })

  it('removes only the specified theme when multiple exist', () => {
    const c1: Theme = {
      id: 'keep-a', name: 'A', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    const c2: Theme = {
      id: 'remove-b', name: 'B', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    const c3: Theme = {
      id: 'keep-c', name: 'C', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }

    addCustomTheme(c1)
    addCustomTheme(c2)
    addCustomTheme(c3)

    removeCustomTheme('remove-b')

    const remaining = getCustomThemes()
    expect(remaining).toHaveLength(2)
    expect(remaining.map(t => t.id)).toEqual(['keep-a', 'keep-c'])
  })
})

// ---------------------------------------------------------------------------
// getAllThemes
// ---------------------------------------------------------------------------

describe('getAllThemes', () => {
  it('returns built-in themes when no custom themes', () => {
    const all = getAllThemes()
    expect(all.length).toBe(themes.length)
  })

  it('includes custom themes after built-in themes', () => {
    const custom: Theme = {
      id: 'custom-all', name: 'Custom All', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    addCustomTheme(custom)

    const all = getAllThemes()
    expect(all.length).toBe(themes.length + 1)
    expect(all[all.length - 1].id).toBe('custom-all')
  })

  it('built-in themes are unchanged when custom themes are added', () => {
    const custom: Theme = {
      id: 'custom-check', name: 'Check', description: '', dark: true,
      colors: themes[0].colors, font: themes[0].font,
    }
    addCustomTheme(custom)

    const all = getAllThemes()
    // Built-in themes should be at the start, in same order
    for (let i = 0; i < themes.length; i++) {
      expect(all[i].id).toBe(themes[i].id)
    }
  })
})

// ---------------------------------------------------------------------------
// Theme data integrity
// ---------------------------------------------------------------------------

describe('theme data integrity', () => {
  it('HSL color values follow expected format (no hsl() wrapper)', () => {
    const hslKeys: Array<keyof ThemeColors> = [
      'background', 'foreground', 'card', 'cardForeground',
      'primary', 'primaryForeground', 'secondary', 'secondaryForeground',
      'muted', 'mutedForeground', 'accent', 'accentForeground',
      'destructive', 'destructiveForeground', 'border', 'input', 'ring',
    ]

    for (const theme of themes) {
      for (const key of hslKeys) {
        const value = theme.colors[key] as string
        // Should NOT start with "hsl(" — just raw H S% L%
        expect(value).not.toMatch(/^hsl\(/)
        // Should contain at least numbers and spaces
        expect(value).toMatch(/\d/)
      }
    }
  })

  it('hex color values start with #', () => {
    const hexKeys: Array<keyof ThemeColors> = [
      'brandPrimary', 'brandSecondary', 'brandTertiary',
      'success', 'warning', 'error', 'info',
    ]

    for (const theme of themes) {
      for (const key of hexKeys) {
        const value = theme.colors[key] as string
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('chartColors entries are valid hex colors', () => {
    for (const theme of themes) {
      for (const color of theme.colors.chartColors) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('font weights are positive numbers', () => {
    for (const theme of themes) {
      expect(theme.font.weight.normal).toBeGreaterThan(0)
      expect(theme.font.weight.medium).toBeGreaterThanOrEqual(theme.font.weight.normal)
      expect(theme.font.weight.bold).toBeGreaterThanOrEqual(theme.font.weight.normal)
    }
  })

  it('light themes have light background values', () => {
    const lightThemes = themes.filter(t => !t.dark)
    for (const theme of lightThemes) {
      // Light themes should have high lightness in background HSL
      const parts = theme.colors.background.split(' ')
      const lightness = parseInt(parts[parts.length - 1])
      // Light themes should have lightness >= 90%
      expect(lightness).toBeGreaterThanOrEqual(90)
    }
  })
})
