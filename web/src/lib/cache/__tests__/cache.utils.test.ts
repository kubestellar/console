import { describe, it, expect, vi } from 'vitest'
import { importFresh, registeredResets } from './cache.test.shared'

describe('cache module', () => {
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
