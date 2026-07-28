import { describe, expect, it } from 'vitest'

import { formatMemoryPromptStat, formatMemoryStat, formatStat, formatStorageStat } from './formatStats'

describe('formatStat', () => {
  describe('unavailable data', () => {
    it('returns "-" for undefined', () => {
      expect(formatStat(undefined)).toBe('-')
    })

    it('returns "-" for null', () => {
      expect(formatStat(null)).toBe('-')
    })

    it('returns "0" for zero by default', () => {
      expect(formatStat(0)).toBe('0')
    })

    it('returns "-" for zero when dashOnZero is true', () => {
      expect(formatStat(0, { dashOnZero: true })).toBe('-')
    })

    it('returns "0" for zero when dashOnZero is false', () => {
      expect(formatStat(0, { dashOnZero: false })).toBe('0')
    })
  })

  describe('negative clamping', () => {
    it('clamps negative numbers to 0', () => {
      expect(formatStat(-5)).toBe('0')
    })

    it('clamps large negative numbers to 0', () => {
      expect(formatStat(-1_000_000)).toBe('0')
    })

    it('applies suffix after clamping negatives', () => {
      expect(formatStat(-3, { suffix: '%' })).toBe('0%')
    })
  })

  describe('auto-scaling', () => {
    it('renders small integers as plain string', () => {
      expect(formatStat(42)).toBe('42')
    })

    it('renders 9999 without scaling', () => {
      expect(formatStat(9999)).toBe('9999')
    })

    it('scales values >= 10_000 to K', () => {
      expect(formatStat(10_000)).toBe('10.0K')
    })

    it('scales 25_500 to "25.5K"', () => {
      expect(formatStat(25_500)).toBe('25.5K')
    })

    it('scales values >= 1_000_000 to M', () => {
      expect(formatStat(1_000_000)).toBe('1.0M')
    })

    it('scales 2_750_000 to "2.8M"', () => {
      expect(formatStat(2_750_000)).toBe('2.8M')
    })
  })

  describe('suffix', () => {
    it('appends "%" suffix', () => {
      expect(formatStat(85, { suffix: '%' })).toBe('85%')
    })

    it('appends " GB" suffix', () => {
      expect(formatStat(16, { suffix: ' GB' })).toBe('16 GB')
    })

    it('appends suffix after auto-scaling', () => {
      expect(formatStat(12_000, { suffix: ' req' })).toBe('12.0K req')
    })

    it('appends suffix to "-" when unavailable', () => {
      // suffix is only applied to numeric formatting, not the "-" fallback
      expect(formatStat(undefined, { suffix: '%' })).toBe('-')
    })
  })

  describe('custom formatter', () => {
    it('uses custom formatter for non-negative value', () => {
      expect(formatStat(3.14159, { formatter: (n) => n.toFixed(2) })).toBe('3.14')
    })

    it('custom formatter receives clamped value (0 for negatives)', () => {
      expect(formatStat(-1, { formatter: (n) => `val:${n}` })).toBe('val:0')
    })

    it('custom formatter output combined with suffix', () => {
      expect(formatStat(50, { formatter: (n) => `${n}x`, suffix: '!' })).toBe('50x!')
    })

    it('custom formatter overrides auto-scaling', () => {
      expect(formatStat(5_000_000, { formatter: (n) => String(n) })).toBe('5000000')
    })
  })
})

describe('formatMemoryStat', () => {
  it('returns "-" for undefined', () => {
    expect(formatMemoryStat(undefined)).toBe('-')
  })

  it('returns "-" for null', () => {
    expect(formatMemoryStat(null)).toBe('-')
  })

  it('returns "-" when hasData is false', () => {
    expect(formatMemoryStat(100, false)).toBe('-')
  })

  it('returns "0 GB" for zero', () => {
    expect(formatMemoryStat(0)).toBe('0 GB')
  })

  it('clamps negative values to 0 and returns "0 GB"', () => {
    expect(formatMemoryStat(-5)).toBe('0 GB')
  })

  it('formats MB for values < 1 GB but >= 0.001', () => {
    expect(formatMemoryStat(0.5)).toBe('512 MB')
  })

  it('formats 0.001 GB as "1 MB"', () => {
    expect(formatMemoryStat(0.001)).toBe('1 MB')
  })

  it('formats sub-MB values as "0 GB"', () => {
    expect(formatMemoryStat(0.0005)).toBe('0 GB')
  })

  it('rounds GB values with Math.round', () => {
    expect(formatMemoryStat(15.7)).toBe('16 GB')
    expect(formatMemoryStat(15.4)).toBe('15 GB')
  })

  it('formats exactly 1 GB', () => {
    expect(formatMemoryStat(1)).toBe('1 GB')
  })

  it('formats TB values with one decimal', () => {
    expect(formatMemoryStat(1024)).toBe('1.0 TB')
    expect(formatMemoryStat(2560)).toBe('2.5 TB')
  })

  it('formats PB values with one decimal', () => {
    const oneGigabytePerPetabyte = 1024 * 1024
    expect(formatMemoryStat(oneGigabytePerPetabyte)).toBe('1.0 PB')
    expect(formatMemoryStat(oneGigabytePerPetabyte * 3.5)).toBe('3.5 PB')
  })
})

describe('formatMemoryPromptStat', () => {
  it('returns "0 GB" for undefined', () => {
    expect(formatMemoryPromptStat(undefined)).toBe('0 GB')
  })

  it('returns "0 GB" for null', () => {
    expect(formatMemoryPromptStat(null)).toBe('0 GB')
  })

  it('returns "0 GB" for zero', () => {
    expect(formatMemoryPromptStat(0)).toBe('0 GB')
  })

  it('clamps negative values to "0 GB"', () => {
    expect(formatMemoryPromptStat(-10)).toBe('0 GB')
  })

  it('formats MB for sub-GB values', () => {
    expect(formatMemoryPromptStat(0.25)).toBe('256 MB')
  })

  it('formats sub-MB values as "0 GB"', () => {
    expect(formatMemoryPromptStat(0.0001)).toBe('0 GB')
  })

  it('formats whole GB, trimming trailing zeros', () => {
    expect(formatMemoryPromptStat(2)).toBe('2 GB')
  })

  it('formats fractional GB with up to 2 decimals', () => {
    expect(formatMemoryPromptStat(2.5)).toBe('2.5 GB')
    expect(formatMemoryPromptStat(2.75)).toBe('2.75 GB')
  })

  it('trims trailing zeros in decimals', () => {
    expect(formatMemoryPromptStat(2.1)).toBe('2.1 GB')
    expect(formatMemoryPromptStat(2.5)).toBe('2.5 GB')
  })

  it('rounds beyond 2 decimals', () => {
    expect(formatMemoryPromptStat(2.756)).toBe('2.76 GB')
  })

  it('formats TB values with one decimal', () => {
    expect(formatMemoryPromptStat(1024)).toBe('1.0 TB')
    expect(formatMemoryPromptStat(2048)).toBe('2.0 TB')
  })

  it('formats PB values with one decimal', () => {
    const gbPerPB = 1024 * 1024
    expect(formatMemoryPromptStat(gbPerPB)).toBe('1.0 PB')
    expect(formatMemoryPromptStat(gbPerPB * 2)).toBe('2.0 PB')
  })
})

describe('formatStorageStat', () => {
  it('delegates to formatMemoryStat for undefined', () => {
    expect(formatStorageStat(undefined)).toBe('-')
  })

  it('delegates to formatMemoryStat for null', () => {
    expect(formatStorageStat(null)).toBe('-')
  })

  it('returns "-" when hasData is false', () => {
    expect(formatStorageStat(500, false)).toBe('-')
  })

  it('formats GB values identically to formatMemoryStat', () => {
    expect(formatStorageStat(100)).toBe('100 GB')
    expect(formatStorageStat(100.6)).toBe('101 GB')
  })

  it('formats TB values identically to formatMemoryStat', () => {
    expect(formatStorageStat(1024)).toBe('1.0 TB')
  })

  it('formats MB values identically to formatMemoryStat', () => {
    expect(formatStorageStat(0.5)).toBe('512 MB')
  })
})
