import { describe, it, expect } from 'vitest'
import { formatStat, formatStatIfAvailable, formatMemoryStat, formatStorageStat, formatPercentStat } from '../formatStats'

describe('formatStat', () => {
  it('returns dash for undefined', () => {
    expect(formatStat(undefined)).toBe('-')
  })

  it('returns dash for null', () => {
    expect(formatStat(null)).toBe('-')
  })

  it('formats zero as 0', () => {
    expect(formatStat(0)).toBe('0')
  })

  it('returns dash for zero when dashOnZero is true', () => {
    expect(formatStat(0, { dashOnZero: true })).toBe('-')
  })

  it('clamps negative numbers to 0', () => {
    expect(formatStat(-5)).toBe('0')
  })

  it('formats normal numbers', () => {
    expect(formatStat(42)).toBe('42')
  })

  it('formats large numbers with K suffix', () => {
    expect(formatStat(15000)).toBe('15.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatStat(2500000)).toBe('2.5M')
  })

  it('does not use K for numbers under 10000', () => {
    expect(formatStat(9999)).toBe('9999')
  })

  it('appends suffix', () => {
    expect(formatStat(50, { suffix: '%' })).toBe('50%')
  })

  it('uses custom formatter', () => {
    expect(formatStat(3.14159, { formatter: (n) => n.toFixed(2) })).toBe('3.14')
  })

  it('uses custom formatter with suffix', () => {
    expect(formatStat(100, { formatter: (n) => String(n / 100), suffix: ' cores' })).toBe('1 cores')
  })
})

describe('formatStatIfAvailable', () => {
  it('returns dash when hasData is false', () => {
    expect(formatStatIfAvailable(42, false)).toBe('-')
  })

  it('formats normally when hasData is true', () => {
    expect(formatStatIfAvailable(42, true)).toBe('42')
  })

  it('returns dash for null even when hasData', () => {
    expect(formatStatIfAvailable(null, true)).toBe('-')
  })
})

describe('formatMemoryStat', () => {
  it('returns dash when hasData is false', () => {
    expect(formatMemoryStat(10, false)).toBe('-')
  })

  it('returns dash for undefined', () => {
    expect(formatMemoryStat(undefined)).toBe('-')
  })

  it('returns dash for null', () => {
    expect(formatMemoryStat(null)).toBe('-')
  })

  it('formats GB values', () => {
    expect(formatMemoryStat(8)).toBe('8 GB')
  })

  it('formats TB values', () => {
    expect(formatMemoryStat(2048)).toBe('2.0 TB')
  })

  it('formats PB values', () => {
    const PB_IN_GB = 1024 * 1024
    expect(formatMemoryStat(PB_IN_GB * 3)).toBe('3.0 PB')
  })

  it('formats MB values', () => {
    expect(formatMemoryStat(0.5)).toBe('512 MB')
  })

  it('returns 0 GB for very small values', () => {
    expect(formatMemoryStat(0.0001)).toBe('0 GB')
  })

  it('clamps negative to 0 GB', () => {
    expect(formatMemoryStat(-10)).toBe('0 GB')
  })
})

describe('formatStorageStat', () => {
  it('delegates to formatMemoryStat', () => {
    expect(formatStorageStat(8)).toBe('8 GB')
    expect(formatStorageStat(undefined)).toBe('-')
  })
})

describe('formatPercentStat', () => {
  it('returns dash when hasData is false', () => {
    expect(formatPercentStat(50, false)).toBe('-')
  })

  it('returns dash for undefined', () => {
    expect(formatPercentStat(undefined)).toBe('-')
  })

  it('returns dash for null', () => {
    expect(formatPercentStat(null)).toBe('-')
  })

  it('formats percentage', () => {
    expect(formatPercentStat(75.6)).toBe('76%')
  })

  it('clamps to 0-100 range', () => {
    expect(formatPercentStat(-10)).toBe('0%')
    expect(formatPercentStat(150)).toBe('100%')
  })

  it('formats zero percent', () => {
    expect(formatPercentStat(0)).toBe('0%')
  })
})
