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



describe('cache — migrations/edge cases', () => {
  describe('CacheStore.saveMeta — localStorage fallback', () => {
    it('writes meta to localStorage when no workerRpc is active', async () => {
      const mod = await importFresh()
      // Verify isSQLiteWorkerActive is false (no worker)
      expect(mod.isSQLiteWorkerActive()).toBe(false)

      await mod.prefetchCache('meta-ls-fallback', async () => ({ ok: true }), {})

      const metaRaw = localStorage.getItem('kc_meta:meta-ls-fallback')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(0)
      expect(meta.lastSuccessfulRefresh).toBeGreaterThan(0)
    })

    it('handles localStorage.setItem error gracefully in saveMeta', async () => {
      const mod = await importFresh()
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })

      // Should not throw — saveMeta catches errors
      await expect(
        mod.prefetchCache('meta-ls-error', async () => 'ok', '')
      ).resolves.toBeUndefined()

      spy.mockRestore()
    })
  })

  // ── CacheStore.destroy ───────────────────────────────────────────────────


  describe('CacheStore.loadFromStorage — early return paths', () => {
    it('skips storage load when persist=false', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['fetched'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'no-persist-load',
          fetcher,
          initialData: [] as string[],
          persist: false,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['fetched'])
      // No sessionStorage entry
      expect(sessionStorage.getItem('kcc:no-persist-load')).toBeNull()
    })

    it('skips storage load when already hydrated from sessionStorage', async () => {
      seedSessionStorage('already-hydrated', ['from-ss'], Date.now())
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['from-fetcher'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'already-hydrated',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      // Should hydrate from sessionStorage immediately
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toEqual(['from-ss'])
    })
  })

  // ── CacheStore.saveToStorage — error handling ────────────────────────────


  describe('CacheStore.saveToStorage — error path', () => {
    it('logs error but does not throw when cacheStorage.set fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mod = await importFresh()

      // We cannot directly mock cacheStorage since it's internal, but we can
      // verify the fetch succeeds even if sessionStorage write fails
      const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string) => {
        if (key.startsWith('kcc:')) {
          throw new DOMException('QuotaExceededError')
        }
      })

      await expect(
        mod.prefetchCache('save-error', async () => ['data'], [])
      ).resolves.toBeUndefined()

      spy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  // ── migrateFromLocalStorage — kc_cache: prefix migration ─────────────────


  describe('migrateFromLocalStorage — kc_cache: prefix migration', () => {
    it('migrates kc_cache: entries to cacheStorage and removes old keys', async () => {
      localStorage.setItem('kc_cache:pods', JSON.stringify({ data: ['pod-1'], timestamp: 1000, version: 4 }))
      const mod = await importFresh()
      await mod.migrateFromLocalStorage()
      // Old key should be removed
      expect(localStorage.getItem('kc_cache:pods')).toBeNull()
    })

    it('removes kc_cache: entries even if JSON is invalid', async () => {
      localStorage.setItem('kc_cache:broken', 'not-json')
      const mod = await importFresh()
      await mod.migrateFromLocalStorage()
      expect(localStorage.getItem('kc_cache:broken')).toBeNull()
    })

    it('skips entries where data is undefined', async () => {
      localStorage.setItem('kc_cache:empty', JSON.stringify({ timestamp: 1000 }))
      const mod = await importFresh()
      await mod.migrateFromLocalStorage()
      expect(localStorage.getItem('kc_cache:empty')).toBeNull()
    })

    it('handles multiple ksc_ keys with both underscore and dash prefixes', async () => {
      localStorage.setItem('ksc_alpha', 'val1')
      localStorage.setItem('ksc-beta', 'val2')
      localStorage.setItem('ksc_gamma', 'val3')

      const mod = await importFresh()
      await mod.migrateFromLocalStorage()

      expect(localStorage.getItem('ksc_alpha')).toBeNull()
      expect(localStorage.getItem('ksc-beta')).toBeNull()
      expect(localStorage.getItem('ksc_gamma')).toBeNull()
      expect(localStorage.getItem('kc_alpha')).toBe('val1')
      expect(localStorage.getItem('kc-beta')).toBe('val2')
      expect(localStorage.getItem('kc_gamma')).toBe('val3')
    })
  })

  // ── migrateIDBToSQLite — workerRpc null guard ────────────────────────────


  describe('migrateIDBToSQLite — additional paths', () => {
    it('returns immediately when workerRpc is null (IndexedDB fallback)', async () => {
      const mod = await importFresh()
      expect(mod.isSQLiteWorkerActive()).toBe(false)
      // Should return without error since no worker is active
      await expect(mod.migrateIDBToSQLite()).resolves.not.toThrow()
    })
  })

  // ── preloadCacheFromStorage — empty storage ──────────────────────────────


  describe('preloadCacheFromStorage — edge cases', () => {
    it('returns early when storage has no keys', async () => {
      const mod = await importFresh()
      await expect(mod.preloadCacheFromStorage()).resolves.not.toThrow()
    })

    it('does not throw when called multiple times', async () => {
      const mod = await importFresh()
      await mod.preloadCacheFromStorage()
      await mod.preloadCacheFromStorage()
      // Should be idempotent
    })
  })

  // ── getCacheStats — comprehensive ────────────────────────────────────────


  describe('getCacheStats — detailed', () => {
    it('returns 0 entries when no caches exist', async () => {
      const mod = await importFresh()
      const stats = await mod.getCacheStats()
      expect(stats.entries).toBe(0)
      expect(stats).toHaveProperty('keys')
      expect(stats).toHaveProperty('count')
    })

    it('counts multiple cache entries correctly', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('stat-a', async () => 'a', '')
      await mod.prefetchCache('stat-b', async () => 'b', '')
      await mod.prefetchCache('stat-c', async () => 'c', '')

      const stats = await mod.getCacheStats()
      expect(stats.entries).toBeGreaterThanOrEqual(3)
    })
  })

  // ── invalidateCache — store clear path ───────────────────────────────────


  describe('invalidateCache — with existing store', () => {
    it('clears store state and removes from preloadedMetaMap', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('inv-full', async () => ({ data: 'test' }), {})
      mod.__testables.ssFlush()

      // Verify meta and sessionStorage exist
      expect(localStorage.getItem('kc_meta:inv-full')).not.toBeNull()
      expect(sessionStorage.getItem('kcc:inv-full')).not.toBeNull()

      await mod.invalidateCache('inv-full')

      // Meta should be removed
      expect(localStorage.getItem('kc_meta:inv-full')).toBeNull()
    })

    it('handles invalidating the same key twice gracefully', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('inv-double', async () => 'data', '')
      await mod.invalidateCache('inv-double')
      await mod.invalidateCache('inv-double')
      // Should not throw on double invalidation
    })
  })

  // ── useCache — demoWhenEmpty optimistic demo path ────────────────────────


  describe('CacheStore constructor — isFailed from meta', () => {
    it('sets isFailed=true when meta has >= MAX_FAILURES(3) consecutive failures', async () => {
      const mod = await importFresh()
      // Pre-populate meta with 3+ failures
      mod.initPreloadedMeta({
        'prefailed-key': { consecutiveFailures: 3, lastError: 'timeout' },
      })

      const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'prefailed-key',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )

      // Store should be in failed state from the meta
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBe(3)
    })
  })

  // ── clearAllCaches — comprehensive cleanup ──────────────────────────────


  describe('clearAllCaches — comprehensive', () => {
    it('removes all kc_meta: keys from localStorage', async () => {
      localStorage.setItem('kc_meta:a', JSON.stringify({ consecutiveFailures: 0 }))
      localStorage.setItem('kc_meta:b', JSON.stringify({ consecutiveFailures: 1 }))
      localStorage.setItem('kc_meta:c', JSON.stringify({ consecutiveFailures: 2 }))
      localStorage.setItem('other_key', 'keep-me')

      const mod = await importFresh()
      await mod.clearAllCaches()

      expect(localStorage.getItem('kc_meta:a')).toBeNull()
      expect(localStorage.getItem('kc_meta:b')).toBeNull()
      expect(localStorage.getItem('kc_meta:c')).toBeNull()
      expect(localStorage.getItem('other_key')).toBe('keep-me')
    })

    it('clears the cache registry', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('clear-reg-1', async () => 'a', '')
      await mod.prefetchCache('clear-reg-2', async () => 'b', '')

      let stats = await mod.getCacheStats()
      expect(stats.entries).toBeGreaterThanOrEqual(2)

      await mod.clearAllCaches()

      stats = await mod.getCacheStats()
      expect(stats.entries).toBe(0)
    })
  })

  // ── useCache — shared store is NOT destroyed on unmount ──────────────────


  describe('storage corruption fallbacks (#5280)', () => {
    it('handles corrupt JSON in sessionStorage without crashing', async () => {
      sessionStorage.setItem('kcc:corrupt-json-1', '{definitely not valid JSON!@#$')
      const mod = await importFresh()

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'corrupt-json-1',
          fetcher: vi.fn().mockResolvedValue(['fresh']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Should fall back to initialData and fetch fresh data
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['fresh'])
    })

    it('handles corrupt meta JSON in localStorage without crashing', async () => {
      // Corrupt the metadata entry
      localStorage.setItem('kc_meta:corrupt-meta-1', '!!!bad{json')

      const mod = await importFresh()
      // initPreloadedMeta should handle gracefully (meta is loaded from preloadedMetaMap)
      // The localStorage meta is only a fallback — if it's corrupt, default to 0 failures
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'corrupt-meta-1',
          fetcher: vi.fn().mockResolvedValue(['ok']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.consecutiveFailures).toBe(0)
    })

    it('handles sessionStorage entry with truncated JSON', async () => {
      // Simulate truncated write (e.g., browser killed during write)
      sessionStorage.setItem('kcc:truncated-1', '{"d":[1,2,3],"t":170000')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'truncated-1',
          fetcher: vi.fn().mockResolvedValue(['recovered']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['recovered'])
    })

    it('handles sessionStorage entry with wrong data shape (missing d/t/v)', async () => {
      // Valid JSON but wrong shape
      sessionStorage.setItem('kcc:wrong-shape-1', JSON.stringify({ foo: 'bar', baz: 42 }))

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'wrong-shape-1',
          fetcher: vi.fn().mockResolvedValue(['correct']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['correct'])
    })

    it('handles sessionStorage entry that is a bare string', async () => {
      sessionStorage.setItem('kcc:bare-string-1', '"just a string"')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'bare-string-1',
          fetcher: vi.fn().mockResolvedValue(['ok']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['ok'])
    })

    it('handles sessionStorage entry that is a bare number', async () => {
      sessionStorage.setItem('kcc:bare-number-1', '99999')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'bare-number-1',
          fetcher: vi.fn().mockResolvedValue([42]),
          initialData: [] as number[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([42])
    })

    it('handles sessionStorage entry with version mismatch gracefully', async () => {
      const STALE_VERSION = 1
      sessionStorage.setItem('kcc:old-version-1', JSON.stringify({
        d: ['stale-data'],
        t: Date.now(),
        v: STALE_VERSION,
      }))

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'old-version-1',
          fetcher: vi.fn().mockResolvedValue(['current']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Stale version data should be ignored, fresh fetch used instead
      expect(result.current.data).toEqual(['current'])
    })
  })

  // ==========================================================================
  // #5281 — Concurrent Failure Retries: isFailed after 3+ failures
  // ==========================================================================

})
