import { describe, it, expect } from 'vitest'
import { getChartColor, getChartColors, getChartColorByName } from '../chartColors'

describe('getChartColor', () => {
  it('returns fallback color for index 1', () => {
    const color = getChartColor(1)
    expect(typeof color).toBe('string')
    expect(color.length).toBeGreaterThan(0)
  })

  it('wraps around for indices > 8', () => {
    const color9 = getChartColor(9)
    const color1 = getChartColor(1)
    expect(color9).toBe(color1) // 9 wraps to 1
  })

  it('wraps around for index 0', () => {
    const color = getChartColor(0)
    expect(typeof color).toBe('string')
  })

  it('returns different colors for different indices', () => {
    const color1 = getChartColor(1)
    const color2 = getChartColor(2)
    expect(color1).not.toBe(color2)
  })
})

describe('getChartColors', () => {
  it('returns array of correct length', () => {
    expect(getChartColors(3)).toHaveLength(3)
    expect(getChartColors(8)).toHaveLength(8)
  })

  it('returns empty array for 0', () => {
    expect(getChartColors(0)).toHaveLength(0)
  })

  it('returns valid color strings', () => {
    const colors = getChartColors(5)
    for (const c of colors) {
      expect(typeof c).toBe('string')
      expect(c.length).toBeGreaterThan(0)
    }
  })
})

describe('getChartColorByName', () => {
  it('returns colors for semantic names', () => {
    expect(typeof getChartColorByName('primary')).toBe('string')
    expect(typeof getChartColorByName('info')).toBe('string')
    expect(typeof getChartColorByName('success')).toBe('string')
    expect(typeof getChartColorByName('warning')).toBe('string')
    expect(typeof getChartColorByName('error')).toBe('string')
  })

  it('returns different colors for different names', () => {
    expect(getChartColorByName('success')).not.toBe(getChartColorByName('error'))
  })
})
