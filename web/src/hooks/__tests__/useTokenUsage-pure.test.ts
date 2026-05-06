import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

vi.mock('../../lib/tokenUsageApi', () => ({
  fetchTokenUsageFromBackend: vi.fn(),
  postTokenDelta: vi.fn(),
  beaconTokenDelta: vi.fn(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

const mod = await import('../useTokenUsage')
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
} = mod.__testables
const { getTokenAlertLevel } = mod

beforeEach(() => {
  localStorage.clear()
})

describe('loadPersistedUsage', () => {
  it('returns nulls when localStorage is empty', () => {
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
    expect(result.sessionId).toBeNull()
  })

  it('returns stored values', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, '42000')
    localStorage.setItem(AGENT_SESSION_KEY, 'session-abc')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBe(42000)
    expect(result.sessionId).toBe('session-abc')
  })

  it('returns null for non-finite lastKnown', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'not-a-number')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })

  it('returns null for Infinity', () => {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, 'Infinity')
    const result = loadPersistedUsage()
    expect(result.lastKnown).toBeNull()
  })
})

describe('persistUsage', () => {
  it('stores lastKnown and sessionId', () => {
    persistUsage(12345, 'sess-1')
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('12345')
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBe('sess-1')
  })

  it('stores lastKnown without sessionId when null', () => {
    persistUsage(99999, null)
    expect(localStorage.getItem(LAST_KNOWN_USAGE_KEY)).toBe('99999')
    expect(localStorage.getItem(AGENT_SESSION_KEY)).toBeNull()
  })
})

describe('getNextResetDate', () => {
  it('returns a valid ISO date string', () => {
    const result = getNextResetDate()
    expect(new Date(result).getTime()).not.toBeNaN()
  })

  it('returns a date in the future', () => {
    const result = new Date(getNextResetDate())
    expect(result.getTime()).toBeGreaterThan(Date.now())
  })

  it('returns the next calendar day', () => {
    const result = new Date(getNextResetDate())
    const expected = new Date()
    expected.setHours(0, 0, 0, 0)
    expected.setDate(expected.getDate() + 1)
    expect(result.getFullYear()).toBe(expected.getFullYear())
    expect(result.getMonth()).toBe(expected.getMonth())
    expect(result.getDate()).toBe(expected.getDate())
  })
})

describe('getTokenAlertLevel', () => {
  it('returns normal below warning threshold', () => {
    expect(getTokenAlertLevel({
      used: 40,
      limit: 100,
      warningThreshold: 0.5,
      criticalThreshold: 0.8,
      stopThreshold: 1,
    })).toBe('normal')
  })

  it('returns warning and critical using configured thresholds', () => {
    expect(getTokenAlertLevel({
      used: 60,
      limit: 100,
      warningThreshold: 0.5,
      criticalThreshold: 0.8,
      stopThreshold: 1,
    })).toBe('warning')

    expect(getTokenAlertLevel({
      used: 85,
      limit: 100,
      warningThreshold: 0.5,
      criticalThreshold: 0.8,
      stopThreshold: 1,
    })).toBe('critical')
  })

  it('returns stopped at stop threshold', () => {
    expect(getTokenAlertLevel({
      used: 100,
      limit: 100,
      warningThreshold: 0.5,
      criticalThreshold: 0.8,
      stopThreshold: 1,
    })).toBe('stopped')
  })
})

describe('constants', () => {
  it('MAX_SINGLE_DELTA_TOKENS is 50000', () => {
    expect(MAX_SINGLE_DELTA_TOKENS).toBe(50_000)
  })

  it('MIN_STOP_THRESHOLD is 0.01', () => {
    expect(MIN_STOP_THRESHOLD).toBe(0.01)
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

  it('DEFAULT_SETTINGS has required fields', () => {
    expect(DEFAULT_SETTINGS.limit).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.warningThreshold).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.criticalThreshold).toBeGreaterThan(DEFAULT_SETTINGS.warningThreshold)
    expect(DEFAULT_SETTINGS.stopThreshold).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.criticalThreshold)
  })

  it('DEFAULT_BY_CATEGORY has all categories at zero', () => {
    expect(DEFAULT_BY_CATEGORY.missions).toBe(0)
    expect(DEFAULT_BY_CATEGORY.diagnose).toBe(0)
    expect(DEFAULT_BY_CATEGORY.insights).toBe(0)
    expect(DEFAULT_BY_CATEGORY.predictions).toBe(0)
    expect(DEFAULT_BY_CATEGORY.other).toBe(0)
  })

  it('DEMO_TOKEN_USAGE is positive', () => {
    expect(DEMO_TOKEN_USAGE).toBeGreaterThan(0)
  })

  it('DEMO_BY_CATEGORY sums are positive', () => {
    const sum = DEMO_BY_CATEGORY.missions + DEMO_BY_CATEGORY.diagnose +
                DEMO_BY_CATEGORY.insights + DEMO_BY_CATEGORY.predictions +
                DEMO_BY_CATEGORY.other
    expect(sum).toBeGreaterThan(0)
  })

  it('LAST_KNOWN_USAGE_KEY and AGENT_SESSION_KEY are non-empty strings', () => {
    expect(typeof LAST_KNOWN_USAGE_KEY).toBe('string')
    expect(LAST_KNOWN_USAGE_KEY.length).toBeGreaterThan(0)
    expect(typeof AGENT_SESSION_KEY).toBe('string')
    expect(AGENT_SESSION_KEY.length).toBeGreaterThan(0)
  })
})
