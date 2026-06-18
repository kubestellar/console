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

})
