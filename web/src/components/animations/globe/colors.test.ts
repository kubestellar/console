import { describe, it, expect } from 'vitest'
import { COLORS } from './colors'

describe('Globe COLORS', () => {
  it('has all required color properties', () => {
    expect(COLORS).toHaveProperty('primary')
    expect(COLORS).toHaveProperty('secondary')
    expect(COLORS).toHaveProperty('highlight')
    expect(COLORS).toHaveProperty('success')
    expect(COLORS).toHaveProperty('background')
    expect(COLORS).toHaveProperty('accent1')
    expect(COLORS).toHaveProperty('accent2')
    expect(COLORS).toHaveProperty('aiTraining')
    expect(COLORS).toHaveProperty('aiInference')
  })

  it('has valid hex color format for primary', () => {
    expect(COLORS.primary).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('has valid hex color format for all colors', () => {
    const hexColorRegex = /^#[0-9a-f]{6}$/i
    Object.values(COLORS).forEach((color) => {
      expect(color).toMatch(hexColorRegex)
    })
  })

  it('uses expected KubeStellar brand colors', () => {
    expect(COLORS.primary).toBe('#1a90ff')
    expect(COLORS.secondary).toBe('#6236FF')
  })

  it('has distinct colors for AI training and inference', () => {
    expect(COLORS.aiTraining).not.toBe(COLORS.aiInference)
  })

  it('has dark background color', () => {
    // Dark colors typically have low RGB values
    const bgColor = COLORS.background
    expect(bgColor).toBe('#0a0f1c')
  })

  it('contains exactly 9 color properties', () => {
    expect(Object.keys(COLORS)).toHaveLength(9)
  })

  it('all color values are uppercase hex format', () => {
    Object.values(COLORS).forEach((color) => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/)
    })
  })
})
