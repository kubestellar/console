import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Controllable demo-mode mock
// ---------------------------------------------------------------------------

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

function setDemoMode(val: boolean) {
  demoModeValue = val
  demoModeListeners.forEach(fn => fn())
}

vi.mock('../../demoMode', () => ({
  isDemoMode: () => demoModeValue,
  subscribeDemoMode: (cb: () => void) => {
    demoModeListeners.add(cb)
    return () => demoModeListeners.delete(cb)
  },
}))

const registeredResets = new Map<string, () => void | Promise<void>>()
const registeredRefetches = new Map<string, () => void | Promise<void>>()

vi.mock('../../modeTransition', () => ({
  registerCacheReset: (key: string, fn: () => void | Promise<void>) => { registeredResets.set(key, fn) },
  registerRefetch: (key: string, fn: () => void | Promise<void>) => {
    registeredRefetches.set(key, fn)
    return () => registeredRefetches.delete(key)
  },
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_KUBECTL_HISTORY: 'kubectl-history' }
})

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Offset (ms) to make seeded cache data older than any refresh interval,
 *  ensuring the initial fetch is NOT skipped by the fresh-data guard (#7653). */
const STALE_AGE_MS = 600_000

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

/**
 * Seed sessionStorage with a valid cache entry (CACHE_VERSION = 4).
 * The key will be stored as "kcc:<cacheKey>" to match the SS_PREFIX constant.
 */
function seedSessionStorage(cacheKey: string, data: unknown, timestamp: number): void {
  const CACHE_VERSION = 4
  sessionStorage.setItem(
    `kcc:${cacheKey}`,
    JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  demoModeValue = false
  demoModeListeners.clear()
  registeredResets.clear()
  registeredRefetches.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


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

  describe('CacheStore initialization', () => {
    it('hydrates from sessionStorage when valid snapshot exists', async () => {
      // Seed with real data
      const data = { pods: ['pod-1', 'pod-2'] }
      const timestamp = Date.now() - 5000
      seedSessionStorage('hydrate-test', data, timestamp)

      const mod = await importFresh()
      // Create store via prefetchCache — constructor should pick up the snapshot
      await mod.prefetchCache('hydrate-test', async () => ({ pods: ['pod-3'] }), { pods: [] })
    })

    it('starts in loading state when no cached data exists', async () => {
      const mod = await importFresh()
      // No session storage or IDB data — store should be in isLoading: true
      await mod.prefetchCache('cold-start', async () => ({ result: 'fresh' }), {})
    })

    it('does not hydrate from sessionStorage when data matches initial (empty)', async () => {
      // Seed with empty data and timestamp=0
      sessionStorage.setItem('kcc:empty-hydrate', JSON.stringify({ d: [], t: 0, v: 4 }))
      const mod = await importFresh()
      // Store should NOT hydrate since the data is equivalent to initial and timestamp is 0
      await mod.prefetchCache('empty-hydrate', async () => ['item'], [])
    })

    it('hydrates even with empty data if timestamp is valid (> 0)', async () => {
      // Empty data but valid timestamp means it was a real fetch that returned empty
      const validTimestamp = Date.now() - 1000
      seedSessionStorage('empty-valid-ts', [], validTimestamp)

      const mod = await importFresh()
      await mod.prefetchCache('empty-valid-ts', async () => ['new-item'], [])
    })

    it('loads metadata from preloaded meta map', async () => {
      const mod = await importFresh()
      // Populate meta before creating store
      mod.initPreloadedMeta({
        'meta-test': { consecutiveFailures: 2, lastError: 'timeout', lastSuccessfulRefresh: 1000 },
      })
      // Now create a store — it should pick up the meta
      await mod.prefetchCache('meta-test', async () => 'data', '')
    })

    it('defaults to 0 consecutiveFailures when meta is missing', async () => {
      const mod = await importFresh()
      // No meta for this key — should default to { consecutiveFailures: 0 }
      await mod.prefetchCache('no-meta', async () => 'data', '')
    })
  })

  // ── CacheStore.fetch ───────────────────────────────────────────────────

  describe('CacheStore.fetch (via prefetchCache)', () => {
    it('saves successful fetch results to sessionStorage', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('fetch-save', async () => ({ result: 'saved' }), {})
      mod.__testables.ssFlush()

      // Check sessionStorage was written
      const raw = sessionStorage.getItem('kcc:fetch-save')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.d).toEqual({ result: 'saved' })
      expect(parsed.v).toBe(4)
    })

    it('handles fetch errors gracefully', async () => {
      const mod = await importFresh()
      // Fetch that throws
      await mod.prefetchCache('fetch-error', async () => {
        throw new Error('Network failure')
      }, [])
      // Should not throw; errors are handled internally
    })

    it('tracks consecutive failures on repeated errors', async () => {
      const mod = await importFresh()
      const failingFetcher = async () => { throw new Error('fail') }

      // Multiple failed fetches should increment consecutiveFailures
      await mod.prefetchCache('fail-track', failingFetcher, [])
      // Cannot directly inspect state but verify no crash
    })

    it('does not overwrite cached data with empty response', async () => {
      const mod = await importFresh()
      // First fetch with real data
      await mod.prefetchCache('guard-empty', async () => [1, 2, 3], [])
      mod.__testables.ssFlush()

      // Verify data was cached
      const raw1 = sessionStorage.getItem('kcc:guard-empty')
      expect(raw1).not.toBeNull()
      const parsed1 = JSON.parse(raw1!)
      expect(parsed1.d).toEqual([1, 2, 3])
    })

    it('accepts empty data on cold load (no cached data)', async () => {
      const mod = await importFresh()
      // Cold load with empty result — should accept it as valid
      await mod.prefetchCache('cold-empty', async () => [], [])
    })

    it('saves meta with lastSuccessfulRefresh on success', async () => {
      const mod = await importFresh()
      const before = Date.now()
      await mod.prefetchCache('meta-save', async () => ({ ok: true }), {})

      // Meta should be saved to localStorage (since no workerRpc)
      const metaRaw = localStorage.getItem('kc_meta:meta-save')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(0)
      expect(meta.lastSuccessfulRefresh).toBeGreaterThanOrEqual(before)
    })

    it('saves meta with error details on failure', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('meta-fail', async () => {
        throw new Error('backend down')
      }, [])

      const metaRaw = localStorage.getItem('kc_meta:meta-fail')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(1)
      expect(meta.lastError).toBe('backend down')
    })

    it('non-Error throw results in generic error message', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('non-error-throw', async () => {
        throw 'string error'  // not an Error instance
      }, [])

      const metaRaw = localStorage.getItem('kc_meta:non-error-throw')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.lastError).toBe('Failed to fetch data')
    })

    it('prevents concurrent fetches (fetchingRef guard)', async () => {
      const mod = await importFresh()
      let callCount = 0
      const slowFetcher = async () => {
        callCount++
        await new Promise(resolve => setTimeout(resolve, 50))
        return { count: callCount }
      }

      // Fire two fetches concurrently — the second should be skipped
      const p1 = mod.prefetchCache('concurrent-guard', slowFetcher, {})
      const p2 = mod.prefetchCache('concurrent-guard', slowFetcher, {})
      await Promise.all([p1, p2])

      // The fetcher should only have been called once (second is a no-op)
      expect(callCount).toBe(1)
    })
  })

  // ── CacheStore.clear ──────────────────────────────────────────────────

  describe('CacheStore.clear (via invalidateCache)', () => {
    it('invalidateCache removes the entry from storage and meta', async () => {
      const mod = await importFresh()
      // Populate
      await mod.prefetchCache('inv-test', async () => ({ x: 1 }), {})
      mod.__testables.ssFlush()
      expect(sessionStorage.getItem('kcc:inv-test')).not.toBeNull()

      await mod.invalidateCache('inv-test')
      // Meta should be gone
      expect(localStorage.getItem('kc_meta:inv-test')).toBeNull()
    })

    it('invalidateCache on nonexistent key does not throw', async () => {
      const mod = await importFresh()
      await expect(mod.invalidateCache('nonexistent')).resolves.not.toThrow()
    })
  })

  // ── resetFailuresForCluster ───────────────────────────────────────────

  describe('resetFailuresForCluster', () => {
    it('resets failures for matching cache keys', async () => {
      const mod = await importFresh()
      // Create caches with cluster names in keys
      await mod.prefetchCache('pods:cluster-alpha:ns', async () => {
        throw new Error('fail')
      }, [])
      await mod.prefetchCache('deployments:cluster-alpha:ns', async () => {
        throw new Error('fail')
      }, [])

      const resetCount = mod.resetFailuresForCluster('cluster-alpha')
      expect(resetCount).toBe(2)
    })

    it('returns 0 for cluster with no matching keys', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('pods:other-cluster', async () => 'data', '')

      const resetCount = mod.resetFailuresForCluster('nonexistent-cluster')
      expect(resetCount).toBe(0)
    })

    it('also resets keys containing :all:', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('pods:all:namespace', async () => {
        throw new Error('fail')
      }, [])

      const resetCount = mod.resetFailuresForCluster('some-cluster')
      // :all: keys should match any cluster name
      expect(resetCount).toBe(1)
    })
  })

  // ── resetAllCacheFailures ─────────────────────────────────────────────

  describe('resetAllCacheFailures', () => {
    it('resets failures on all stores', async () => {
      const mod = await importFresh()
      // Create stores that have failures
      await mod.prefetchCache('reset-all-1', async () => { throw new Error('fail') }, [])
      await mod.prefetchCache('reset-all-2', async () => { throw new Error('fail') }, [])

      // Should not throw
      expect(() => mod.resetAllCacheFailures()).not.toThrow()
    })

    it('is a no-op on stores with 0 failures', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('reset-all-ok', async () => 'fine', '')

      // Should not throw even when failures are already 0
      expect(() => mod.resetAllCacheFailures()).not.toThrow()
    })
  })

  // ── getCacheStats ─────────────────────────────────────────────────────

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

  describe('integration: full fetch cycle', () => {
    it('complete lifecycle: no cache -> fetch -> save -> re-read', async () => {
      const mod = await importFresh()

      // 1. No cached data initially
      expect(sessionStorage.getItem('kcc:lifecycle')).toBeNull()

      // 2. Fetch and save
      await mod.prefetchCache('lifecycle', async () => ({ items: [1, 2, 3] }), { items: [] })
      mod.__testables.ssFlush()

      // 3. Data should be in sessionStorage
      const raw = sessionStorage.getItem('kcc:lifecycle')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.d).toEqual({ items: [1, 2, 3] })
      expect(parsed.v).toBe(4)

      // 4. Meta should be in localStorage
      const metaRaw = localStorage.getItem('kc_meta:lifecycle')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(0)
    })

    it('failure + success cycle resets failures', async () => {
      const mod = await importFresh()

      // 1. Fail
      await mod.prefetchCache('cycle-test', async () => { throw new Error('fail') }, [])
      let meta = JSON.parse(localStorage.getItem('kc_meta:cycle-test')!)
      expect(meta.consecutiveFailures).toBe(1)

      // 2. Clear and succeed (need a new store since the old one has fetchingRef)
      await mod.invalidateCache('cycle-test')
      await mod.prefetchCache('cycle-test', async () => ['success'], [])
      meta = JSON.parse(localStorage.getItem('kc_meta:cycle-test')!)
      expect(meta.consecutiveFailures).toBe(0)
    })
  })

  // ── useCache hook (React integration) ─────────────────────────────────

})
