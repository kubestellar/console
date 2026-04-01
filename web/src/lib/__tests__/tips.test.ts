import { describe, it, expect, beforeEach } from 'vitest'
import { TIPS, getRandomTip } from '../tips'

describe('TIPS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(TIPS)).toBe(true)
    expect(TIPS.length).toBeGreaterThan(0)
    for (const tip of TIPS) {
      expect(typeof tip).toBe('string')
      expect(tip.length).toBeGreaterThan(0)
    }
  })
})

describe('getRandomTip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns a tip and index from the TIPS array', () => {
    const { tip, index } = getRandomTip()
    expect(TIPS[index]).toBe(tip)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(TIPS.length)
  })

  it('marks returned tip as seen', () => {
    const { index } = getRandomTip()
    const seen = JSON.parse(localStorage.getItem('ksc-seen-tips') || '[]')
    expect(seen).toContain(index)
  })

  it('does not repeat tips until all are seen', () => {
    const seenIndices = new Set<number>()
    // Get tips up to the total count
    for (let i = 0; i < TIPS.length; i++) {
      const { index } = getRandomTip()
      seenIndices.add(index)
    }
    // All tips should have been shown
    expect(seenIndices.size).toBe(TIPS.length)
  })

  it('resets after all tips are seen', () => {
    // Mark all tips as seen
    const allIndices = TIPS.map((_, i) => i)
    localStorage.setItem('ksc-seen-tips', JSON.stringify(allIndices))

    // Should still return a valid tip (reset cycle)
    const { tip, index } = getRandomTip()
    expect(TIPS[index]).toBe(tip)
  })
})
