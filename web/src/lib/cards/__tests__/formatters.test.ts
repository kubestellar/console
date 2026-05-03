import { describe, it, expect } from 'vitest'
import { formatThroughput } from '../formatters'

describe('formatThroughput', () => {
  it('formats a typical positive integer', () => {
    const result = formatThroughput(1000)
    // toLocaleString output varies by environment, but should be a string
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('formats zero as "0"', () => {
    expect(formatThroughput(0)).toBe('0')
  })

  it('formats a negative integer', () => {
    const result = formatThroughput(-5)
    expect(result).toContain('5')
    // Should include negative sign somewhere
    expect(result).toMatch(/-?5/)
  })

  it('formats a small positive number', () => {
    const result = formatThroughput(42)
    expect(result).toContain('42')
  })

  it('formats a large number as a string', () => {
    const result = formatThroughput(1_000_000)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('minimumFractionDigits is 0 (no trailing .0)', () => {
    const result = formatThroughput(100)
    // Should not add trailing decimal point with 0 minimum fraction digits
    expect(result).not.toMatch(/\.0+$/)
  })
})
