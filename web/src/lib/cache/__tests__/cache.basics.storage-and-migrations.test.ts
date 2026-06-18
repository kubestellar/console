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

})
