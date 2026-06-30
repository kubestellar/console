import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTokenAlertLevel, __testables, type TokenUsageByCategory } from '../useTokenUsage'

const {
  getUsagePeriodKey,
  getNextResetDate,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
} = __testables

// ---------------------------------------------------------------------------
// getTokenAlertLevel
// ---------------------------------------------------------------------------

describe('getTokenAlertLevel', () => {
  it('returns normal when limit is 0', () => {
    expect(getTokenAlertLevel({ used: 100, limit: 0, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('normal')
  })

  it('returns normal when limit is negative', () => {
    expect(getTokenAlertLevel({ used: 100, limit: -1, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('normal')
  })

  it('returns normal when usage is below warning threshold', () => {
    expect(getTokenAlertLevel({ used: 50, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('normal')
  })

  it('returns warning when usage equals warning threshold', () => {
    expect(getTokenAlertLevel({ used: 70, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('warning')
  })

  it('returns warning when usage is between warning and critical', () => {
    expect(getTokenAlertLevel({ used: 80, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('warning')
  })

  it('returns critical when usage equals critical threshold', () => {
    expect(getTokenAlertLevel({ used: 90, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('critical')
  })

  it('returns critical when usage is between critical and stop', () => {
    expect(getTokenAlertLevel({ used: 95, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('critical')
  })

  it('returns stopped when usage equals stop threshold', () => {
    expect(getTokenAlertLevel({ used: 100, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('stopped')
  })

  it('returns stopped when usage exceeds stop threshold', () => {
    expect(getTokenAlertLevel({ used: 150, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('stopped')
  })

  it('uses default stop threshold when stopThreshold is 0', () => {
    // When stopThreshold is 0, falls back to DEFAULT_SETTINGS.stopThreshold (1.0)
    expect(getTokenAlertLevel({ used: 100, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 0 })).toBe('stopped')
  })

  it('uses default stop threshold when stopThreshold is negative', () => {
    expect(getTokenAlertLevel({ used: 100, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: -1 })).toBe('stopped')
  })

  it('handles zero usage correctly', () => {
    expect(getTokenAlertLevel({ used: 0, limit: 100, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0 })).toBe('normal')
  })
})

// ---------------------------------------------------------------------------
// getUsagePeriodKey
// ---------------------------------------------------------------------------

describe('getUsagePeriodKey', () => {
  it('returns a date string for the given date', () => {
    const date = new Date('2025-06-15T10:30:00Z')
    const key = getUsagePeriodKey(date)
    // Should be formatted as YYYY-MM-DD in local time (en-CA locale)
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns consistent results for the same date', () => {
    const date = new Date('2025-01-01T00:00:00Z')
    expect(getUsagePeriodKey(date)).toBe(getUsagePeriodKey(date))
  })

  it('returns different keys for different days', () => {
    const day1 = new Date('2025-06-15T12:00:00Z')
    const day2 = new Date('2025-06-16T12:00:00Z')
    expect(getUsagePeriodKey(day1)).not.toBe(getUsagePeriodKey(day2))
  })
})

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------

describe('Token usage constants', () => {
  it('MAX_SINGLE_DELTA_TOKENS is positive', () => {
    expect(MAX_SINGLE_DELTA_TOKENS).toBeGreaterThan(0)
    expect(MAX_SINGLE_DELTA_TOKENS).toBe(50_000)
  })

  it('MIN_STOP_THRESHOLD is a small positive fraction', () => {
    expect(MIN_STOP_THRESHOLD).toBeGreaterThan(0)
    expect(MIN_STOP_THRESHOLD).toBeLessThan(1)
    expect(MIN_STOP_THRESHOLD).toBe(0.01)
  })

  it('DEFAULT_SETTINGS has valid thresholds in ascending order', () => {
    expect(DEFAULT_SETTINGS.warningThreshold).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.criticalThreshold).toBeGreaterThan(DEFAULT_SETTINGS.warningThreshold)
    expect(DEFAULT_SETTINGS.stopThreshold).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.criticalThreshold)
    expect(DEFAULT_SETTINGS.limit).toBeGreaterThan(0)
  })

  it('DEFAULT_BY_CATEGORY has all categories at zero', () => {
    expect(DEFAULT_BY_CATEGORY.missions).toBe(0)
    expect(DEFAULT_BY_CATEGORY.diagnose).toBe(0)
    expect(DEFAULT_BY_CATEGORY.insights).toBe(0)
    expect(DEFAULT_BY_CATEGORY.predictions).toBe(0)
    expect(DEFAULT_BY_CATEGORY.other).toBe(0)
  })

  it('DEMO_TOKEN_USAGE is a positive number', () => {
    expect(DEMO_TOKEN_USAGE).toBeGreaterThan(0)
  })

  it('DEMO_BY_CATEGORY sums approximately to DEMO_TOKEN_USAGE', () => {
    const sum = DEMO_BY_CATEGORY.missions + DEMO_BY_CATEGORY.diagnose +
      DEMO_BY_CATEGORY.insights + DEMO_BY_CATEGORY.predictions + DEMO_BY_CATEGORY.other
    expect(sum).toBe(DEMO_TOKEN_USAGE)
  })
})

// ---------------------------------------------------------------------------
// getNextResetDate
// ---------------------------------------------------------------------------

describe('getNextResetDate', () => {
  it('returns a valid ISO date string', () => {
    const result = getNextResetDate()
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toISOString()).toBe(result)
  })

  it('returns a date in the future (next day)', () => {
    const result = new Date(getNextResetDate())
    const now = new Date()
    // Reset date should be today or later (next calendar day at midnight)
    expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime() - 86400000) // within 24h
  })
})
