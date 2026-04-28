import { describe, it, expect, vi } from 'vitest'
import { getChartColor, getChartColorByName } from '../chartColors'

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

  // --- New edge case tests ---

  it('returns the correct fallback hex values for all 8 indices', () => {
    const expectedFallbacks: Record<number, string> = {
      1: '#9333ea',
      2: '#3b82f6',
      3: '#10b981',
      4: '#f59e0b',
      5: '#ef4444',
      6: '#06b6d4',
      7: '#8b5cf6',
      8: '#14b8a6',
    }

    for (let i = 1; i <= 8; i++) {
      expect(getChartColor(i)).toBe(expectedFallbacks[i])
    }
  })

  it('wraps index 16 to index 8', () => {
    expect(getChartColor(16)).toBe(getChartColor(8))
  })

  it('wraps index 17 to index 1', () => {
    expect(getChartColor(17)).toBe(getChartColor(1))
  })

  it('handles large index values via modular wrapping', () => {
    const LARGE_INDEX = 100
    // ((100 - 1) % 8) + 1 = (99 % 8) + 1 = 3 + 1 = 4
    expect(getChartColor(LARGE_INDEX)).toBe(getChartColor(4))
  })

  it('handles negative indices via modular arithmetic', () => {
    // JavaScript % with negative: ((-1 - 1) % 8) + 1 = (-2 % 8) + 1 = -2 + 1 = -1
    // This tests the boundary — the function may return fallback[1] via || fallback[1]
    const color = getChartColor(-1)
    expect(typeof color).toBe('string')
    expect(color.length).toBeGreaterThan(0)
  })

  it('all 8 fallback colors are unique', () => {
    const colors = new Set<string>()
    for (let i = 1; i <= 8; i++) {
      colors.add(getChartColor(i))
    }
    const TOTAL_CHART_COLORS = 8
    expect(colors.size).toBe(TOTAL_CHART_COLORS)
  })

  it('all fallback colors are valid hex codes', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i
    for (let i = 1; i <= 8; i++) {
      expect(getChartColor(i)).toMatch(hexPattern)
    }
  })

  it('reads from CSS custom property when available', () => {
    const mockGetComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue('#ff00ff'),
    })
    vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

    const color = getChartColor(1)
    expect(color).toBe('#ff00ff')

    vi.unstubAllGlobals()
  })

  it('falls back when CSS custom property returns empty string', () => {
    const mockGetComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue(''),
    })
    vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

    const color = getChartColor(1)
    expect(color).toBe('#9333ea') // fallback for index 1

    vi.unstubAllGlobals()
  })

  it('falls back when CSS custom property returns whitespace only', () => {
    const mockGetComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue('   '),
    })
    vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

    const color = getChartColor(1)
    // After .trim(), whitespace becomes '', which is falsy
    expect(color).toBe('#9333ea')

    vi.unstubAllGlobals()
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

  // --- New edge case tests ---

  it('maps primary to chart color index 1 (purple)', () => {
    expect(getChartColorByName('primary')).toBe(getChartColor(1))
  })

  it('maps info to chart color index 2 (blue)', () => {
    expect(getChartColorByName('info')).toBe(getChartColor(2))
  })

  it('maps success to chart color index 3 (green)', () => {
    expect(getChartColorByName('success')).toBe(getChartColor(3))
  })

  it('maps warning to chart color index 4 (amber)', () => {
    expect(getChartColorByName('warning')).toBe(getChartColor(4))
  })

  it('maps error to chart color index 5 (red)', () => {
    expect(getChartColorByName('error')).toBe(getChartColor(5))
  })

  it('all five semantic names return distinct colors', () => {
    const names: Array<'primary' | 'info' | 'success' | 'warning' | 'error'> = [
      'primary', 'info', 'success', 'warning', 'error',
    ]
    const colors = names.map((n) => getChartColorByName(n))
    const unique = new Set(colors)
    expect(unique.size).toBe(names.length)
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
