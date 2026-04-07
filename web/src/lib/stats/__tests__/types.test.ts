import { describe, it, expect } from 'vitest'
import {
  formatStatNumber,
  formatBytes,
  formatPercent,
  formatCurrency,
  formatDuration,
  formatValue,
} from '../types'

describe('formatStatNumber', () => {
  it('formats numbers below 1000 as-is', () => {
    expect(formatStatNumber(0)).toBe('0')
    expect(formatStatNumber(1)).toBe('1')
    expect(formatStatNumber(42)).toBe('42')
    expect(formatStatNumber(999)).toBe('999')
  })

  it('formats thousands with K suffix', () => {
    expect(formatStatNumber(1000)).toBe('1.0K')
    expect(formatStatNumber(1500)).toBe('1.5K')
    expect(formatStatNumber(10000)).toBe('10.0K')
    expect(formatStatNumber(999999)).toBe('1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatStatNumber(1000000)).toBe('1.0M')
    expect(formatStatNumber(2500000)).toBe('2.5M')
    expect(formatStatNumber(10000000)).toBe('10.0M')
  })
})

describe('formatBytes', () => {
  it('returns 0 B for zero and negative values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('returns 0 B for non-finite values', () => {
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 100)).toBe('100.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 256)).toBe('256.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatBytes(1024 * 1024 * 1024 * 8)).toBe('8.0 GB')
  })

  it('formats terabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB')
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 2.5)).toBe('2.5 TB')
  })
})

describe('formatPercent', () => {
  it('formats percentage values', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(50)).toBe('50%')
    expect(formatPercent(100)).toBe('100%')
  })

  it('rounds to nearest integer', () => {
    expect(formatPercent(33.3)).toBe('33%')
    expect(formatPercent(66.7)).toBe('67%')
    expect(formatPercent(99.9)).toBe('100%')
  })
})

describe('formatCurrency', () => {
  it('formats small values with 2 decimal places', () => {
    expect(formatCurrency(0)).toBe('$0.00')
    expect(formatCurrency(1.5)).toBe('$1.50')
    expect(formatCurrency(42.99)).toBe('$42.99')
    expect(formatCurrency(999)).toBe('$999.00')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCurrency(1000)).toBe('$1.0K')
    expect(formatCurrency(2500)).toBe('$2.5K')
    expect(formatCurrency(999999)).toBe('$1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatCurrency(1000000)).toBe('$1.0M')
    expect(formatCurrency(5500000)).toBe('$5.5M')
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(30)).toBe('30s')
    expect(formatDuration(59)).toBe('59s')
  })

  it('formats minutes', () => {
    expect(formatDuration(60)).toBe('1m')
    expect(formatDuration(120)).toBe('2m')
    expect(formatDuration(3599)).toBe('59m')
  })

  it('formats hours', () => {
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(7200)).toBe('2h')
    expect(formatDuration(86399)).toBe('23h')
  })

  it('formats days', () => {
    expect(formatDuration(86400)).toBe('1d')
    expect(formatDuration(172800)).toBe('2d')
    expect(formatDuration(604800)).toBe('7d')
  })
})

describe('formatValue', () => {
  it('formats with number type', () => {
    expect(formatValue(1500, 'number')).toBe('1.5K')
  })

  it('formats with percent type', () => {
    expect(formatValue(75, 'percent')).toBe('75%')
  })

  it('formats with bytes type', () => {
    expect(formatValue(1024, 'bytes')).toBe('1.0 KB')
  })

  it('formats with currency type', () => {
    expect(formatValue(2500, 'currency')).toBe('$2.5K')
  })

  it('formats with duration type', () => {
    expect(formatValue(3600, 'duration')).toBe('1h')
  })

  it('returns string representation for undefined format', () => {
    expect(formatValue(42)).toBe('42')
    expect(formatValue(42, undefined)).toBe('42')
  })
})
