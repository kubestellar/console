import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getChartColor, getChartColorByName } from '../chartColors'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

describe('chartColors (CSS variable accessor)', () => {
  beforeEach(() => {
    // Ensure window/getComputedStyle are undefined so fallback path is exercised
    vi.stubGlobal('getComputedStyle', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getChartColor — fallback path', () => {
    it('returns a valid hex color for index 1', () => {
      expect(getChartColor(1)).toMatch(HEX_COLOR_RE)
    })

    it('returns expected fallback values for indices 1–8', () => {
      const expected: Record<number, string> = {
        1: '#9333ea',
        2: '#3b82f6',
        3: '#10b981',
        4: '#f59e0b',
        5: '#ef4444',
        6: '#06b6d4',
        7: '#8b5cf6',
        8: '#14b8a6',
      }
      for (const [idx, hex] of Object.entries(expected)) {
        expect(getChartColor(Number(idx))).toBe(hex)
      }
    })

    it('wraps index 9 back to index 1', () => {
      expect(getChartColor(9)).toBe(getChartColor(1))
    })

    it('wraps index 0 to index 8', () => {
      // ((0-1) % 8) + 1 = (-1 % 8) + 1 — JS modulo behavior
      const result = getChartColor(0)
      expect(result).toMatch(HEX_COLOR_RE)
    })

    it('handles large indices via modular wrapping', () => {
      expect(getChartColor(100)).toMatch(HEX_COLOR_RE)
      expect(getChartColor(16)).toBe(getChartColor(8))
    })

    it('all fallback colors are unique', () => {
      const colors = new Set(Array.from({ length: 8 }, (_, i) => getChartColor(i + 1)))
      expect(colors.size).toBe(8)
    })
  })

  describe('getChartColorByName', () => {
    it('returns valid hex for all semantic names', () => {
      const names: Array<'primary' | 'info' | 'success' | 'warning' | 'error'> = [
        'primary', 'info', 'success', 'warning', 'error',
      ]
      for (const name of names) {
        expect(getChartColorByName(name)).toMatch(HEX_COLOR_RE)
      }
    })

    it('maps semantic names to the correct indices', () => {
      expect(getChartColorByName('primary')).toBe(getChartColor(1))
      expect(getChartColorByName('info')).toBe(getChartColor(2))
      expect(getChartColorByName('success')).toBe(getChartColor(3))
      expect(getChartColorByName('warning')).toBe(getChartColor(4))
      expect(getChartColorByName('error')).toBe(getChartColor(5))
    })

    it('returns different colors for different semantic names', () => {
      expect(getChartColorByName('success')).not.toBe(getChartColorByName('error'))
      expect(getChartColorByName('primary')).not.toBe(getChartColorByName('warning'))
    })
  })

  describe('getChartColor — CSS variable path', () => {
    it('reads from CSS custom property when available', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue('#abcdef'),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const result = getChartColor(1)
      expect(result).toBe('#abcdef')
      expect(mockGetComputedStyle).toHaveBeenCalledWith(document.documentElement)
    })

    it('falls back to hardcoded value when CSS property is empty', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue(''),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const result = getChartColor(1)
      expect(result).toBe('#9333ea')
    })
  })
})
