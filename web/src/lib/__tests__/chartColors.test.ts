import { describe, expect, it } from 'vitest'
import {
  AMBER_500,
  BLUE_500,
  CLUSTER_CHART_PALETTE,
  CYAN_500,
  getChartColor,
  getChartColorByName,
  GREEN_500,
  PURPLE_500,
  PURPLE_600,
  RED_500,
} from '../theme/chartColors'

const TOTAL_CHART_COLORS = CLUSTER_CHART_PALETTE.length

describe('getChartColor', () => {
  it('returns palette color for index 1', () => {
    expect(getChartColor(1)).toBe(PURPLE_600)
  })

  it('wraps around for indices past the palette size', () => {
    expect(getChartColor(TOTAL_CHART_COLORS + 1)).toBe(getChartColor(1))
  })

  it('wraps around for index 0', () => {
    expect(getChartColor(0)).toBe(CLUSTER_CHART_PALETTE[TOTAL_CHART_COLORS - 1])
  })

  it('returns the correct palette values for the first seven slots', () => {
    const expectedColors: Record<number, string> = {
      1: PURPLE_600,
      2: BLUE_500,
      3: GREEN_500,
      4: AMBER_500,
      5: RED_500,
      6: PURPLE_500,
      7: CYAN_500,
    }

    for (const [index, color] of Object.entries(expectedColors)) {
      expect(getChartColor(Number(index))).toBe(color)
    }
  })

  it('handles large index values via modular wrapping', () => {
    const LARGE_INDEX = 100
    const wrappedIndex = ((LARGE_INDEX - 1) % TOTAL_CHART_COLORS) + 1
    expect(getChartColor(LARGE_INDEX)).toBe(getChartColor(wrappedIndex))
  })

  it('handles negative indices via modular arithmetic', () => {
    expect(getChartColor(-1)).toBe(CLUSTER_CHART_PALETTE[TOTAL_CHART_COLORS - 2])
  })

  it('all palette colors are unique', () => {
    const colors = new Set(CLUSTER_CHART_PALETTE)
    expect(colors.size).toBe(TOTAL_CHART_COLORS)
  })

  it('all palette colors are valid hex codes', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i
    for (const color of CLUSTER_CHART_PALETTE) {
      expect(color).toMatch(hexPattern)
    }
  })
})

describe('getChartColorByName', () => {
  it('returns colors for semantic names', () => {
    expect(getChartColorByName('primary')).toBe(PURPLE_600)
    expect(getChartColorByName('info')).toBe(BLUE_500)
    expect(getChartColorByName('success')).toBe(GREEN_500)
    expect(getChartColorByName('warning')).toBe(AMBER_500)
    expect(getChartColorByName('error')).toBe(RED_500)
  })

  it('returns different colors for different names', () => {
    expect(getChartColorByName('success')).not.toBe(getChartColorByName('error'))
  })

  it('maps semantic colors to the same palette entries', () => {
    expect(getChartColorByName('primary')).toBe(getChartColor(1))
    expect(getChartColorByName('info')).toBe(getChartColor(2))
    expect(getChartColorByName('success')).toBe(getChartColor(3))
    expect(getChartColorByName('warning')).toBe(getChartColor(4))
    expect(getChartColorByName('error')).toBe(getChartColor(5))
  })

  it('all semantic colors are valid hex codes', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i
    const names: Array<'primary' | 'info' | 'success' | 'warning' | 'error'> = [
      'primary', 'info', 'success', 'warning', 'error',
    ]
    for (const name of names) {
      expect(getChartColorByName(name)).toMatch(hexPattern)
    }
  })
})
