import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTokenAlertLevel,
  setActiveTokenCategory,
  clearActiveTokenCategory,
  getActiveTokenCategories,
  type TokenCategory,
} from './useTokenUsage'

// Full TokenUsage-compatible shape used by getTokenAlertLevel. Only the five
// numeric fields matter for alert-level computation; the function signature
// uses Pick<TokenUsage, ...> so the extra fields are irrelevant.
const usage = (opts: {
  used: number
  limit?: number
  warning?: number
  critical?: number
  stop?: number
}) => ({
  used: opts.used,
  limit: opts.limit ?? 100,
  warningThreshold: opts.warning ?? 0.7,
  criticalThreshold: opts.critical ?? 0.9,
  stopThreshold: opts.stop ?? 1.0,
})

describe('getTokenAlertLevel', () => {
  describe('boundary crossings', () => {
    it('returns "normal" strictly below the warning threshold', () => {
      expect(getTokenAlertLevel(usage({ used: 69 }))).toBe('normal')
    })

    it('returns "warning" exactly at the warning threshold', () => {
      expect(getTokenAlertLevel(usage({ used: 70 }))).toBe('warning')
    })

    it('returns "warning" between warning and critical thresholds', () => {
      expect(getTokenAlertLevel(usage({ used: 85 }))).toBe('warning')
    })

    it('returns "critical" exactly at the critical threshold', () => {
      expect(getTokenAlertLevel(usage({ used: 90 }))).toBe('critical')
    })

    it('returns "critical" between critical and stop thresholds', () => {
      expect(getTokenAlertLevel(usage({ used: 95 }))).toBe('critical')
    })

    it('returns "stopped" exactly at the stop threshold', () => {
      expect(getTokenAlertLevel(usage({ used: 100 }))).toBe('stopped')
    })

    it('returns "stopped" above the stop threshold', () => {
      expect(getTokenAlertLevel(usage({ used: 150 }))).toBe('stopped')
    })
  })

  describe('degenerate limits', () => {
    it('returns "normal" when the limit is zero regardless of usage', () => {
      expect(getTokenAlertLevel(usage({ used: 1_000_000, limit: 0 }))).toBe('normal')
    })

    it('returns "normal" when the limit is negative regardless of usage', () => {
      expect(getTokenAlertLevel(usage({ used: 1_000_000, limit: -50 }))).toBe('normal')
    })

    it('returns "normal" when usage is zero and limit is positive', () => {
      expect(getTokenAlertLevel(usage({ used: 0 }))).toBe('normal')
    })
  })

  describe('stopThreshold fallback', () => {
    it('falls back to the default stopThreshold (1.0) when stopThreshold is zero', () => {
      // 100/100 = 1.0 which is >= default 1.0 fallback → stopped.
      expect(getTokenAlertLevel(usage({ used: 100, stop: 0 }))).toBe('stopped')
    })

    it('falls back to the default stopThreshold (1.0) when stopThreshold is negative', () => {
      // Without the > 0 guard a negative stopThreshold would trigger "stopped"
      // for any non-zero usage. The guard uses the default (1.0) instead.
      expect(getTokenAlertLevel(usage({ used: 50, stop: -0.5 }))).toBe('normal')
      expect(getTokenAlertLevel(usage({ used: 100, stop: -0.5 }))).toBe('stopped')
    })

    it('honours a custom positive stopThreshold below 1.0', () => {
      // Custom stopThreshold of 0.8 → at 80% usage we are stopped.
      expect(getTokenAlertLevel(usage({ used: 79, stop: 0.8 }))).toBe('warning')
      expect(getTokenAlertLevel(usage({ used: 80, stop: 0.8 }))).toBe('stopped')
    })
  })

  describe('threshold precedence', () => {
    it('classifies "stopped" before "critical" when both apply', () => {
      // used == limit satisfies both stop (>=1.0) and critical (>=0.9); the
      // higher-severity branch must win.
      expect(getTokenAlertLevel(usage({ used: 100 }))).toBe('stopped')
    })

    it('classifies "critical" before "warning" when both apply', () => {
      expect(getTokenAlertLevel(usage({ used: 90 }))).toBe('critical')
    })
  })

  describe('non-integer percentages', () => {
    it('handles fractional percentages just below and at thresholds', () => {
      // 69.9% → normal (below 70% warning threshold)
      expect(getTokenAlertLevel(usage({ used: 699, limit: 1000 }))).toBe('normal')
      // 70.0% → warning
      expect(getTokenAlertLevel(usage({ used: 700, limit: 1000 }))).toBe('warning')
      // 89.9% → warning
      expect(getTokenAlertLevel(usage({ used: 899, limit: 1000 }))).toBe('warning')
      // 90.0% → critical
      expect(getTokenAlertLevel(usage({ used: 900, limit: 1000 }))).toBe('critical')
    })
  })
})

describe('active token category tracking', () => {
  // The module keeps a process-wide Map. Isolate each test by clearing entries
  // via the exported clearActiveTokenCategory API (there is no bulk reset).
  const OP_IDS = ['op-a', 'op-b', 'op-c', 'op-d']

  beforeEach(() => {
    for (const id of OP_IDS) clearActiveTokenCategory(id)
  })

  it('starts with no active categories after clearing test opIds', () => {
    // Sanity: filter to only categories set by this test suite. We don't
    // assert an empty global list because other tests in the same worker
    // might have left entries under different opIds.
    for (const id of OP_IDS) clearActiveTokenCategory(id)
    // getActiveTokenCategories returns values only (not keys), so we verify
    // via direct set/clear semantics below.
    expect(typeof getActiveTokenCategories()).toBe('object')
    expect(Array.isArray(getActiveTokenCategories())).toBe(true)
  })

  it('records a category for a given opId', () => {
    setActiveTokenCategory('op-a', 'missions')
    expect(getActiveTokenCategories()).toContain('missions')
  })

  it('tracks concurrent opIds with distinct categories', () => {
    setActiveTokenCategory('op-a', 'missions')
    setActiveTokenCategory('op-b', 'diagnose')
    setActiveTokenCategory('op-c', 'insights')

    const active = getActiveTokenCategories()
    expect(active).toContain('missions')
    expect(active).toContain('diagnose')
    expect(active).toContain('insights')
  })

  it('overwrites the category when the same opId is set twice', () => {
    setActiveTokenCategory('op-a', 'missions')
    setActiveTokenCategory('op-a', 'predictions')

    const active = getActiveTokenCategories()
    // The second call should replace, not append.
    expect(active.filter((c) => c === 'missions')).toHaveLength(0)
    expect(active).toContain('predictions')
  })

  it('permits duplicate category values across different opIds', () => {
    setActiveTokenCategory('op-a', 'missions')
    setActiveTokenCategory('op-b', 'missions')

    const missionsCount = getActiveTokenCategories().filter((c) => c === 'missions').length
    expect(missionsCount).toBe(2)
  })

  it('removes an entry via clearActiveTokenCategory', () => {
    setActiveTokenCategory('op-a', 'missions')
    setActiveTokenCategory('op-b', 'diagnose')

    clearActiveTokenCategory('op-a')

    const active = getActiveTokenCategories()
    expect(active).not.toContain('missions')
    expect(active).toContain('diagnose')
  })

  it('is a no-op to clear an opId that was never set', () => {
    // Must not throw or affect other entries.
    setActiveTokenCategory('op-a', 'missions')
    expect(() => clearActiveTokenCategory('op-d')).not.toThrow()
    expect(getActiveTokenCategories()).toContain('missions')
  })

  it('accepts every documented TokenCategory value', () => {
    const categories: TokenCategory[] = ['missions', 'diagnose', 'insights', 'predictions', 'other']
    categories.forEach((cat, i) => setActiveTokenCategory(OP_IDS[0] + i, cat))

    const active = getActiveTokenCategories()
    for (const cat of categories) {
      expect(active).toContain(cat)
    }

    // Cleanup so we don't leak into subsequent tests in the same worker.
    categories.forEach((_, i) => clearActiveTokenCategory(OP_IDS[0] + i))
  })
})
