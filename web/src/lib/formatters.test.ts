import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  formatProwDuration,
  formatBytes,
  formatStatNumber,
  formatPercent,
  formatCurrency,
  formatK8sMemory,
  formatK8sStorage,
  formatTimeAgo,
  formatRelativeTime,
  createCardSyncFormatter,
} from './formatters'

describe('formatProwDuration', () => {
  it('returns "-" when endTime precedes startTime', () => {
    expect(formatProwDuration('2024-01-01T00:01:00Z', '2024-01-01T00:00:00Z')).toBe('-')
  })

  it('formats sub-minute spans in seconds', () => {
    expect(formatProwDuration('2024-01-01T00:00:00Z', '2024-01-01T00:00:45Z')).toBe('45s')
  })

  it('formats minute-scale spans in minutes only', () => {
    expect(formatProwDuration('2024-01-01T00:00:00Z', '2024-01-01T00:05:30Z')).toBe('5m')
  })

  it('formats hour-scale spans as "Xh Ym"', () => {
    expect(formatProwDuration('2024-01-01T00:00:00Z', '2024-01-01T02:15:00Z')).toBe('2h 15m')
  })

  it('drops the minutes suffix when the remainder is zero', () => {
    expect(formatProwDuration('2024-01-01T00:00:00Z', '2024-01-01T03:00:00Z')).toBe('3h 0m')
  })

  it('uses "now" when endTime is omitted', () => {
    const now = new Date('2024-06-01T12:00:00Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      expect(formatProwDuration('2024-06-01T11:58:30Z')).toBe('1m')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('formatBytes', () => {
  it('returns the default zero label for 0, negative, or non-finite values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('honors a custom zero label', () => {
    expect(formatBytes(0, { zeroLabel: '—' })).toBe('—')
  })

  it('renders whole-number values without decimals', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })

  it('renders fractional values using the default of 1 decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('accepts a numeric second argument as the decimals shorthand', () => {
    expect(formatBytes(1536, 2)).toBe('1.50 KB')
  })

  it('uses IEC unit labels when binary=true', () => {
    expect(formatBytes(1536, { binary: true })).toBe('1.5 KiB')
    expect(formatBytes(1024 * 1024, { binary: true })).toBe('1 MiB')
  })

  it('scales up through GB and TB', () => {
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
    expect(formatBytes(1024 ** 4)).toBe('1 TB')
  })
})

describe('formatStatNumber', () => {
  it('returns raw integers below 1,000', () => {
    expect(formatStatNumber(0)).toBe('0')
    expect(formatStatNumber(999)).toBe('999')
  })

  it('compacts thousands as K', () => {
    expect(formatStatNumber(1_500)).toBe('1.5K')
  })

  it('compacts millions as M', () => {
    expect(formatStatNumber(2_400_000)).toBe('2.4M')
  })

  it('compacts billions as B', () => {
    expect(formatStatNumber(7_100_000_000)).toBe('7.1B')
  })

  it('handles negative values by magnitude', () => {
    expect(formatStatNumber(-1_500)).toBe('-1.5K')
    expect(formatStatNumber(-2_400_000)).toBe('-2.4M')
  })
})

describe('formatPercent', () => {
  it('rounds and appends %', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(42.4)).toBe('42%')
    expect(formatPercent(42.5)).toBe('43%')
    expect(formatPercent(100)).toBe('100%')
  })
})

describe('formatCurrency', () => {
  it('formats sub-thousand values with two decimals and a $ prefix', () => {
    expect(formatCurrency(0)).toBe('$0.00')
    expect(formatCurrency(9.5)).toBe('$9.50')
    expect(formatCurrency(999)).toBe('$999.00')
  })

  it('compacts thousands as $XK', () => {
    expect(formatCurrency(1_500)).toBe('$1.5K')
  })

  it('compacts millions as $XM', () => {
    expect(formatCurrency(2_400_000)).toBe('$2.4M')
  })
})

describe('formatK8sMemory / formatK8sStorage', () => {
  it('returns "-" for empty inputs', () => {
    expect(formatK8sMemory('')).toBe('-')
    expect(formatK8sStorage('')).toBe('-')
  })

  it('parses binary suffixes (Ki, Mi, Gi)', () => {
    expect(formatK8sMemory('1024Ki')).toBe('1 MB')
    expect(formatK8sMemory('4Gi')).toBe('4 GB')
    expect(formatK8sStorage('500Mi')).toBe('500 MB')
  })

  it('parses decimal suffixes (K, M, G)', () => {
    // 1_000_000 bytes → log/1024 → 1 → 1_000_000/1024 ≈ 976.5625 → "976.6 KB"
    expect(formatK8sMemory('1M')).toBe('976.6 KB')
  })

  it('treats an unrecognized value as a raw byte count when parseable', () => {
    expect(formatK8sMemory('2048')).toBe('2 KB')
  })

  it('falls back to 0 when the value is entirely unparseable', () => {
    expect(formatK8sMemory('not-a-quantity')).toBe('0 B')
  })
})

describe('formatTimeAgo', () => {
  const NOW = new Date('2024-06-01T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the default invalidLabel for NaN inputs', () => {
    expect(formatTimeAgo('not-a-date')).toBe('just now')
  })

  it('honors a custom invalidLabel', () => {
    expect(formatTimeAgo('not-a-date', { invalidLabel: 'unknown' })).toBe('unknown')
  })

  it('returns "now" in compact mode for invalid inputs', () => {
    expect(formatTimeAgo('not-a-date', { compact: true })).toBe('now')
  })

  it('returns "just now" for sub-minute diffs', () => {
    expect(formatTimeAgo(NOW - 30_000)).toBe('just now')
    expect(formatTimeAgo(NOW - 30_000, { compact: true })).toBe('now')
  })

  it('returns future timestamps as "just now"', () => {
    expect(formatTimeAgo(NOW + 60_000)).toBe('just now')
  })

  it('formats minute-scale diffs', () => {
    expect(formatTimeAgo(NOW - 5 * 60_000)).toBe('5m ago')
    expect(formatTimeAgo(NOW - 5 * 60_000, { compact: true })).toBe('5m')
  })

  it('formats hour-scale diffs', () => {
    expect(formatTimeAgo(NOW - 3 * 60 * 60_000)).toBe('3h ago')
  })

  it('formats day-scale diffs', () => {
    expect(formatTimeAgo(NOW - 2 * 24 * 60 * 60_000)).toBe('2d ago')
  })

  it('caps at days by default even for very old timestamps', () => {
    expect(formatTimeAgo(NOW - 400 * 24 * 60 * 60_000)).toBe('400d ago')
  })

  it('extends to months when extended=true', () => {
    const twoMonths = NOW - 60 * 24 * 60 * 60_000
    expect(formatTimeAgo(twoMonths, { extended: true })).toBe('2mo ago')
  })

  it('extends to years when extended=true and the diff exceeds a year', () => {
    const twoYears = NOW - 2 * 365 * 24 * 60 * 60_000
    expect(formatTimeAgo(twoYears, { extended: true })).toBe('2y ago')
  })

  it('accepts Date objects and ISO strings as input', () => {
    expect(formatTimeAgo(new Date(NOW - 5 * 60_000))).toBe('5m ago')
    expect(formatTimeAgo(new Date(NOW - 5 * 60_000).toISOString())).toBe('5m ago')
  })

  it('re-exports formatRelativeTime as an alias', () => {
    expect(formatRelativeTime).toBe(formatTimeAgo)
  })
})

describe('createCardSyncFormatter', () => {
  const NOW = new Date('2024-06-01T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
    opts && 'count' in opts ? `${key}(${opts.count})` : key,
  ) as unknown as Parameters<typeof createCardSyncFormatter>[0]

  it('derives the standard synced* key set from a prefix string', () => {
    const fmt = createCardSyncFormatter(t, 'thanos')
    expect(fmt(new Date(NOW - 30_000).toISOString())).toBe('thanos.syncedJustNow')
    expect(fmt(new Date(NOW - 5 * 60_000).toISOString())).toBe('thanos.syncedMinutesAgo(5)')
    expect(fmt(new Date(NOW - 3 * 60 * 60_000).toISOString())).toBe('thanos.syncedHoursAgo(3)')
    expect(fmt(new Date(NOW - 2 * 24 * 60 * 60_000).toISOString())).toBe('thanos.syncedDaysAgo(2)')
  })

  it('accepts an explicit CardSyncKeys map for non-standard cards', () => {
    const fmt = createCardSyncFormatter(t, {
      justNow: 'card.justNow',
      minutesAgo: 'card.minutesAgo',
      hoursAgo: 'card.hoursAgo',
      daysAgo: 'card.daysAgo',
    })
    expect(fmt(new Date(NOW - 5 * 60_000).toISOString())).toBe('card.minutesAgo(5)')
  })

  it('returns the justNow key for empty, invalid, or future timestamps', () => {
    const fmt = createCardSyncFormatter(t, 'thanos')
    expect(fmt('')).toBe('thanos.syncedJustNow')
    expect(fmt('not-a-date')).toBe('thanos.syncedJustNow')
    expect(fmt(new Date(NOW + 60_000).toISOString())).toBe('thanos.syncedJustNow')
  })
})
