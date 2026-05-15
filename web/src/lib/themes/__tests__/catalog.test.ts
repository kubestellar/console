import { describe, it, expect } from 'vitest'
import * as catalog from '../catalog'

describe('themes/catalog', () => {
  it('exports complete theme catalog', () => {
    const themes = Object.values(catalog)
    expect(themes).toHaveLength(29)
  })

  it('keeps IDs unique and non-empty', () => {
    const themes = Object.values(catalog)
    const ids = themes.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(id => id.length > 0)).toBe(true)
  })

  it('ensures each theme has required shape', () => {
    for (const theme of Object.values(catalog)) {
      expect(typeof theme.name).toBe('string')
      expect(typeof theme.description).toBe('string')
      expect(typeof theme.dark).toBe('boolean')
      expect(theme.colors.chartColors.length).toBeGreaterThanOrEqual(8)
      expect(theme.font.weight.bold).toBeGreaterThanOrEqual(theme.font.weight.normal)
    }
  })
})
