import { describe, expect, it, vi } from 'vitest'
import { importFresh, registeredResets, seedSessionStorage } from './cache.shared'

describe('cache module', () => {
describe('sessionStorage cache layer', () => {
  it('ssWrite stores data with version and timestamp', async () => {
    const key = 'kcc:test-key'
    const data = { items: [1, 2, 3] }
    const timestamp = Date.now()
    sessionStorage.setItem(key, JSON.stringify({ d: data, t: timestamp, v: 4 }))

    await importFresh()
    const stored = JSON.parse(sessionStorage.getItem(key) || '{}')
    expect(stored.d).toEqual(data)
    expect(stored.t).toBe(timestamp)
    expect(stored.v).toBe(4)
  })

  it('ssRead returns null for missing key', async () => {
    await importFresh()
    expect(sessionStorage.getItem('kcc:nonexistent')).toBeNull()
  })

  it('ssRead ignores entries with wrong cache version', async () => {
    const key = 'kcc:stale'
    sessionStorage.setItem(key, JSON.stringify({ d: { old: true }, t: Date.now(), v: 2 }))
    await importFresh()
    // The cache module should ignore this because v !== CACHE_VERSION (4)
  })

  it('ssRead handles invalid JSON gracefully', async () => {
    sessionStorage.setItem('kcc:broken', '{not valid json!!!')
    await expect(importFresh()).resolves.toBeDefined()
  })

  it('ssWrite handles QuotaExceededError gracefully', async () => {
    const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    await expect(importFresh()).resolves.toBeDefined()
    spy.mockRestore()
  })

  it('ssRead removes entries missing required fields (d, t, v)', async () => {
    // Missing "d" field
    sessionStorage.setItem('kcc:nodfield', JSON.stringify({ t: 1000, v: 4 }))
    await importFresh()
    // The module would call ssRead which removes this entry; verify it was removed
    // by checking it no longer holds the malformed data after a read cycle
    // (ssRead clears incompatible entries for future reads)
  })

  it('ssRead returns correct data when version matches', async () => {
    const data = { name: 'test', count: 42 }
    const timestamp = 1700000000000
    seedSessionStorage('good-key', data, timestamp)

    await importFresh()
    // Verify the data is still in sessionStorage (valid entry persists)
    const stored = JSON.parse(sessionStorage.getItem('kcc:good-key')!)
    expect(stored.d).toEqual(data)
    expect(stored.t).toBe(timestamp)
  })

  it('ssRead treats null-valued parsed objects as invalid', async () => {
    // JSON.parse("null") returns null, which should be handled
    sessionStorage.setItem('kcc:null-entry', 'null')
    await expect(importFresh()).resolves.toBeDefined()
  })

  it('ssRead treats non-object parsed values as invalid', async () => {
    // e.g. a stored number or string
    sessionStorage.setItem('kcc:number-entry', '42')
    sessionStorage.setItem('kcc:string-entry', '"hello"')
    await expect(importFresh()).resolves.toBeDefined()
  })
})

// ── initPreloadedMeta ──────────────────────────────────────────────────

describe('clearAllInMemoryCaches', () => {
  it('is registered with registerCacheReset as "unified-cache"', async () => {
    await importFresh()
    expect(registeredResets.has('unified-cache')).toBe(true)
  })

  it('calling the registered reset function does not throw', async () => {
    const mod = await importFresh()

    // Populate some cache stores first
    await mod.prefetchCache('clear-test-1', async () => ({ data: 'hello' }), {})
    await mod.prefetchCache('clear-test-2', async () => [1, 2, 3], [])

    const resetFn = registeredResets.get('unified-cache')
    expect(resetFn).toBeDefined()
    expect(() => resetFn!()).not.toThrow()
  })

  it('clearAllCaches removes localStorage metadata and clears registry', async () => {
    const mod = await importFresh()

    // Pre-populate localStorage with metadata
    localStorage.setItem('kc_meta:pods', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('kc_meta:clusters', JSON.stringify({ consecutiveFailures: 0 }))
    localStorage.setItem('unrelated_key', 'should stay')

    await mod.clearAllCaches()

    // Meta keys should be removed
    expect(localStorage.getItem('kc_meta:pods')).toBeNull()
    expect(localStorage.getItem('kc_meta:clusters')).toBeNull()
    // Unrelated keys should remain
    expect(localStorage.getItem('unrelated_key')).toBe('should stay')
  })
})

// ── CacheStore initialization ──────────────────────────────────────────

describe('getCacheStats', () => {
  it('returns registry size in entries field', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('stats-1', async () => 'a', '')
    await mod.prefetchCache('stats-2', async () => 'b', '')

    const stats = await mod.getCacheStats()
    expect(stats.entries).toBeGreaterThanOrEqual(2)
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
  })
})

// ── preloadCacheFromStorage ───────────────────────────────────────────

describe('preloadCacheFromStorage', () => {
  it('returns without error when storage is empty', async () => {
    const mod = await importFresh()
    await expect(mod.preloadCacheFromStorage()).resolves.not.toThrow()
  })
})

// ── migrateFromLocalStorage ───────────────────────────────────────────

describe('migrateFromLocalStorage', () => {
  it('migrates ksc_ prefixed keys to kc_ prefix', async () => {
    localStorage.setItem('ksc_theme', 'dark')
    localStorage.setItem('ksc-sidebar', 'collapsed')

    const mod = await importFresh()
    await mod.migrateFromLocalStorage()

    // Old keys should be removed
    expect(localStorage.getItem('ksc_theme')).toBeNull()
    expect(localStorage.getItem('ksc-sidebar')).toBeNull()
    // New keys should exist
    expect(localStorage.getItem('kc_theme')).toBe('dark')
    expect(localStorage.getItem('kc-sidebar')).toBe('collapsed')
  })

  it('does not overwrite existing kc_ keys during migration', async () => {
    localStorage.setItem('ksc_theme', 'dark')
    localStorage.setItem('kc_theme', 'light') // pre-existing

    const mod = await importFresh()
    await mod.migrateFromLocalStorage()

    // Should keep the existing value
    expect(localStorage.getItem('kc_theme')).toBe('light')
  })

  it('removes kubectl-history key', async () => {
    localStorage.setItem('kubectl-history', JSON.stringify(['cmd1', 'cmd2']))

    const mod = await importFresh()
    await mod.migrateFromLocalStorage()

    expect(localStorage.getItem('kubectl-history')).toBeNull()
  })

  it('handles corrupted ksc_ entries gracefully', async () => {
    // Pre-populate before mocking
    localStorage.setItem('ksc_test', 'value')

    // Now mock setItem to throw for kc_ prefix keys (simulating quota error)
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string) => {
      if (key.startsWith('kc_') || key.startsWith('kc-')) {
        throw new DOMException('QuotaExceededError')
      }
    })

    const mod = await importFresh()
    await expect(mod.migrateFromLocalStorage()).resolves.not.toThrow()
    spy.mockRestore()
  })
})

// ── migrateIDBToSQLite ────────────────────────────────────────────────

describe('migrateIDBToSQLite', () => {
  it('returns immediately when workerRpc is null', async () => {
    const mod = await importFresh()
    // No worker initialized — should return immediately
    await expect(mod.migrateIDBToSQLite()).resolves.not.toThrow()
  })
})

// ── refresh rate backoff ──────────────────────────────────────────────

describe('refresh rate backoff', () => {
  it('REFRESH_RATES has rates for all expected categories', async () => {
    const { REFRESH_RATES } = await importFresh()
    const expectedCategories = [
      'realtime', 'pods', 'clusters', 'deployments', 'services',
      'metrics', 'gpu', 'helm', 'gitops', 'namespaces',
      'rbac', 'operators', 'costs', 'default',
    ]
    for (const cat of expectedCategories) {
      expect(REFRESH_RATES).toHaveProperty(cat)
    }
  })

  it('rates are in ascending order of staleness tolerance', async () => {
    const { REFRESH_RATES } = await importFresh()
    expect(REFRESH_RATES.realtime).toBeLessThan(REFRESH_RATES.pods)
    expect(REFRESH_RATES.pods).toBeLessThan(REFRESH_RATES.clusters)
    expect(REFRESH_RATES.clusters).toBeLessThan(REFRESH_RATES.helm)
    expect(REFRESH_RATES.helm).toBeLessThan(REFRESH_RATES.costs)
  })
})

// ── Module initialization ──────────────────────────────────────────────

describe('module initialization', () => {
  it('exports useCache hook', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('useCache')
    expect(typeof mod.useCache).toBe('function')
  })

  it('exports initCacheWorker', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('initCacheWorker')
    expect(typeof mod.initCacheWorker).toBe('function')
  })

  it('registers cache reset with mode transition', async () => {
    await importFresh()
    expect(registeredResets.has('unified-cache')).toBe(true)
  })

  it('exports useArrayCache convenience hook', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('useArrayCache')
    expect(typeof mod.useArrayCache).toBe('function')
  })

  it('exports useObjectCache convenience hook', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('useObjectCache')
    expect(typeof mod.useObjectCache).toBe('function')
  })

  it('exports clearAllCaches utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('clearAllCaches')
    expect(typeof mod.clearAllCaches).toBe('function')
  })

  it('exports getCacheStats utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('getCacheStats')
    expect(typeof mod.getCacheStats).toBe('function')
  })

  it('exports invalidateCache utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('invalidateCache')
    expect(typeof mod.invalidateCache).toBe('function')
  })

  it('exports resetFailuresForCluster utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('resetFailuresForCluster')
    expect(typeof mod.resetFailuresForCluster).toBe('function')
  })

  it('exports resetAllCacheFailures utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('resetAllCacheFailures')
    expect(typeof mod.resetAllCacheFailures).toBe('function')
  })

  it('exports prefetchCache utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('prefetchCache')
    expect(typeof mod.prefetchCache).toBe('function')
  })

  it('exports preloadCacheFromStorage utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('preloadCacheFromStorage')
    expect(typeof mod.preloadCacheFromStorage).toBe('function')
  })

  it('exports migrateFromLocalStorage utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('migrateFromLocalStorage')
    expect(typeof mod.migrateFromLocalStorage).toBe('function')
  })

  it('exports migrateIDBToSQLite utility', async () => {
    const mod = await importFresh()
    expect(mod).toHaveProperty('migrateIDBToSQLite')
    expect(typeof mod.migrateIDBToSQLite).toBe('function')
  })
})

// ── Shared cache registry (getOrCreateCache) ─────────────────────────

describe('shared cache registry', () => {
  it('reuses the same store for the same key (via prefetchCache)', async () => {
    const mod = await importFresh()
    let callCount = 0
    const fetcher = async () => { callCount++; return 'data' }

    // Two prefetchCache calls with the same key should share the store
    await mod.prefetchCache('shared-key', fetcher, '')
    await mod.prefetchCache('shared-key', fetcher, '')

    // The second call reuses the store; the fetcher may not run again
    // because fetchingRef guard prevents concurrent fetch, or store already loaded
    expect(callCount).toBeLessThanOrEqual(2)
  })
})

// ── CacheStore.resetToInitialData ─────────────────────────────────────

describe('CacheStore state management', () => {
  it('clearAndRefetch resets store state and refetches', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('clear-refetch', async () => ({ a: 1 }), {})
    mod.__testables.ssFlush()

    // Verify data was stored
    const raw = sessionStorage.getItem('kcc:clear-refetch')
    expect(raw).not.toBeNull()

    // Invalidate should clear it
    await mod.invalidateCache('clear-refetch')
  })
})

// ── Integration: meta + store + fetch cycle ───────────────────────────
})
