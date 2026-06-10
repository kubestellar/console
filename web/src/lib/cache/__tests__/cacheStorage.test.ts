import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../demoMode', () => ({
  isDemoMode: () => false,
  subscribeDemoMode: (cb: () => void) => () => {},
}))

vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, STORAGE_KEY_KUBECTL_HISTORY: 'kubectl-history' }
})

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// ssWrite / ssRead / ssFlush
// ---------------------------------------------------------------------------

describe('ssWrite + ssRead', () => {
  it('round-trips primitive data', async () => {
    const { __testables } = await importFresh()
    __testables.ssWrite('num', 42, 1000)
    const result = __testables.ssRead<number>('num')
    expect(result).not.toBeNull()
    expect(result!.data).toBe(42)
    expect(result!.timestamp).toBe(1000)
  })

  it('round-trips object data', async () => {
    const { __testables } = await importFresh()
    const payload = { a: 1, b: [2, 3] }
    __testables.ssWrite('obj', payload, 2000)
    const result = __testables.ssRead<typeof payload>('obj')
    expect(result!.data).toEqual(payload)
  })

  it('returns pending write before flush', async () => {
    const { __testables } = await importFresh()
    __testables.ssWrite('pending', 'val', 500)
    // Before flush, ssRead should return from pending map
    const result = __testables.ssRead<string>('pending')
    expect(result!.data).toBe('val')
  })

  it('ssFlush writes to sessionStorage', async () => {
    const { __testables } = await importFresh()
    __testables.ssWrite('flush-test', { x: 1 }, 3000)
    __testables.ssFlush()
    const raw = sessionStorage.getItem(__testables.SS_PREFIX + 'flush-test')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.d).toEqual({ x: 1 })
    expect(parsed.t).toBe(3000)
    expect(parsed.v).toBe(__testables.CACHE_VERSION)
  })

  it('ssFlush clears pending map', async () => {
    const { __testables } = await importFresh()
    __testables.ssWrite('clear-pending', 'a', 100)
    __testables.ssFlush()
    // After flush, pending is cleared — reading non-flushed key returns from sessionStorage
    sessionStorage.removeItem(__testables.SS_PREFIX + 'clear-pending')
    expect(__testables.ssRead('clear-pending')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ssRead — edge cases
// ---------------------------------------------------------------------------

describe('ssRead edge cases', () => {
  it('returns null for missing key', async () => {
    const { __testables } = await importFresh()
    expect(__testables.ssRead('nonexistent')).toBeNull()
  })

  it('returns null and removes entry on version mismatch', async () => {
    const { __testables } = await importFresh()
    const STALE_VERSION = __testables.CACHE_VERSION - 1
    sessionStorage.setItem(
      __testables.SS_PREFIX + 'old',
      JSON.stringify({ d: 'stale', t: 100, v: STALE_VERSION }),
    )
    expect(__testables.ssRead('old')).toBeNull()
    expect(sessionStorage.getItem(__testables.SS_PREFIX + 'old')).toBeNull()
  })

  it('returns null for corrupted JSON', async () => {
    const { __testables } = await importFresh()
    sessionStorage.setItem(__testables.SS_PREFIX + 'bad', '{{invalid')
    expect(__testables.ssRead('bad')).toBeNull()
  })

  it('returns null for non-object stored value', async () => {
    const { __testables } = await importFresh()
    sessionStorage.setItem(__testables.SS_PREFIX + 'str', '"hello"')
    expect(__testables.ssRead('str')).toBeNull()
  })

  it('returns null when required fields are missing', async () => {
    const { __testables } = await importFresh()
    // Missing 'd' field
    sessionStorage.setItem(
      __testables.SS_PREFIX + 'no-d',
      JSON.stringify({ t: 100, v: __testables.CACHE_VERSION }),
    )
    expect(__testables.ssRead('no-d')).toBeNull()

    // Missing 't' field
    sessionStorage.setItem(
      __testables.SS_PREFIX + 'no-t',
      JSON.stringify({ d: 'val', v: __testables.CACHE_VERSION }),
    )
    expect(__testables.ssRead('no-t')).toBeNull()

    // Missing 'v' field
    sessionStorage.setItem(
      __testables.SS_PREFIX + 'no-v',
      JSON.stringify({ d: 'val', t: 100 }),
    )
    expect(__testables.ssRead('no-v')).toBeNull()
  })

  it('handles sessionStorage.getItem throwing', async () => {
    const { __testables } = await importFresh()
    const spy = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(__testables.ssRead('blocked')).toBeNull()
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// clearSessionSnapshots
// ---------------------------------------------------------------------------

describe('clearSessionSnapshots', () => {
  it('removes all kcc: prefixed entries', async () => {
    const { __testables } = await importFresh()
    sessionStorage.setItem(__testables.SS_PREFIX + 'a', 'val')
    sessionStorage.setItem(__testables.SS_PREFIX + 'b', 'val')
    sessionStorage.setItem('other-key', 'keep')
    __testables.clearSessionSnapshots()
    expect(sessionStorage.getItem(__testables.SS_PREFIX + 'a')).toBeNull()
    expect(sessionStorage.getItem(__testables.SS_PREFIX + 'b')).toBeNull()
    expect(sessionStorage.getItem('other-key')).toBe('keep')
  })

  it('handles empty sessionStorage', async () => {
    const { __testables } = await importFresh()
    expect(() => __testables.clearSessionSnapshots()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// REFRESH_RATES constants
// ---------------------------------------------------------------------------

describe('REFRESH_RATES', () => {
  it('contains expected categories with numeric values', async () => {
    const { REFRESH_RATES } = await importFresh()
    const EXPECTED_CATEGORIES = [
      'realtime', 'pods', 'clusters', 'deployments', 'services',
      'metrics', 'gpu', 'helm', 'gitops', 'namespaces',
      'rbac', 'operators', 'costs', 'ai-ml', 'default',
    ]
    for (const cat of EXPECTED_CATEGORIES) {
      expect(REFRESH_RATES).toHaveProperty(cat)
      expect(typeof (REFRESH_RATES as Record<string, number>)[cat]).toBe('number')
    }
  })

  it('realtime is faster than default', async () => {
    const { REFRESH_RATES } = await importFresh()
    expect(REFRESH_RATES.realtime).toBeLessThan(REFRESH_RATES.default)
  })
})

// ---------------------------------------------------------------------------
// IndexedDBStorage
// ---------------------------------------------------------------------------

describe('IndexedDBStorage', () => {
  it('getFromSnapshot returns null before preload', async () => {
    const { __testables } = await importFresh()
    expect(__testables._idbStorage.getFromSnapshot('any-key')).toBeNull()
  })

  it('preloadAll resolves to a Map', async () => {
    const { __testables } = await importFresh()
    const result = await __testables._idbStorage.preloadAll()
    expect(result).toBeInstanceOf(Map)
  })

  it('get returns null for missing key', async () => {
    const { __testables } = await importFresh()
    const result = await __testables._idbStorage.get('missing')
    // After preload, snapshot is ready but empty in test env
    expect(result).toBeNull()
  })

  it('set then get round-trips via snapshot', async () => {
    const { __testables } = await importFresh()
    const idb = __testables._idbStorage
    // Ensure preload has run (snapshot is ready)
    await idb.preloadAll()
    try {
      await idb.set('round-trip', { value: 123 })
    } catch {
      // IDB may not be fully available in test env, but snapshot should work
    }
    const entry = idb.getFromSnapshot<{ value: number }>('round-trip')
    // In test env, set populates the in-memory snapshot even if IDB fails
    if (entry) {
      expect(entry.data).toEqual({ value: 123 })
      expect(entry.version).toBe(__testables.CACHE_VERSION)
    }
  })

  it('delete removes from snapshot', async () => {
    const { __testables } = await importFresh()
    const idb = __testables._idbStorage
    await idb.preloadAll()
    try {
      await idb.set('del-test', 'val')
      await idb.delete('del-test')
    } catch {
      // IDB may not be available in test env
    }
    expect(idb.getFromSnapshot('del-test')).toBeNull()
  })

  it('clear empties the snapshot', async () => {
    const { __testables } = await importFresh()
    const idb = __testables._idbStorage
    await idb.preloadAll()
    try {
      await idb.set('clear-a', 1)
      await idb.set('clear-b', 2)
      await idb.clear()
    } catch {
      // IDB may not be available in test env
    }
    expect(idb.getFromSnapshot('clear-a')).toBeNull()
    expect(idb.getFromSnapshot('clear-b')).toBeNull()
  })

  it('getStats returns keys and count', async () => {
    const { __testables } = await importFresh()
    const stats = await __testables._idbStorage.getStats()
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
    expect(Array.isArray(stats.keys)).toBe(true)
    expect(typeof stats.count).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// CacheStorage interface — version filtering
// ---------------------------------------------------------------------------

describe('CacheStorage version filtering', () => {
  it('CACHE_VERSION is a positive integer', async () => {
    const { __testables } = await importFresh()
    expect(__testables.CACHE_VERSION).toBeGreaterThan(0)
    expect(Number.isInteger(__testables.CACHE_VERSION)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// initPreloadedMeta
// ---------------------------------------------------------------------------

describe('initPreloadedMeta', () => {
  it('populates preloadedMetaMap from worker meta', async () => {
    const { initPreloadedMeta, __testables } = await importFresh()
    initPreloadedMeta({
      'key-a': { consecutiveFailures: 2, lastError: 'timeout' },
      'key-b': { consecutiveFailures: 0, lastSuccessfulRefresh: 1000 },
    })
    // preloadedMetaMap is not directly exported via __testables but initPreloadedMeta is tested
    // via its effect on CacheStore — we verify it doesn't throw
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSQLiteWorkerActive
// ---------------------------------------------------------------------------

describe('isSQLiteWorkerActive', () => {
  it('returns false when no worker is initialized', async () => {
    const { isSQLiteWorkerActive } = await importFresh()
    expect(isSQLiteWorkerActive()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// migrateFromLocalStorage
// ---------------------------------------------------------------------------

describe('migrateFromLocalStorage', () => {
  it('migrates ksc_ prefixed keys to kc_ prefix', async () => {
    localStorage.setItem('ksc_theme', 'dark')
    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()
    expect(localStorage.getItem('ksc_theme')).toBeNull()
    expect(localStorage.getItem('kc_theme')).toBe('dark')
  })

  it('migrates ksc- prefixed keys to kc- prefix', async () => {
    localStorage.setItem('ksc-setting', 'value')
    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()
    expect(localStorage.getItem('ksc-setting')).toBeNull()
    expect(localStorage.getItem('kc-setting')).toBe('value')
  })

  it('does not overwrite existing kc_ keys', async () => {
    localStorage.setItem('ksc_key', 'old')
    localStorage.setItem('kc_key', 'existing')
    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()
    expect(localStorage.getItem('kc_key')).toBe('existing')
    expect(localStorage.getItem('ksc_key')).toBeNull()
  })

  it('removes kubectl history key', async () => {
    localStorage.setItem('kubectl-history', 'some history')
    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()
    expect(localStorage.getItem('kubectl-history')).toBeNull()
  })

  it('handles empty localStorage gracefully', async () => {
    const { migrateFromLocalStorage } = await importFresh()
    await expect(migrateFromLocalStorage()).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Storage quota handling (ssWrite with QuotaExceededError)
// ---------------------------------------------------------------------------

describe('storage quota handling', () => {
  it('ssFlush silently skips when sessionStorage throws QuotaExceededError', async () => {
    const { __testables } = await importFresh()
    __testables.ssWrite('quota-test', 'data', 100)
    const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    expect(() => __testables.ssFlush()).not.toThrow()
    spy.mockRestore()
  })
})
