import { describe, it, expect } from 'vitest'
import {
  getTokenAlertLevel,
  reconcileUsageBreakdown,
  getUsagePeriodKey,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
} from '../useTokenUsage.math'
import type { TokenUsageByCategory } from '../useTokenUsage.types'

function makeUsage(
  used: number,
  limit: number,
  overrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  return {
    used,
    limit,
    warningThreshold: overrides.warningThreshold ?? DEFAULT_SETTINGS.warningThreshold,
    criticalThreshold: overrides.criticalThreshold ?? DEFAULT_SETTINGS.criticalThreshold,
    stopThreshold: overrides.stopThreshold ?? DEFAULT_SETTINGS.stopThreshold,
  }
}

describe('getTokenAlertLevel', () => {
  it('returns normal when limit === 0 (division guard)', () => {
    expect(getTokenAlertLevel(makeUsage(100, 0))).toBe('normal')
  })

  it('returns normal when limit < 0', () => {
    expect(getTokenAlertLevel(makeUsage(100, -1))).toBe('normal')
  })

  it('returns normal at 0% used', () => {
    expect(getTokenAlertLevel(makeUsage(0, 1000))).toBe('normal')
  })

  it('returns normal just under warningThreshold (69.9%)', () => {
    expect(getTokenAlertLevel(makeUsage(699, 1000))).toBe('normal')
  })

  it('returns warning at exactly warningThreshold (70%)', () => {
    expect(getTokenAlertLevel(makeUsage(700, 1000))).toBe('warning')
  })

  it('returns warning just under criticalThreshold (89.9%)', () => {
    expect(getTokenAlertLevel(makeUsage(899, 1000))).toBe('warning')
  })

  it('returns critical at exactly criticalThreshold (90%)', () => {
    expect(getTokenAlertLevel(makeUsage(900, 1000))).toBe('critical')
  })

  it('returns stopped at exactly stopThreshold (100%)', () => {
    expect(getTokenAlertLevel(makeUsage(1000, 1000))).toBe('stopped')
  })

  it('returns stopped over 100%', () => {
    expect(getTokenAlertLevel(makeUsage(1200, 1000))).toBe('stopped')
  })

  it('falls back to DEFAULT_SETTINGS.stopThreshold when stopThreshold is 0', () => {
    // With fallback 1.0, 100% should still be stopped
    expect(getTokenAlertLevel(makeUsage(1000, 1000, { stopThreshold: 0 }))).toBe('stopped')
  })
})

describe('reconcileUsageBreakdown', () => {
  const base: TokenUsageByCategory = {
    missions: 100,
    diagnose: 50,
    insights: 30,
    predictions: 20,
    other: 10,
  }

  it('returns zero copy when totalUsed === 0', () => {
    expect(reconcileUsageBreakdown(0, base)).toEqual(DEFAULT_BY_CATEGORY)
  })

  it('does not mutate the input when totalUsed === 0', () => {
    const input = { ...base }
    reconcileUsageBreakdown(0, input)
    expect(input).toEqual(base)
  })

  it('sets other === 0 when knownCategories >= totalUsed (no negative slice)', () => {
    // missions(100)+diagnose(50)+insights(30)+predictions(20) = 200 >= totalUsed(150)
    const cat: TokenUsageByCategory = { missions: 100, diagnose: 50, insights: 30, predictions: 20, other: 0 }
    expect(reconcileUsageBreakdown(150, cat).other).toBe(0)
  })

  it('computes other correctly when knownCategories < totalUsed', () => {
    const cat: TokenUsageByCategory = { missions: 100, diagnose: 0, insights: 0, predictions: 0, other: 0 }
    // 150 - 100 = 50
    expect(reconcileUsageBreakdown(150, cat).other).toBe(50)
  })

  it('returns the same reference when other already matches (identity check)', () => {
    const cat: TokenUsageByCategory = { missions: 100, diagnose: 0, insights: 0, predictions: 0, other: 50 }
    expect(reconcileUsageBreakdown(150, cat)).toBe(cat)
  })
})

describe('getUsagePeriodKey', () => {
  it('returns YYYY-MM-DD format for an injected Date', () => {
    const d = new Date(2024, 2, 15) // March 15, 2024 local time
    expect(getUsagePeriodKey(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns the same key for two Date objects on the same calendar day', () => {
    const d1 = new Date(2024, 5, 1, 0, 0, 1)   // June 1 00:00:01
    const d2 = new Date(2024, 5, 1, 23, 59, 59) // June 1 23:59:59
    expect(getUsagePeriodKey(d1)).toBe(getUsagePeriodKey(d2))
  })

  it('returns different keys for dates on different days', () => {
    const d1 = new Date(2024, 5, 1, 12, 0, 0) // June 1
    const d2 = new Date(2024, 5, 2, 12, 0, 0) // June 2
    expect(getUsagePeriodKey(d1)).not.toBe(getUsagePeriodKey(d2))
  })
})
