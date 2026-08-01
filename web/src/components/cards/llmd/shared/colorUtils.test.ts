import { describe, expect, it } from 'vitest'

import { getHorseshoeColor, getLoadColors } from './colorUtils'

describe('getLoadColors', () => {
  describe('critical band (>= 90)', () => {
    it('returns critical palette at exactly 90', () => {
      expect(getLoadColors(90)).toEqual({ start: '#ef4444', end: '#f87171', glow: '#ef4444' })
    })

    it('returns critical palette above 90', () => {
      expect(getLoadColors(95)).toEqual({ start: '#ef4444', end: '#f87171', glow: '#ef4444' })
    })

    it('returns critical palette at 100', () => {
      expect(getLoadColors(100)).toEqual({ start: '#ef4444', end: '#f87171', glow: '#ef4444' })
    })

    it('returns critical palette for absurdly large values', () => {
      expect(getLoadColors(1_000_000)).toEqual({ start: '#ef4444', end: '#f87171', glow: '#ef4444' })
    })
  })

  describe('high band (70 – 89.99…)', () => {
    it('returns high palette at exactly 70', () => {
      expect(getLoadColors(70)).toEqual({ start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' })
    })

    it('returns high palette at 89.99', () => {
      expect(getLoadColors(89.99)).toEqual({ start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' })
    })

    it('returns high palette at 80', () => {
      expect(getLoadColors(80)).toEqual({ start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' })
    })
  })

  describe('medium band (50 – 69.99…)', () => {
    it('returns medium palette at exactly 50', () => {
      expect(getLoadColors(50)).toEqual({ start: '#eab308', end: '#facc15', glow: '#eab308' })
    })

    it('returns medium palette at 69.99', () => {
      expect(getLoadColors(69.99)).toEqual({ start: '#eab308', end: '#facc15', glow: '#eab308' })
    })

    it('returns medium palette at 60', () => {
      expect(getLoadColors(60)).toEqual({ start: '#eab308', end: '#facc15', glow: '#eab308' })
    })
  })

  describe('low band (< 50)', () => {
    it('returns low palette at 49.99', () => {
      expect(getLoadColors(49.99)).toEqual({ start: '#22c55e', end: '#4ade80', glow: '#22c55e' })
    })

    it('returns low palette at 0', () => {
      expect(getLoadColors(0)).toEqual({ start: '#22c55e', end: '#4ade80', glow: '#22c55e' })
    })

    it('returns low palette for negative values', () => {
      expect(getLoadColors(-10)).toEqual({ start: '#22c55e', end: '#4ade80', glow: '#22c55e' })
    })

    it('returns low palette at 25', () => {
      expect(getLoadColors(25)).toEqual({ start: '#22c55e', end: '#4ade80', glow: '#22c55e' })
    })
  })

  it('returns a stable object reference for repeated calls in the same band', () => {
    // Module-level constants are returned by reference; documenting this so
    // callers know not to mutate the result.
    expect(getLoadColors(95)).toBe(getLoadColors(99))
    expect(getLoadColors(70)).toBe(getLoadColors(85))
    expect(getLoadColors(50)).toBe(getLoadColors(65))
    expect(getLoadColors(0)).toBe(getLoadColors(49))
  })
})

describe('getHorseshoeColor', () => {
  it('returns critical red at exactly 90', () => {
    expect(getHorseshoeColor(90)).toBe('#ef4444')
  })

  it('returns critical red above 90', () => {
    expect(getHorseshoeColor(99)).toBe('#ef4444')
  })

  it('returns high amber at exactly 70', () => {
    expect(getHorseshoeColor(70)).toBe('#f59e0b')
  })

  it('returns high amber at 89.99', () => {
    expect(getHorseshoeColor(89.99)).toBe('#f59e0b')
  })

  it('returns medium yellow at exactly 50', () => {
    expect(getHorseshoeColor(50)).toBe('#eab308')
  })

  it('returns medium yellow at 69.99', () => {
    expect(getHorseshoeColor(69.99)).toBe('#eab308')
  })

  it('returns low green at 49.99', () => {
    expect(getHorseshoeColor(49.99)).toBe('#22c55e')
  })

  it('returns low green at 0', () => {
    expect(getHorseshoeColor(0)).toBe('#22c55e')
  })

  it('returns low green for negative values', () => {
    expect(getHorseshoeColor(-5)).toBe('#22c55e')
  })

  it('color bands are consistent with getLoadColors.glow at boundaries', () => {
    for (const pct of [0, 25, 49.99, 50, 65, 69.99, 70, 85, 89.99, 90, 99, 100]) {
      expect(getHorseshoeColor(pct)).toBe(getLoadColors(pct).glow)
    }
  })
})
