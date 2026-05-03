import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatBytes,
  formatK8sMemory,
  formatK8sStorage,
  formatRelativeTime,
  formatProwDuration,
  formatStatNumber,
  formatPercent,
  formatCurrency,
  formatTimeAgo,
  createCardSyncFormatter,
} from '../formatters'

// ---------------------------------------------------------------------------
// formatProwDuration
// ---------------------------------------------------------------------------
describe('formatProwDuration', () => {
  it('returns seconds for short durations', () => {
    const start = '2026-01-01T00:00:00Z'
    const end = '2026-01-01T00:00:45Z'
    expect(formatProwDuration(start, end)).toBe('45s')
  })

  it('returns 0s for identical timestamps', () => {
    const ts = '2026-01-01T00:00:00Z'
    expect(formatProwDuration(ts, ts)).toBe('0s')
  })

  it('returns minutes for medium durations', () => {
    const start = '2026-01-01T00:00:00Z'
    const end = '2026-01-01T00:07:30Z'
    expect(formatProwDuration(start, end)).toBe('7m')
  })

  it('returns hours and minutes for long durations', () => {
    const start = '2026-01-01T00:00:00Z'
    const end = '2026-01-01T02:15:00Z'
    expect(formatProwDuration(start, end)).toBe('2h 15m')
  })

  it('returns hours with 0 remaining minutes', () => {
    const start = '2026-01-01T00:00:00Z'
    const end = '2026-01-01T03:00:00Z'
    expect(formatProwDuration(start, end)).toBe('3h 0m')
  })

  it('returns dash for negative duration', () => {
    const start = '2026-01-01T01:00:00Z'
    const end = '2026-01-01T00:00:00Z'
    expect(formatProwDuration(start, end)).toBe('-')
  })

  it('uses current time when endTime is omitted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    expect(formatProwDuration('2026-01-01T00:00:00Z')).toBe('5m')
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------
describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('returns 0 B for negative', () => {
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('returns 0 B for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B')
  })

  it('returns 0 B for Infinity', () => {
    expect(formatBytes(Infinity)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })

  it('formats with decimals (number shorthand)', () => {
    expect(formatBytes(1536, 1)).toBe('1.5 KB')
  })

  it('formats whole numbers without decimals', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })

  it('formats with options object', () => {
    expect(formatBytes(1536, { decimals: 2 })).toBe('1.50 KB')
  })

  it('formats with binary units (IEC)', () => {
    expect(formatBytes(1024, { binary: true })).toBe('1 KiB')
    expect(formatBytes(1536, { binary: true })).toBe('1.5 KiB')
    expect(formatBytes(1048576, { binary: true })).toBe('1 MiB')
    expect(formatBytes(1073741824, { binary: true })).toBe('1 GiB')
  })

  it('uses custom zeroLabel', () => {
    expect(formatBytes(0, { zeroLabel: '—' })).toBe('—')
    expect(formatBytes(-1, { zeroLabel: 'N/A' })).toBe('N/A')
    expect(formatBytes(NaN, { zeroLabel: 'none' })).toBe('none')
  })

  it('formats terabytes', () => {
    expect(formatBytes(1024 ** 4)).toBe('1 TB')
  })

  it('formats petabytes', () => {
    expect(formatBytes(1024 ** 5)).toBe('1 PB')
  })
})

// ---------------------------------------------------------------------------
// formatK8sMemory — exercises parseK8sQuantity indirectly
// ---------------------------------------------------------------------------
describe('formatK8sMemory', () => {
  it('returns dash for empty string', () => {
    expect(formatK8sMemory('')).toBe('-')
  })

  it('formats Ki values', () => {
    const result = formatK8sMemory('16077540Ki')
    expect(result).toContain('GB')
  })

  it('formats Gi values', () => {
    expect(formatK8sMemory('4Gi')).toContain('GB')
  })

  it('formats Mi values', () => {
    expect(formatK8sMemory('512Mi')).toContain('MB')
  })

  it('formats plain number (bytes)', () => {
    expect(formatK8sMemory('1024')).toBe('1 KB')
  })

  // Decimal units
  it('formats K (decimal kilo) values', () => {
    // 1000K = 1,000,000 bytes ≈ ~976.6 KB
    const result = formatK8sMemory('1000K')
    expect(result).toContain('KB')
  })

  it('formats M (decimal mega) values', () => {
    // 500M = 500,000,000 bytes ≈ ~476.8 MB
    const result = formatK8sMemory('500M')
    expect(result).toContain('MB')
  })

  it('formats G (decimal giga) values', () => {
    // 2G = 2,000,000,000 bytes ≈ ~1.9 GB
    const result = formatK8sMemory('2G')
    expect(result).toContain('GB')
  })

  it('formats T (decimal tera) values', () => {
    const result = formatK8sMemory('1T')
    expect(result).toContain('GB')
  })

  it('formats P (decimal peta) values', () => {
    const result = formatK8sMemory('1P')
    expect(result).toContain('TB')
  })

  it('formats Ti values', () => {
    const result = formatK8sMemory('1Ti')
    expect(result).toContain('TB')
  })

  it('formats Pi values', () => {
    const result = formatK8sMemory('1Pi')
    expect(result).toContain('PB')
  })

  it('formats decimal values like 1.5Gi', () => {
    const result = formatK8sMemory('1.5Gi')
    expect(result).toContain('GB')
  })

  it('handles non-matching strings gracefully', () => {
    // Non-numeric string — parseInt returns NaN, falls to 0
    const result = formatK8sMemory('abc')
    expect(result).toBe('0 B')
  })

  it('handles numeric-only string without unit', () => {
    // parseK8sQuantity regex matches with empty unit
    expect(formatK8sMemory('2048')).toBe('2 KB')
  })
})

// ---------------------------------------------------------------------------
// formatK8sStorage
// ---------------------------------------------------------------------------
describe('formatK8sStorage', () => {
  it('returns dash for empty string', () => {
    expect(formatK8sStorage('')).toBe('-')
  })

  it('formats storage values', () => {
    expect(formatK8sStorage('100Gi')).toContain('GB')
  })

  it('formats decimal units', () => {
    expect(formatK8sStorage('500G')).toContain('GB')
  })

  it('formats plain number', () => {
    expect(formatK8sStorage('4096')).toBe('4 KB')
  })
})

// ---------------------------------------------------------------------------
// formatStatNumber
// ---------------------------------------------------------------------------
describe('formatStatNumber', () => {
  it('returns raw number for values below 1000', () => {
    expect(formatStatNumber(0)).toBe('0')
    expect(formatStatNumber(999)).toBe('999')
    expect(formatStatNumber(42)).toBe('42')
  })

  it('formats thousands', () => {
    expect(formatStatNumber(1000)).toBe('1.0K')
    expect(formatStatNumber(1234)).toBe('1.2K')
    expect(formatStatNumber(5600)).toBe('5.6K')
    expect(formatStatNumber(999999)).toBe('1000.0K')
  })

  it('formats millions', () => {
    expect(formatStatNumber(1000000)).toBe('1.0M')
    expect(formatStatNumber(5600000)).toBe('5.6M')
    expect(formatStatNumber(123456789)).toBe('123.5M')
  })

  it('formats billions', () => {
    expect(formatStatNumber(1000000000)).toBe('1.0B')
    expect(formatStatNumber(7890000000)).toBe('7.9B')
  })

  it('handles negative values', () => {
    expect(formatStatNumber(-5)).toBe('-5')
    expect(formatStatNumber(-1500)).toBe('-1.5K')
    expect(formatStatNumber(-2000000)).toBe('-2.0M')
    expect(formatStatNumber(-3000000000)).toBe('-3.0B')
  })
})

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
describe('formatPercent', () => {
  it('rounds and appends %', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(50)).toBe('50%')
    expect(formatPercent(100)).toBe('100%')
  })

  it('rounds fractional values', () => {
    expect(formatPercent(33.3)).toBe('33%')
    expect(formatPercent(66.7)).toBe('67%')
    expect(formatPercent(99.5)).toBe('100%')
    expect(formatPercent(0.4)).toBe('0%')
  })

  it('handles negative values', () => {
    expect(formatPercent(-10)).toBe('-10%')
  })

  it('handles values above 100', () => {
    expect(formatPercent(150)).toBe('150%')
  })
})

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats small amounts with 2 decimal places', () => {
    expect(formatCurrency(0)).toBe('$0.00')
    expect(formatCurrency(5)).toBe('$5.00')
    expect(formatCurrency(9.99)).toBe('$9.99')
    expect(formatCurrency(999.5)).toBe('$999.50')
  })

  it('formats thousands', () => {
    expect(formatCurrency(1000)).toBe('$1.0K')
    expect(formatCurrency(2500)).toBe('$2.5K')
    expect(formatCurrency(999999)).toBe('$1000.0K')
  })

  it('formats millions', () => {
    expect(formatCurrency(1000000)).toBe('$1.0M')
    expect(formatCurrency(5600000)).toBe('$5.6M')
  })
})

// ---------------------------------------------------------------------------
// formatTimeAgo (comprehensive — replaces older formatRelativeTime tests)
// ---------------------------------------------------------------------------
describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent timestamps', () => {
    expect(formatTimeAgo('2026-03-31T11:59:45Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(formatTimeAgo('2026-03-31T11:55:00Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(formatTimeAgo('2026-03-31T09:00:00Z')).toBe('3h ago')
  })

  it('returns days ago (non-extended)', () => {
    expect(formatTimeAgo('2026-03-29T12:00:00Z')).toBe('2d ago')
  })

  it('returns "just now" for invalid date', () => {
    expect(formatTimeAgo('not-a-date')).toBe('just now')
  })

  it('returns "just now" for future date (default)', () => {
    expect(formatTimeAgo('2026-04-01T12:00:00Z')).toBe('just now')
  })

  // compact mode
  it('returns "now" for recent timestamps in compact mode', () => {
    expect(formatTimeAgo('2026-03-31T11:59:45Z', { compact: true })).toBe('now')
  })

  it('omits " ago" suffix in compact mode', () => {
    expect(formatTimeAgo('2026-03-31T11:55:00Z', { compact: true })).toBe('5m')
    expect(formatTimeAgo('2026-03-31T09:00:00Z', { compact: true })).toBe('3h')
    expect(formatTimeAgo('2026-03-29T12:00:00Z', { compact: true })).toBe('2d')
  })

  it('returns "now" for future date in compact mode', () => {
    expect(formatTimeAgo('2026-04-01T12:00:00Z', { compact: true })).toBe('now')
  })

  it('returns "now" for invalid date in compact mode', () => {
    expect(formatTimeAgo('garbage', { compact: true })).toBe('now')
  })

  // extended mode
  it('returns days in extended mode for < 1 month', () => {
    expect(formatTimeAgo('2026-03-21T12:00:00Z', { extended: true })).toBe('10d ago')
  })

  it('returns months in extended mode for < 1 year', () => {
    // 90 days ago ≈ 3 months
    expect(formatTimeAgo('2025-12-31T12:00:00Z', { extended: true })).toBe('3mo ago')
  })

  it('returns years in extended mode for >= 1 year', () => {
    expect(formatTimeAgo('2024-03-31T12:00:00Z', { extended: true })).toBe('2y ago')
  })

  it('returns large day count in non-extended mode (no months/years)', () => {
    // 400 days ago — non-extended just shows days
    const result = formatTimeAgo('2025-02-25T12:00:00Z', { extended: false })
    expect(result).toMatch(/\d+d ago/)
  })

  // custom invalidLabel
  it('uses custom invalidLabel', () => {
    expect(formatTimeAgo('invalid', { invalidLabel: 'unknown' })).toBe('unknown')
  })

  // accepts Date object
  it('accepts a Date object', () => {
    const fiveMinAgo = new Date('2026-03-31T11:55:00Z')
    expect(formatTimeAgo(fiveMinAgo)).toBe('5m ago')
  })

  // accepts epoch number
  it('accepts an epoch millisecond number', () => {
    const epochMs = new Date('2026-03-31T09:00:00Z').getTime()
    expect(formatTimeAgo(epochMs)).toBe('3h ago')
  })
})

// ---------------------------------------------------------------------------
// formatRelativeTime (deprecated alias)
// ---------------------------------------------------------------------------
describe('formatRelativeTime (deprecated alias)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns just now for recent timestamps', () => {
    expect(formatRelativeTime('2026-03-31T11:59:45Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(formatRelativeTime('2026-03-31T11:55:00Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(formatRelativeTime('2026-03-31T09:00:00Z')).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(formatRelativeTime('2026-03-29T12:00:00Z')).toBe('2d ago')
  })

  it('returns just now for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('just now')
  })

  it('returns just now for future date', () => {
    expect(formatRelativeTime('2026-04-01T12:00:00Z')).toBe('just now')
  })
})

// ---------------------------------------------------------------------------
// createCardSyncFormatter
// ---------------------------------------------------------------------------
describe('createCardSyncFormatter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls t with justNow key for recent timestamps (string prefix)', () => {
    const t = vi.fn((key: string, _opts?: Record<string, unknown>) => key)
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('2026-03-31T11:59:50Z')).toBe('myCard.syncedJustNow')
  })

  it('calls t with minutesAgo key and count', () => {
    const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${opts.count}` : key,
    )
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('2026-03-31T11:55:00Z')).toBe('myCard.syncedMinutesAgo:5')
  })

  it('calls t with hoursAgo key and count', () => {
    const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${opts.count}` : key,
    )
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('2026-03-31T09:00:00Z')).toBe('myCard.syncedHoursAgo:3')
  })

  it('calls t with daysAgo key and count', () => {
    const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${opts.count}` : key,
    )
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('2026-03-29T12:00:00Z')).toBe('myCard.syncedDaysAgo:2')
  })

  it('returns justNow for empty string', () => {
    const t = vi.fn((key: string) => key)
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('')).toBe('myCard.syncedJustNow')
  })

  it('returns justNow for invalid date string', () => {
    const t = vi.fn((key: string) => key)
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('not-valid')).toBe('myCard.syncedJustNow')
  })

  it('returns justNow for future date', () => {
    const t = vi.fn((key: string) => key)
    const format = createCardSyncFormatter(t as never, 'myCard')
    expect(format('2026-04-01T12:00:00Z')).toBe('myCard.syncedJustNow')
  })

  it('accepts custom CardSyncKeys object', () => {
    const t = vi.fn((key: string) => key)
    const customKeys = {
      justNow: 'thanosStatus.justNow',
      minutesAgo: 'thanosStatus.minutesAgo',
      hoursAgo: 'thanosStatus.hoursAgo',
      daysAgo: 'thanosStatus.daysAgo',
    }
    const format = createCardSyncFormatter(t as never, customKeys)
    expect(format('2026-03-31T11:59:50Z')).toBe('thanosStatus.justNow')
  })
})
