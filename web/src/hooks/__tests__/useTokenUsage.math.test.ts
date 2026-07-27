import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getTokenAlertLevel,
  reconcileUsageBreakdown,
  getUsagePeriodKey,
  getNextResetDate,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
} from '../useTokenUsage.math'
import type { TokenUsage, TokenUsageByCategory } from '../useTokenUsage.types'

// Tests target the extracted pure-math module directly (see #21526).
// These tests guard the *module boundary* independently of the
// backward-compatible re-exports in useTokenUsage.ts, so future
// refactors that break the direct import path are caught immediately.

type AlertUsage = Pick<
  TokenUsage,
  'used' | 'limit' | 'warningThreshold' | 'criticalThreshold' | 'stopThreshold'
>

const makeUsage = (overrides: Partial<AlertUsage> = {}): AlertUsage => ({
  used: 0,
  limit: 1000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  stopThreshold: 1.0,
  ...overrides,
})

describe('getTokenAlertLevel', () => {
  it('returns "normal" when usage is below the warning threshold', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 500 }))).toBe('normal')
  })

  it('returns "normal" at exactly 0% usage', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 0 }))).toBe('normal')
  })

  it('returns "warning" at exactly the warning threshold', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 700 }))).toBe('warning')
  })

  it('returns "warning" between warning and critical thresholds', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 850 }))).toBe('warning')
  })

  it('returns "critical" at exactly the critical threshold', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 900 }))).toBe('critical')
  })

  it('returns "critical" between critical and stop thresholds', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 950 }))).toBe('critical')
  })

  it('returns "stopped" at exactly the stop threshold', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 1000 }))).toBe('stopped')
  })

  it('returns "stopped" above the stop threshold', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 2000 }))).toBe('stopped')
  })

  it('returns "normal" when limit is zero (division-by-zero guard)', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 1_000_000, limit: 0 }))).toBe('normal')
  })

  it('returns "normal" when limit is negative', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 100, limit: -1 }))).toBe('normal')
  })

  it('falls back to DEFAULT_SETTINGS.stopThreshold when stopThreshold is zero', () => {
    // used/limit = 1.0, and DEFAULT_SETTINGS.stopThreshold is 1.0 → stopped
    expect(getTokenAlertLevel(makeUsage({ used: 1000, stopThreshold: 0 }))).toBe('stopped')
  })

  it('falls back to DEFAULT_SETTINGS.stopThreshold when stopThreshold is negative', () => {
    expect(getTokenAlertLevel(makeUsage({ used: 500, stopThreshold: -0.5 }))).toBe('normal')
  })

  it('honors custom thresholds', () => {
    const custom = makeUsage({
      used: 300,
      limit: 1000,
      warningThreshold: 0.25,
      criticalThreshold: 0.5,
      stopThreshold: 0.75,
    })
    expect(getTokenAlertLevel(custom)).toBe('warning')
    expect(getTokenAlertLevel({ ...custom, used: 500 })).toBe('critical')
    expect(getTokenAlertLevel({ ...custom, used: 800 })).toBe('stopped')
  })
})

describe('reconcileUsageBreakdown', () => {
  const base: TokenUsageByCategory = {
    missions: 100,
    diagnose: 50,
    insights: 25,
    predictions: 25,
    other: 0,
  }

  it('returns a fresh DEFAULT_BY_CATEGORY when totalUsed is 0', () => {
    const out = reconcileUsageBreakdown(0, base)
    expect(out).toEqual(DEFAULT_BY_CATEGORY)
    // must be a copy, not the shared constant
    expect(out).not.toBe(DEFAULT_BY_CATEGORY)
  })

  it('assigns positive residual to "other"', () => {
    const out = reconcileUsageBreakdown(300, base)
    expect(out.other).toBe(100)
    expect(out.missions).toBe(100)
    expect(out.diagnose).toBe(50)
    expect(out.insights).toBe(25)
    expect(out.predictions).toBe(25)
  })

  it('clamps a negative residual to zero (never negative "other")', () => {
    const out = reconcileUsageBreakdown(50, base)
    expect(out.other).toBe(0)
  })

  it('returns the same object reference when "other" is already correct', () => {
    const input: TokenUsageByCategory = { ...base, other: 100 }
    const out = reconcileUsageBreakdown(300, input)
    expect(out).toBe(input)
  })

  it('returns a new object when "other" needs updating', () => {
    const out = reconcileUsageBreakdown(300, base)
    expect(out).not.toBe(base)
    expect(base.other).toBe(0) // did not mutate input
  })

  it('handles all-zero categories with positive total', () => {
    const empty: TokenUsageByCategory = { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: 0 }
    const out = reconcileUsageBreakdown(500, empty)
    expect(out.other).toBe(500)
  })
})

describe('getUsagePeriodKey', () => {
  it('formats "now" as an ISO-like YYYY-MM-DD string', () => {
    // en-CA locale with 2-digit month/day produces YYYY-MM-DD.
    const key = getUsagePeriodKey(new Date('2026-03-05T12:34:56Z'))
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is stable for the same local date', () => {
    const d1 = new Date(2026, 6, 15, 0, 0, 1)
    const d2 = new Date(2026, 6, 15, 23, 59, 59)
    expect(getUsagePeriodKey(d1)).toBe(getUsagePeriodKey(d2))
  })

  it('returns a value for the current date when called with no argument', () => {
    expect(getUsagePeriodKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('changes when the local calendar date changes', () => {
    const a = new Date(2026, 0, 1, 12, 0, 0)
    const b = new Date(2026, 0, 2, 12, 0, 0)
    expect(getUsagePeriodKey(a)).not.toBe(getUsagePeriodKey(b))
  })
})

describe('getNextResetDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a valid ISO 8601 timestamp string', () => {
    const iso = getNextResetDate()
    expect(() => new Date(iso).toISOString()).not.toThrow()
    expect(new Date(iso).toISOString()).toBe(iso)
  })

  it('is exactly one calendar day after "today" at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 14, 32, 11)) // 2026-06-15 14:32 local
    const result = new Date(getNextResetDate())
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(5) // still June
    expect(result.getDate()).toBe(16)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('rolls into the next month on month boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 10, 0, 0)) // Jan 31
    const result = new Date(getNextResetDate())
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(1)
  })

  it('rolls into the next year on year boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 23, 0, 0)) // Dec 31
    const result = new Date(getNextResetDate())
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(1)
  })

  it('is strictly greater than the current time', () => {
    const before = Date.now()
    const next = new Date(getNextResetDate()).getTime()
    expect(next).toBeGreaterThan(before)
  })
})

describe('exported constants', () => {
  it('DEFAULT_SETTINGS has sane threshold ordering', () => {
    expect(DEFAULT_SETTINGS.limit).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.warningThreshold).toBeLessThan(DEFAULT_SETTINGS.criticalThreshold)
    expect(DEFAULT_SETTINGS.criticalThreshold).toBeLessThan(DEFAULT_SETTINGS.stopThreshold + 1e-9)
    expect(DEFAULT_SETTINGS.stopThreshold).toBeLessThanOrEqual(1.0)
  })

  it('DEFAULT_BY_CATEGORY is all zeros across every category', () => {
    expect(DEFAULT_BY_CATEGORY).toEqual({
      missions: 0,
      diagnose: 0,
      insights: 0,
      predictions: 0,
      other: 0,
    })
  })

  it('DEMO_BY_CATEGORY category values sum to DEMO_TOKEN_USAGE', () => {
    const sum =
      DEMO_BY_CATEGORY.missions +
      DEMO_BY_CATEGORY.diagnose +
      DEMO_BY_CATEGORY.insights +
      DEMO_BY_CATEGORY.predictions +
      DEMO_BY_CATEGORY.other
    expect(sum).toBe(DEMO_TOKEN_USAGE)
  })

  it('has non-empty localStorage key names', () => {
    expect(LAST_KNOWN_USAGE_KEY.length).toBeGreaterThan(0)
    expect(AGENT_SESSION_KEY.length).toBeGreaterThan(0)
    expect(LAST_KNOWN_USAGE_KEY).not.toBe(AGENT_SESSION_KEY)
  })

  it('has positive throttling constants', () => {
    expect(MAX_SINGLE_DELTA_TOKENS).toBeGreaterThan(0)
    expect(TOKEN_USAGE_FLUSH_INTERVAL_MS).toBeGreaterThan(0)
    expect(TOKEN_USAGE_FLUSH_THRESHOLD).toBeGreaterThan(0)
  })

  it('MIN_STOP_THRESHOLD is a small positive fraction', () => {
    expect(MIN_STOP_THRESHOLD).toBeGreaterThan(0)
    expect(MIN_STOP_THRESHOLD).toBeLessThan(1)
  })

  it('DEFAULT_CATEGORY is "other"', () => {
    expect(DEFAULT_CATEGORY).toBe('other')
  })
})
