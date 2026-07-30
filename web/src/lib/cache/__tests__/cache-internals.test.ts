import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { __testables, REFRESH_RATES, isAutoRefreshPaused, setAutoRefreshPaused, subscribeAutoRefreshPaused,
  initPreloadedMeta, isSQLiteWorkerActive, resetFailuresForCluster, resetAllCacheFailures,
  clearAllCaches, getCacheStats, invalidateCache } = await import('../index')

const {
  ssWrite, ssRead, clearSessionSnapshots, isEquivalentToInitial,
  getEffectiveInterval, CACHE_VERSION, SS_PREFIX, MAX_FAILURES,
  FAILURE_BACKOFF_MULTIPLIER, MAX_BACKOFF_INTERVAL,
} = __testables

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  setAutoRefreshPaused(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── ssWrite / ssRead ──

describe('ssWrite + ssRead', () => {
  it('round-trips data through sessionStorage', () => {
    ssWrite('test-key', { hello: 'world' }, 1000)
    const result = ssRead<{ hello: string }>('test-key')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual({ hello: 'world' })
    expect(result!.timestamp).toBe(1000)
  })

  it('returns null for missing key', () => {
    expect(ssRead('nonexistent')).toBeNull()
  })

  it('returns null for version mismatch', () => {
    sessionStorage.setItem(
      SS_PREFIX + 'old-key',
      JSON.stringify({ d: 'data', t: 100, v: CACHE_VERSION - 1 }),
    )
    expect(ssRead('old-key')).toBeNull()
    expect(sessionStorage.getItem(SS_PREFIX + 'old-key')).toBeNull()
  })

  it('returns null for missing version field', () => {
    sessionStorage.setItem(SS_PREFIX + 'no-v', JSON.stringify({ d: 'data', t: 100 }))
    expect(ssRead('no-v')).toBeNull()
  })

  it('returns null for missing data field', () => {
    sessionStorage.setItem(SS_PREFIX + 'no-d', JSON.stringify({ t: 100, v: CACHE_VERSION }))
    expect(ssRead('no-d')).toBeNull()
  })

  it('returns null for missing timestamp field', () => {
    sessionStorage.setItem(SS_PREFIX + 'no-t', JSON.stringify({ d: 'data', v: CACHE_VERSION }))
    expect(ssRead('no-t')).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    sessionStorage.setItem(SS_PREFIX + 'bad', 'not-json{{{')
    expect(ssRead('bad')).toBeNull()
  })

  it('returns null for null stored value', () => {
    sessionStorage.setItem(SS_PREFIX + 'null-val', 'null')
    expect(ssRead('null-val')).toBeNull()
  })

  it('returns null for non-object stored value', () => {
    sessionStorage.setItem(SS_PREFIX + 'string', '"just a string"')
    expect(ssRead('string')).toBeNull()
  })

  it('handles array data', () => {
    ssWrite('arr', [1, 2, 3], 500)
    const result = ssRead<number[]>('arr')
    expect(result!.data).toEqual([1, 2, 3])
  })

  it('handles null data', () => {
    ssWrite('null-data', null, 999)
    const result = ssRead<null>('null-data')
    expect(result!.data).toBeNull()
  })

  it('silently handles QuotaExceededError on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    expect(() => ssWrite('full', { big: 'data' }, 100)).not.toThrow()
  })
})

// ── clearSessionSnapshots ──

describe('clearSessionSnapshots', () => {
  it('removes all kcc:-prefixed keys', () => {
    sessionStorage.setItem(SS_PREFIX + 'a', 'data-a')
    sessionStorage.setItem(SS_PREFIX + 'b', 'data-b')
    sessionStorage.setItem('other-key', 'keep-me')

    clearSessionSnapshots()

    expect(sessionStorage.getItem(SS_PREFIX + 'a')).toBeNull()
    expect(sessionStorage.getItem(SS_PREFIX + 'b')).toBeNull()
    expect(sessionStorage.getItem('other-key')).toBe('keep-me')
  })

  it('handles empty sessionStorage', () => {
    expect(() => clearSessionSnapshots()).not.toThrow()
  })

  it('handles sessionStorage errors gracefully', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('access denied')
    })
    expect(() => clearSessionSnapshots()).not.toThrow()
  })
})

// ── isEquivalentToInitial ──

describe('isEquivalentToInitial', () => {
  it('returns true for both null', () => {
    expect(isEquivalentToInitial(null, null)).toBe(true)
  })

  it('returns true for both undefined', () => {
    expect(isEquivalentToInitial(undefined, undefined)).toBe(true)
  })

  it('returns true for null and undefined', () => {
    expect(isEquivalentToInitial(null, undefined)).toBe(true)
  })

  it('returns true for two empty arrays', () => {
    expect(isEquivalentToInitial([], [])).toBe(true)
  })

  it('returns false for non-empty vs empty array', () => {
    expect(isEquivalentToInitial([1], [])).toBe(false)
  })

  it('returns false for empty vs non-empty array', () => {
    expect(isEquivalentToInitial([], [1])).toBe(false)
  })

  it('returns true for equal objects via JSON', () => {
    expect(isEquivalentToInitial({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  it('returns false for different objects', () => {
    expect(isEquivalentToInitial({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns true for objects with empty arrays and zeros', () => {
    const a = { alerts: [], inventory: [], nodeCount: 0 }
    expect(isEquivalentToInitial(a, { ...a })).toBe(true)
  })

  it('returns false for non-null vs null', () => {
    expect(isEquivalentToInitial({ a: 1 }, null)).toBe(false)
  })

  it('returns false for primitives that differ', () => {
    expect(isEquivalentToInitial('a', 'b')).toBe(false)
  })

  it('returns false for circular reference objects', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(isEquivalentToInitial(obj, {})).toBe(false)
  })
})

// ── getEffectiveInterval ──

describe('getEffectiveInterval', () => {
  it('returns base interval when no failures', () => {
    expect(getEffectiveInterval(60_000, 0)).toBe(60_000)
  })

  it('doubles interval after 1 failure', () => {
    expect(getEffectiveInterval(60_000, 1)).toBe(120_000)
  })

  it('quadruples interval after 2 failures', () => {
    expect(getEffectiveInterval(60_000, 2)).toBe(240_000)
  })

  it('caps at MAX_BACKOFF_INTERVAL', () => {
    expect(getEffectiveInterval(60_000, 10)).toBe(MAX_BACKOFF_INTERVAL)
  })

  it('caps exponent at 5 (2^5 = 32x)', () => {
    const expected = Math.min(60_000 * Math.pow(FAILURE_BACKOFF_MULTIPLIER, 5), MAX_BACKOFF_INTERVAL)
    expect(getEffectiveInterval(60_000, 5)).toBe(expected)
    expect(getEffectiveInterval(60_000, 6)).toBe(expected)
  })

  it('handles small base interval', () => {
    expect(getEffectiveInterval(1_000, 3)).toBe(8_000)
  })
})

// ── REFRESH_RATES ──

describe('REFRESH_RATES', () => {
  it('contains all expected categories', () => {
    const expectedCategories = [
      'realtime', 'pods', 'clusters', 'deployments', 'services',
      'metrics', 'gpu', 'helm', 'gitops', 'namespaces', 'rbac',
      'operators', 'costs', 'ai-ml', 'default',
    ]
    for (const cat of expectedCategories) {
      expect(REFRESH_RATES).toHaveProperty(cat)
      expect(typeof (REFRESH_RATES as Record<string, number>)[cat]).toBe('number')
    }
  })

  it('realtime is the shortest interval', () => {
    const values = Object.values(REFRESH_RATES) as number[]
    expect(REFRESH_RATES.realtime).toBe(Math.min(...values))
  })

  it('costs is the longest interval', () => {
    const values = Object.values(REFRESH_RATES) as number[]
    expect(REFRESH_RATES.costs).toBe(Math.max(...values))
  })
})

// ── Auto-refresh pause ──

describe('auto-refresh pause', () => {
  it('defaults to not paused', () => {
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('can be paused', () => {
    setAutoRefreshPaused(true)
    expect(isAutoRefreshPaused()).toBe(true)
  })

  it('can be resumed', () => {
    setAutoRefreshPaused(true)
    setAutoRefreshPaused(false)
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('notifies subscribers on change', () => {
    const cb = vi.fn()
    const unsub = subscribeAutoRefreshPaused(cb)

    setAutoRefreshPaused(true)
    expect(cb).toHaveBeenCalledWith(true)

    setAutoRefreshPaused(false)
    expect(cb).toHaveBeenCalledWith(false)

    unsub()
  })

  it('does not notify when setting same value', () => {
    const cb = vi.fn()
    const unsub = subscribeAutoRefreshPaused(cb)

    setAutoRefreshPaused(false)
    expect(cb).not.toHaveBeenCalled()

    unsub()
  })

  it('unsubscribe stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeAutoRefreshPaused(cb)
    unsub()

    setAutoRefreshPaused(true)
    expect(cb).not.toHaveBeenCalled()
  })
})

// ── isSQLiteWorkerActive ──

describe('isSQLiteWorkerActive', () => {
  it('returns false when no worker initialized', () => {
    expect(isSQLiteWorkerActive()).toBe(false)
  })
})

// ── Constants ──

describe('cache constants', () => {
  it('CACHE_VERSION is a positive integer', () => {
    expect(Number.isInteger(CACHE_VERSION)).toBe(true)
    expect(CACHE_VERSION).toBeGreaterThan(0)
  })

  it('MAX_FAILURES is a positive integer', () => {
    expect(Number.isInteger(MAX_FAILURES)).toBe(true)
    expect(MAX_FAILURES).toBeGreaterThan(0)
  })

  it('SS_PREFIX is a non-empty string', () => {
    expect(typeof SS_PREFIX).toBe('string')
    expect(SS_PREFIX.length).toBeGreaterThan(0)
  })
})
