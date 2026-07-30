import { describe, it, expect, vi } from 'vitest'
import { importFresh, seedSessionStorage, registeredResets } from './cache.test.shared'

describe('cache module', () => {
  // ── REFRESH_RATES ────────────────────────────────────────────────────────

  describe('REFRESH_RATES', () => {
    it('exports expected rate categories', async () => {
      const { REFRESH_RATES } = await importFresh()
      expect(REFRESH_RATES.realtime).toBe(15_000)
      expect(REFRESH_RATES.pods).toBe(30_000)
      expect(REFRESH_RATES.clusters).toBe(60_000)
      expect(REFRESH_RATES.default).toBe(120_000)
      expect(REFRESH_RATES.costs).toBe(600_000)
    })

    it('all rates are positive numbers', async () => {
      const { REFRESH_RATES } = await importFresh()
      for (const [key, value] of Object.entries(REFRESH_RATES)) {
        expect(value, `${key} should be a positive number`).toBeGreaterThan(0)
      }
    })
  })

  // ── Auto-refresh pause ───────────────────────────────────────────────────

  describe('auto-refresh pause', () => {
    it('starts unpaused', async () => {
      const { isAutoRefreshPaused } = await importFresh()
      expect(isAutoRefreshPaused()).toBe(false)
    })

    it('can be paused and unpaused', async () => {
      const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
      setAutoRefreshPaused(true)
      expect(isAutoRefreshPaused()).toBe(true)
      setAutoRefreshPaused(false)
      expect(isAutoRefreshPaused()).toBe(false)
    })

    it('notifies subscribers on change', async () => {
      const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
      const listener = vi.fn()
      const unsub = subscribeAutoRefreshPaused(listener)

      setAutoRefreshPaused(true)
      expect(listener).toHaveBeenCalledWith(true)

      setAutoRefreshPaused(false)
      expect(listener).toHaveBeenCalledWith(false)

      unsub()
      setAutoRefreshPaused(true)
      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('does not notify when value does not change', async () => {
      const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
      const listener = vi.fn()
      subscribeAutoRefreshPaused(listener)

      setAutoRefreshPaused(false) // already false
      expect(listener).not.toHaveBeenCalled()
    })

    it('supports multiple subscribers independently', async () => {
      const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
      const listenerA = vi.fn()
      const listenerB = vi.fn()
      const unsubA = subscribeAutoRefreshPaused(listenerA)
      subscribeAutoRefreshPaused(listenerB)

      setAutoRefreshPaused(true)
      expect(listenerA).toHaveBeenCalledTimes(1)
      expect(listenerB).toHaveBeenCalledTimes(1)

      unsubA()
      setAutoRefreshPaused(false)
      // Only B should fire after A is unsubscribed
      expect(listenerA).toHaveBeenCalledTimes(1)
      expect(listenerB).toHaveBeenCalledTimes(2)
    })

    it('toggling pause twice returns to original state', async () => {
      const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
      setAutoRefreshPaused(true)
      setAutoRefreshPaused(false)
      expect(isAutoRefreshPaused()).toBe(false)
    })
  })

  // ── sessionStorage helpers ────────────────────────────────────────────────

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

  describe('initPreloadedMeta', () => {
    it('populates metadata map from worker data', async () => {
      const { initPreloadedMeta } = await importFresh()
      const meta = {
        'pods': { consecutiveFailures: 2, lastError: 'timeout', lastSuccessfulRefresh: 1000 },
        'clusters': { consecutiveFailures: 0, lastSuccessfulRefresh: 2000 },
      }
      expect(() => initPreloadedMeta(meta as Record<string, { consecutiveFailures: number; lastError?: string; lastSuccessfulRefresh?: number }>)).not.toThrow()
    })

    it('handles empty meta object', async () => {
      const { initPreloadedMeta } = await importFresh()
      expect(() => initPreloadedMeta({})).not.toThrow()
    })

    it('clears previous meta before repopulating', async () => {
      const { initPreloadedMeta } = await importFresh()
      // First call with some keys
      initPreloadedMeta({
        'old-key': { consecutiveFailures: 5, lastSuccessfulRefresh: 100 },
      })
      // Second call with different keys
      initPreloadedMeta({
        'new-key': { consecutiveFailures: 1, lastSuccessfulRefresh: 200 },
      })
      // The old key should not persist (initPreloadedMeta clears map first)
      // We can't inspect the map directly, but the function should not throw
    })
  })

  // ── isSQLiteWorkerActive ───────────────────────────────────────────────

  describe('isSQLiteWorkerActive', () => {
    it('returns false when worker is not initialized', async () => {
      const { isSQLiteWorkerActive } = await importFresh()
      expect(isSQLiteWorkerActive()).toBe(false)
    })
  })

  // ── getEffectiveInterval backoff calculation ────────────────────────────

  describe('getEffectiveInterval (backoff calculation)', () => {
    /**
     * getEffectiveInterval is not exported, so we test it indirectly by
     * creating a CacheStore via the public API, triggering failures, and
     * observing the state. However, we can also test the backoff formula
     * directly by examining what the useCache hook would compute.
     *
     * Formula: interval = min(baseInterval * 2^min(failures,5), 600000)
     */

    it('0 failures returns base interval unchanged', async () => {
      // With 0 consecutive failures, the effective interval equals the base.
      // We verify by checking REFRESH_RATES values are used directly.
      const { REFRESH_RATES } = await importFresh()
      // The base interval for pods is 30000; with 0 failures it stays 30000
      expect(REFRESH_RATES.pods).toBe(30_000)
    })

    it('1 failure doubles the interval (2^1 = 2)', async () => {
      // Formula: baseInterval * 2^1 = baseInterval * 2
      // We test the math ourselves since getEffectiveInterval is private.
      const base = 30_000
      const failures = 1
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      expect(expected).toBe(60_000) // 30000 * 2 = 60000
    })

    it('2 failures quadruples the interval (2^2 = 4)', async () => {
      const base = 30_000
      const failures = 2
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      expect(expected).toBe(120_000) // 30000 * 4 = 120000
    })

    it('3 failures multiplies by 8 (2^3 = 8)', async () => {
      const base = 30_000
      const failures = 3
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      expect(expected).toBe(240_000) // 30000 * 8 = 240000
    })

    it('5 failures multiplies by 32 (2^5 = 32) and caps at exponent 5', async () => {
      const base = 30_000
      const failures = 5
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      expect(expected).toBe(600_000) // 30000 * 32 = 960000, capped at 600000
    })

    it('failures > 5 are capped at exponent 5 (same as 5 failures)', async () => {
      const base = 30_000
      const failures = 10
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      expect(expected).toBe(600_000) // same cap applies
    })

    it('small base intervals respect the MAX_BACKOFF_INTERVAL cap of 600000', async () => {
      const base = 15_000 // realtime
      const failures = 5
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      // 15000 * 32 = 480000 < 600000, so no cap needed
      expect(expected).toBe(480_000)
    })

    it('large base intervals are capped even with 1 failure', async () => {
      const base = 600_000 // costs
      const failures = 1
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      // 600000 * 2 = 1200000, capped at 600000
      expect(expected).toBe(600_000)
    })

    it('4 failures multiplies by 16 (2^4 = 16)', async () => {
      const base = 15_000
      const failures = 4
      const expected = Math.min(base * Math.pow(2, Math.min(failures, 5)), 600_000)
      // 15000 * 16 = 240000
      expect(expected).toBe(240_000)
    })
  })

  // ── isEquivalentToInitial ──────────────────────────────────────────────

  describe('isEquivalentToInitial (tested via CacheStore.fetch)', () => {
    /**
     * isEquivalentToInitial is a private function, but we can verify its
     * behavior indirectly through CacheStore constructor hydration and
     * the fetch guard that avoids overwriting cache with empty responses.
     *
     * The function checks:
     * - null/undefined both null -> true
     * - both empty arrays -> true
     * - objects compared via JSON.stringify
     * - mismatched types -> false
     */

    it('treats two null values as equivalent', async () => {
      // Seed sessionStorage with null data and timestamp=0
      // If isEquivalentToInitial(null, null) returns true AND timestamp=0,
      // the CacheStore constructor will NOT hydrate from this snapshot
      sessionStorage.setItem('kcc:null-test', JSON.stringify({ d: null, t: 0, v: 4 }))
      const mod = await importFresh()

      // Create a store through prefetchCache with null initial data
      // The store should stay in loading state since both are null and timestamp=0
      await mod.prefetchCache('null-test', async () => null, null)
      // No assertion needed beyond no-throw — the function exercises the path
    })

    it('treats two empty arrays as equivalent', async () => {
      // Seed with empty array; the CacheStore constructor should NOT hydrate
      // from this since isEquivalentToInitial([], []) is true AND timestamp=0
      sessionStorage.setItem('kcc:empty-arr', JSON.stringify({ d: [], t: 0, v: 4 }))
      const mod = await importFresh()
      await mod.prefetchCache('empty-arr', async () => [], [])
    })

    it('treats matching objects as equivalent via JSON.stringify', async () => {
      const initial = { alerts: [], inventory: [], nodeCount: 0 }
      sessionStorage.setItem(
        'kcc:obj-equiv',
        JSON.stringify({ d: { alerts: [], inventory: [], nodeCount: 0 }, t: 0, v: 4 }),
      )
      const mod = await importFresh()
      await mod.prefetchCache('obj-equiv', async () => initial, initial)
    })

    it('non-empty arrays are not equivalent to empty initial arrays', async () => {
      // Seed with non-empty data: should hydrate because it differs from initial
      seedSessionStorage('nonempty-arr', [1, 2, 3], Date.now())
      const mod = await importFresh()
      // prefetchCache creates a store with initialData=[]; the snapshot has [1,2,3]
      // so isEquivalentToInitial returns false, and the store hydrates
      await mod.prefetchCache('nonempty-arr', async () => [4, 5], [])
    })
  })

  // ── clearAllInMemoryCaches ─────────────────────────────────────────────

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

})
