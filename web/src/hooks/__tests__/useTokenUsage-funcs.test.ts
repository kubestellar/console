import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __testables } from '../useTokenUsage'

const {
  loadPersistedUsage,
  persistUsage,
  getNextResetDate,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
} = __testables

beforeEach(() => {
  localStorage.clear()
})

describe('constants', () => {
  it('MAX_SINGLE_DELTA_TOKENS is a positive number', () => {
    expect(MAX_SINGLE_DELTA_TOKENS).toBe(50_000)
    expect(typeof MAX_SINGLE_DELTA_TOKENS).toBe('number')
  })

  it('MIN_STOP_THRESHOLD is a small positive fraction', () => {
    expect(MIN_STOP_THRESHOLD).toBe(0.01)
    expect(MIN_STOP_THRESHOLD).toBeGreaterThan(0)
    expect(MIN_STOP_THRESHOLD).toBeLessThan(1)
  })

  it('localStorage keys are namespaced strings', () => {
    expect(LAST_KNOWN_USAGE_KEY).toBe('kc:tokenUsage:lastKnown')
    expect(AGENT_SESSION_KEY).toBe('kc:tokenUsage:agentSession')
  })

  it('DEFAULT_CATEGORY is "other"', () => {
    expect(DEFAULT_CATEGORY).toBe('other')
  })

  it('TOKEN_USAGE_FLUSH_INTERVAL_MS is 30 seconds', () => {
    expect(TOKEN_USAGE_FLUSH_INTERVAL_MS).toBe(30_000)
  })

  it('TOKEN_USAGE_FLUSH_THRESHOLD is 100', () => {
    expect(TOKEN_USAGE_FLUSH_THRESHOLD).toBe(100)
  })

  it('DEFAULT_SETTINGS has correct shape and values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      limit: 500_000_000,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      stopThreshold: 1.0,
    })
  })

  it('DEFAULT_BY_CATEGORY has all zero categories', () => {
    expect(DEFAULT_BY_CATEGORY).toEqual({
      missions: 0,
      diagnose: 0,
      insights: 0,
      predictions: 0,
      other: 0,
    })
  })

  it('DEMO_TOKEN_USAGE is a realistic number', () => {
    expect(DEMO_TOKEN_USAGE).toBe(1_247_832)
    expect(DEMO_TOKEN_USAGE).toBeGreaterThan(0)
  })

  it('DEMO_BY_CATEGORY sums to DEMO_TOKEN_USAGE', () => {
    const sum =
      DEMO_BY_CATEGORY.missions +
      DEMO_BY_CATEGORY.diagnose +
      DEMO_BY_CATEGORY.insights +
      DEMO_BY_CATEGORY.predictions +
      DEMO_BY_CATEGORY.other
    expect(sum).toBe(DEMO_TOKEN_USAGE)
  })

  it('DEMO_BY_CATEGORY has expected values', () => {
    expect(DEMO_BY_CATEGORY).toEqual({
      missions: 523_000,
      diagnose: 312_000,
      insights: 245_832,
      predictions: 167_000,
      other: 0,
    })
  })
})

describe('loadPersistedUsage', () => {
  it('returns nulls when localStorage is empty', () => {
    const result = loadPersistedUsage()
    expect(result).toEqual({ lastKnown: null, sessionId: null })
  })

  it('loads a valid numeric lastKnown value', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '42000')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(42_000)
  })

  it('loads sessionId from localStorage', () => {
    localStorage.setItem(AGENT_SESSION_KEY, 'session-abc-123')
    const result = loadPersistedUsage()
    expect(result.sessionId).toBe('session-abc-123')
  })

  it('loads both lastKnown and sessionId together', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '99999')
    localStorage.setItem(AGENT_SESSION_KEY, 'sess-xyz')
    const result = loadPersistedUsage()
    expect(result).toEqual({ lastKnown: 99_999, sessionId: 'sess-xyz' })
  })

  it('returns null lastKnown for non-numeric stored value', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'not-a-number')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('returns null lastKnown for NaN stored value', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'NaN')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('returns null lastKnown for Infinity stored value', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'Infinity')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('handles zero as a valid lastKnown', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '0')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(0)
  })

  it('handles negative numbers as valid lastKnown', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '-100')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(-100)
  })

  it('handles floating point lastKnown', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '3.14')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(3.14)
  })
})

describe('persistUsage', () => {
  it('stores lastKnown in localStorage', () => {
    persistUsage(12345, null)
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('12345')
  })

  it('stores sessionId when provided', () => {
    persistUsage(100, 'session-1')
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('100')
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('session-1')
  })

  it('does not write sessionId when null', () => {
    localStorage.setItem(AGENT_SESSION_KEY, 'old-session')
    persistUsage(200, null)
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('old-session')
  })

  it('overwrites previous values', () => {
    persistUsage(100, 'first')
    persistUsage(200, 'second')
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('200')
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('second')
  })

  it('stores zero as lastKnown', () => {
    persistUsage(0, 'sess')
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('0')
  })

  it('round-trips with loadPersistedUsage', () => {
    persistUsage(77777, 'round-trip-session')
    const result = loadPersistedUsage()
    expect(result).toEqual({ lastKnown: 77_777, sessionId: 'round-trip-session' })
  })
})

describe('getNextResetDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a valid ISO date string', () => {
    const result = getNextResetDate()
    expect(() => new Date(result)).not.toThrow()
    const parsed = new Date(result)
    expect(parsed.getTime()).not.toBeNaN()
  })

  it('returns the next calendar day', () => {
    const result = getNextResetDate()
    const parsed = new Date(result)
    const expected = new Date()
    expected.setHours(0, 0, 0, 0)
    expected.setDate(expected.getDate() + 1)
    expect(parsed.getFullYear()).toBe(expected.getFullYear())
    expect(parsed.getMonth()).toBe(expected.getMonth())
    expect(parsed.getDate()).toBe(expected.getDate())
  })

  it('returns a date in the future', () => {
    const result = getNextResetDate()
    const parsed = new Date(result)
    const now = new Date()
    expect(parsed.getTime()).toBeGreaterThan(now.getTime())
  })

  it('returns a reset time at local midnight', () => {
    const result = getNextResetDate()
    const parsed = new Date(result)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
    expect(parsed.getSeconds()).toBe(0)
  })

  it('rolls over year boundary correctly when mocked to December', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 11, 31, 12))
    const result = getNextResetDate()
    const parsed = new Date(result)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(0)
    expect(parsed.getDate()).toBe(1)
  })

  it('handles January correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 20))
    const result = getNextResetDate()
    const parsed = new Date(result)
    expect(parsed.getFullYear()).toBe(2025)
    expect(parsed.getMonth()).toBe(0)
    expect(parsed.getDate()).toBe(21)
  })

  it('handles last day of month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 2, 31, 18))
    const result = getNextResetDate()
    const parsed = new Date(result)
    expect(parsed.getFullYear()).toBe(2025)
    expect(parsed.getMonth()).toBe(3)
    expect(parsed.getDate()).toBe(1)
  })

  it('handles first day of month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 1, 8))
    const result = getNextResetDate()
    const parsed = new Date(result)
    expect(parsed.getFullYear()).toBe(2025)
    expect(parsed.getMonth()).toBe(5)
    expect(parsed.getDate()).toBe(2)
  })
})
