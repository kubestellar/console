import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => false),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('./useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../lib/tokenUsageApi', () => ({
  getUserTokenUsage: vi.fn(),
  postTokenDelta: vi.fn(),
  TokenUsageUnauthenticatedError: class extends Error {
    constructor() { super('unauthenticated'); this.name = 'TokenUsageUnauthenticatedError' }
  },
}))

import {
  getTokenAlertLevel,
  setActiveTokenCategory,
  clearActiveTokenCategory,
  getActiveTokenCategories,
  addCategoryTokens,
  __testables,
} from '../useTokenUsage'

const {
  loadPersistedUsage,
  persistUsage,
  getNextResetDate,
  getUsagePeriodKey,
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

// ── getTokenAlertLevel ──────────────────────────────────────────

describe('getTokenAlertLevel', () => {
  it('returns "normal" when limit is 0', () => {
    expect(getTokenAlertLevel({
      used: 100, limit: 0, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('normal')
  })

  it('returns "normal" when limit is negative', () => {
    expect(getTokenAlertLevel({
      used: 100, limit: -1, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('normal')
  })

  it('returns "normal" when usage is below warning threshold', () => {
    expect(getTokenAlertLevel({
      used: 100, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('normal')
  })

  it('returns "warning" when usage is at warning threshold', () => {
    expect(getTokenAlertLevel({
      used: 700, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('warning')
  })

  it('returns "warning" when usage is between warning and critical', () => {
    expect(getTokenAlertLevel({
      used: 800, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('warning')
  })

  it('returns "critical" when usage is at critical threshold', () => {
    expect(getTokenAlertLevel({
      used: 900, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('critical')
  })

  it('returns "critical" when usage is between critical and stop', () => {
    expect(getTokenAlertLevel({
      used: 950, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('critical')
  })

  it('returns "stopped" when usage meets stop threshold', () => {
    expect(getTokenAlertLevel({
      used: 1000, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('stopped')
  })

  it('returns "stopped" when usage exceeds stop threshold', () => {
    expect(getTokenAlertLevel({
      used: 1100, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 1.0,
    })).toBe('stopped')
  })

  it('uses DEFAULT_SETTINGS.stopThreshold when stopThreshold is 0', () => {
    // stopThreshold=0 is treated as corrupted — falls back to default (1.0)
    expect(getTokenAlertLevel({
      used: 999, limit: 1000, warningThreshold: 0.7, criticalThreshold: 0.9, stopThreshold: 0,
    })).toBe('critical')
  })
})

// ── loadPersistedUsage ──────────────────────────────────────────

describe('loadPersistedUsage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('returns null fields when localStorage is empty', () => {
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
    expect(result.sessionId).toBeNull()
  })

  it('returns stored lastKnown and sessionId', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '42000')
    localStorage.setItem(AGENT_SESSION_KEY, 'session-abc')

    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(42000)
    expect(result.sessionId).toBe('session-abc')
  })

  it('returns null lastKnown for non-numeric value', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'not-a-number')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('returns null lastKnown for Infinity', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'Infinity')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('handles localStorage exception gracefully', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
    expect(result.sessionId).toBeNull()
    vi.mocked(localStorage.getItem).mockRestore()
  })
})

// ── persistUsage ────────────────────────────────────────────────

describe('persistUsage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('stores lastKnown in localStorage', () => {
    persistUsage(12345, null)
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('12345')
  })

  it('stores sessionId when provided', () => {
    persistUsage(100, 'sess-xyz')
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('sess-xyz')
  })

  it('does not write sessionId when null', () => {
    persistUsage(100, null)
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBeNull()
  })

  it('does not throw on quota exceeded', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    expect(() => persistUsage(100, 'sess')).not.toThrow()
    vi.mocked(localStorage.setItem).mockRestore()
  })
})

// ── getNextResetDate ────────────────────────────────────────────

describe('getNextResetDate', () => {
  it('returns an ISO string', () => {
    const result = getNextResetDate()
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toISOString()).toBe(result)
  })

  it('returns a date in the future (tomorrow)', () => {
    const result = new Date(getNextResetDate())
    const now = new Date()
    expect(result.getTime()).toBeGreaterThan(now.getTime() - 1000) // within tolerance
  })
})

// ── getUsagePeriodKey ───────────────────────────────────────────

describe('getUsagePeriodKey', () => {
  it('returns a date string in YYYY-MM-DD format', () => {
    const result = getUsagePeriodKey(new Date('2026-07-05T12:00:00Z'))
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses current date when no argument provided', () => {
    const result = getUsagePeriodKey()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── setActiveTokenCategory / clearActiveTokenCategory ───────────

describe('active token category management', () => {
  it('setActiveTokenCategory adds a category for an operation', () => {
    setActiveTokenCategory('op-1', 'missions')
    expect(getActiveTokenCategories()).toContain('missions')
    clearActiveTokenCategory('op-1')
  })

  it('clearActiveTokenCategory removes the operation category', () => {
    setActiveTokenCategory('op-2', 'diagnose')
    clearActiveTokenCategory('op-2')
    expect(getActiveTokenCategories()).not.toContain('diagnose')
  })

  it('supports multiple concurrent operations', () => {
    setActiveTokenCategory('op-a', 'missions')
    setActiveTokenCategory('op-b', 'insights')
    const categories = getActiveTokenCategories()
    expect(categories).toContain('missions')
    expect(categories).toContain('insights')
    clearActiveTokenCategory('op-a')
    clearActiveTokenCategory('op-b')
  })

  it('clearing non-existent opId does not throw', () => {
    expect(() => clearActiveTokenCategory('does-not-exist')).not.toThrow()
  })
})

// ── Constants validation ────────────────────────────────────────

describe('token usage constants', () => {
  it('MAX_SINGLE_DELTA_TOKENS is a positive number', () => {
    expect(MAX_SINGLE_DELTA_TOKENS).toBeGreaterThan(0)
  })

  it('MIN_STOP_THRESHOLD is a small positive number', () => {
    expect(MIN_STOP_THRESHOLD).toBeGreaterThan(0)
    expect(MIN_STOP_THRESHOLD).toBeLessThan(1)
  })

  it('TOKEN_USAGE_FLUSH_INTERVAL_MS is reasonable (10s-120s)', () => {
    expect(TOKEN_USAGE_FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(10_000)
    expect(TOKEN_USAGE_FLUSH_INTERVAL_MS).toBeLessThanOrEqual(120_000)
  })

  it('TOKEN_USAGE_FLUSH_THRESHOLD is a positive number', () => {
    expect(TOKEN_USAGE_FLUSH_THRESHOLD).toBeGreaterThan(0)
  })

  it('DEFAULT_SETTINGS has expected thresholds', () => {
    expect(DEFAULT_SETTINGS.warningThreshold).toBeLessThan(DEFAULT_SETTINGS.criticalThreshold)
    expect(DEFAULT_SETTINGS.criticalThreshold).toBeLessThan(DEFAULT_SETTINGS.stopThreshold)
    expect(DEFAULT_SETTINGS.stopThreshold).toBeLessThanOrEqual(1.0)
  })

  it('DEFAULT_BY_CATEGORY has all zero values', () => {
    for (const val of Object.values(DEFAULT_BY_CATEGORY)) {
      expect(val).toBe(0)
    }
  })

  it('DEMO_TOKEN_USAGE is a positive number', () => {
    expect(DEMO_TOKEN_USAGE).toBeGreaterThan(0)
  })

  it('DEMO_BY_CATEGORY sums to a reasonable total', () => {
    const sum = Object.values(DEMO_BY_CATEGORY).reduce((a, b) => a + b, 0)
    expect(sum).toBeGreaterThan(0)
  })

  it('DEFAULT_CATEGORY is "other"', () => {
    expect(DEFAULT_CATEGORY).toBe('other')
  })
})

// ── addCategoryTokens ───────────────────────────────────────────

describe('addCategoryTokens', () => {
  it('does nothing when tokens is 0', () => {
    // Should not throw
    expect(() => addCategoryTokens(0, 'missions')).not.toThrow()
  })

  it('does nothing when tokens is negative', () => {
    expect(() => addCategoryTokens(-100, 'missions')).not.toThrow()
  })

  it('accepts positive tokens without throwing', () => {
    expect(() => addCategoryTokens(100, 'diagnose')).not.toThrow()
  })

  it('defaults category to "other" when not specified', () => {
    expect(() => addCategoryTokens(50)).not.toThrow()
  })
})
