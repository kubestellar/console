import { describe, it, expect } from 'vitest'
import { STAT_BLOCK_COLORS } from '../../lib/tokens'

describe('STAT_BLOCK_COLORS', () => {
  it('exports a record of color names to hex values', () => {
    expect(typeof STAT_BLOCK_COLORS).toBe('object')
    expect(Object.keys(STAT_BLOCK_COLORS).length).toBeGreaterThan(0)
  })

  it('includes standard color names', () => {
    const expectedColors = ['purple', 'green', 'orange', 'yellow', 'cyan', 'blue', 'red', 'gray']
    for (const color of expectedColors) {
      expect(STAT_BLOCK_COLORS).toHaveProperty(color)
    }
  })

  it('all values are valid hex color strings', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/
    for (const [, value] of Object.entries(STAT_BLOCK_COLORS)) {
      expect(value).toMatch(hexPattern)
    }
  })

  it('green matches success color', () => {
    expect(STAT_BLOCK_COLORS.green).toBe('#10b981')
  })

  it('red matches error color', () => {
    expect(STAT_BLOCK_COLORS.red).toBe('#ef4444')
  })
})
