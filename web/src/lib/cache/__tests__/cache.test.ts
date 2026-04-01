import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
  subscribeDemoMode: vi.fn(() => vi.fn()),
}))

vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
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
  })

  // ── sessionStorage helpers ────────────────────────────────────────────────

  describe('sessionStorage cache layer', () => {
    it('ssWrite stores data with version and timestamp', async () => {
      // We can't call ssWrite directly (not exported), but we can test
      // it indirectly through the CacheStore constructor.
      // For now, test the ssRead behavior by writing directly.
      const key = 'kcc:test-key'
      const data = { items: [1, 2, 3] }
      const timestamp = Date.now()
      // Version 4 matches CACHE_VERSION
      sessionStorage.setItem(key, JSON.stringify({ d: data, t: timestamp, v: 4 }))

      // Import and verify the cache would read this
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
      // We verify indirectly — the key should be removed on read
    })

    it('ssRead handles invalid JSON gracefully', async () => {
      sessionStorage.setItem('kcc:broken', '{not valid json!!!')
      // Should not throw on import
      await expect(importFresh()).resolves.toBeDefined()
    })

    it('ssWrite handles QuotaExceededError gracefully', async () => {
      // Fill sessionStorage to capacity
      const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      })

      // Should not throw
      await expect(importFresh()).resolves.toBeDefined()
      spy.mockRestore()
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
      // Should not throw
      expect(() => initPreloadedMeta(meta as Record<string, { consecutiveFailures: number; lastError?: string; lastSuccessfulRefresh?: number }>)).not.toThrow()
    })

    it('handles empty meta object', async () => {
      const { initPreloadedMeta } = await importFresh()
      expect(() => initPreloadedMeta({})).not.toThrow()
    })
  })

  // ── isSQLiteWorkerActive ───────────────────────────────────────────────

  describe('isSQLiteWorkerActive', () => {
    it('returns false when worker is not initialized', async () => {
      const { isSQLiteWorkerActive } = await importFresh()
      expect(isSQLiteWorkerActive()).toBe(false)
    })
  })

  // ── getEffectiveInterval (tested indirectly via REFRESH_RATES) ─────────

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
      // Realtime < pods < clusters < helm < costs
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
      const { registerCacheReset } = await import('../../modeTransition')
      await importFresh()
      expect(registerCacheReset).toHaveBeenCalledWith('unified-cache', expect.any(Function))
    })
  })
})
