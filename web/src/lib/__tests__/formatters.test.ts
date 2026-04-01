import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatBytes,
  formatGBSmart,
  formatK8sMemory,
  formatK8sStorage,
  formatRelativeTime,
  createRelativeTimeFormatter,
} from '../formatters'

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

  it('formats with decimals', () => {
    expect(formatBytes(1536, 1)).toBe('1.5 KB')
  })

  it('formats whole numbers without decimals', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })
})

describe('formatGBSmart', () => {
  it('returns 0 GB for zero', () => {
    expect(formatGBSmart(0)).toEqual({ display: '0 GB', tooltip: '0 GB' })
  })

  it('returns 0 GB for negative', () => {
    expect(formatGBSmart(-5)).toEqual({ display: '0 GB', tooltip: '0 GB' })
  })

  it('returns 0 GB for NaN', () => {
    expect(formatGBSmart(NaN)).toEqual({ display: '0 GB', tooltip: '0 GB' })
  })

  it('formats GB below 1024', () => {
    const result = formatGBSmart(256)
    expect(result.display).toBe('256 GB')
  })

  it('formats TB for values >= 1024 GB', () => {
    const result = formatGBSmart(2048)
    expect(result.display).toBe('2.0 TB')
    expect(result.tooltip).toContain('GB')
  })

  it('formats small GB values with decimals', () => {
    const result = formatGBSmart(5.5)
    expect(result.display).toBe('5.5 GB')
  })
})

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

  it('formats plain number', () => {
    expect(formatK8sMemory('1024')).toBe('1 KB')
  })
})

describe('formatK8sStorage', () => {
  it('returns dash for empty string', () => {
    expect(formatK8sStorage('')).toBe('-')
  })

  it('formats storage values', () => {
    expect(formatK8sStorage('100Gi')).toContain('GB')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns Just now for recent timestamps', () => {
    expect(formatRelativeTime('2026-03-31T11:59:45Z')).toBe('Just now')
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

  it('returns Just now for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('Just now')
  })

  it('returns Just now for future date', () => {
    expect(formatRelativeTime('2026-04-01T12:00:00Z')).toBe('Just now')
  })
})

describe('createRelativeTimeFormatter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the provided translation function', () => {
    const t = vi.fn().mockReturnValue('translated')
    const formatter = createRelativeTimeFormatter(t)

    formatter('2026-03-31T11:55:00Z')
    expect(t).toHaveBeenCalledWith('common.minutesAgo', { count: 5 })
  })

  it('returns justNow for recent timestamps', () => {
    const t = vi.fn().mockReturnValue('Just now')
    const formatter = createRelativeTimeFormatter(t)

    formatter('2026-03-31T11:59:50Z')
    expect(t).toHaveBeenCalledWith('common.justNow')
  })

  it('returns hoursAgo for hour-old timestamps', () => {
    const t = vi.fn().mockReturnValue('2 hours ago')
    const formatter = createRelativeTimeFormatter(t)

    formatter('2026-03-31T10:00:00Z')
    expect(t).toHaveBeenCalledWith('common.hoursAgo', { count: 2 })
  })

  it('returns daysAgo for day-old timestamps', () => {
    const t = vi.fn().mockReturnValue('3 days ago')
    const formatter = createRelativeTimeFormatter(t)

    formatter('2026-03-28T12:00:00Z')
    expect(t).toHaveBeenCalledWith('common.daysAgo', { count: 3 })
  })
})
