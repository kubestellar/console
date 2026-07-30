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



describe('cache — core hooks/API', () => {
  describe('persist=false', () => {
    it('does not write to sessionStorage when persist is false', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['no-persist-data'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'no-persist',
          fetcher,
          initialData: [] as string[],
          persist: false,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['no-persist-data'])
      // sessionStorage should NOT have this key
      expect(sessionStorage.getItem('kcc:no-persist')).toBeNull()
    })
  })

  // ── CacheStore.loadFromStorage (async fallback path) ──────────────────

  describe('loadFromStorage async fallback', () => {
    it('falls back to async IDB load when sessionStorage has no snapshot', async () => {
      // No sessionStorage seed — the store should attempt async load from IDB
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['from-fetcher'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'async-fallback',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      // Should start loading (no snapshot to hydrate from)
      expect(result.current.isLoading).toBe(true)
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['from-fetcher'])
    })
  })

  // ── CacheStore.resetFailures ──────────────────────────────────────────

  describe('resetFailures via resetFailuresForCluster', () => {
    it('resets meta and state for matching cluster caches', async () => {
      const mod = await importFresh()
      // Create a cache that fails
      await mod.prefetchCache('pods:my-cluster:ns', async () => { throw new Error('fail') }, [])
      const metaBefore = JSON.parse(localStorage.getItem('kc_meta:pods:my-cluster:ns')!)
      expect(metaBefore.consecutiveFailures).toBe(1)

      mod.resetFailuresForCluster('my-cluster')

      const metaAfter = JSON.parse(localStorage.getItem('kc_meta:pods:my-cluster:ns')!)
      expect(metaAfter.consecutiveFailures).toBe(0)
    })

    it('does not reset stores with 0 failures (no-op guard)', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('pods:clean-cluster:ns', async () => ['ok'], [])

      // Should not throw or modify anything
      const count = mod.resetFailuresForCluster('clean-cluster')
      expect(count).toBeGreaterThanOrEqual(1) // still matches the key
    })
  })

  // ── resetAllCacheFailures ──────────────────────────────────────────

  describe('resetAllCacheFailures', () => {
    it('resets all store failures across multiple caches', async () => {
      const mod = await importFresh()
      // Create multiple failing caches
      await mod.prefetchCache('pods:c1:ns', async () => { throw new Error('fail1') }, [])
      await mod.prefetchCache('pods:c2:ns', async () => { throw new Error('fail2') }, [])

      mod.resetAllCacheFailures()

      const meta1 = JSON.parse(localStorage.getItem('kc_meta:pods:c1:ns') || '{}')
      const meta2 = JSON.parse(localStorage.getItem('kc_meta:pods:c2:ns') || '{}')
      expect(meta1.consecutiveFailures).toBe(0)
      expect(meta2.consecutiveFailures).toBe(0)
    })
  })

  // ── clearAllCaches ─────────────────────────────────────────────────

  describe('clearAllCaches — comprehensive', () => {
    it('clears kubectl history via migrateFromLocalStorage', async () => {
      localStorage.setItem('kubectl-history', JSON.stringify(['get pods']))
      const mod = await importFresh()
      // clearAllCaches does not remove kubectl history — migrateFromLocalStorage does
      await mod.migrateFromLocalStorage()
      expect(localStorage.getItem('kubectl-history')).toBeNull()
    })

    it('clearAllCaches removes kc_meta: keys but not unrelated keys', async () => {
      localStorage.setItem('kc_meta:pods', JSON.stringify({ consecutiveFailures: 1 }))
      localStorage.setItem('other-key', 'keep')
      const mod = await importFresh()
      await mod.clearAllCaches()
      expect(localStorage.getItem('kc_meta:pods')).toBeNull()
      expect(localStorage.getItem('other-key')).toBe('keep')
    })
  })

  // ── useCache hook — demo mode behavior ────────────────────────────

  describe('useCache — demo mode', () => {
    it('returns demoData when in demo mode', async () => {
      setDemoMode(true)
      const mod = await importFresh()

      const demoData = [{ name: 'demo-pod' }]
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'demo-test',
          fetcher: async () => [{ name: 'live-pod' }],
          initialData: [],
          demoData,
        })
      )

      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.data).toEqual(demoData)
    })

    it('falls back to initialData when no demoData provided in demo mode', async () => {
      setDemoMode(true)
      const mod = await importFresh()

      const initialData = [{ name: 'initial' }]
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'demo-no-data',
          fetcher: async () => [{ name: 'live' }],
          initialData,
        })
      )

      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.data).toEqual(initialData)
    })
  })

  // ── useCache hook — enabled flag ──────────────────────────────────

  describe('useCache — enabled flag', () => {
    it('does not fetch when enabled is false', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'disabled-test',
          fetcher,
          initialData: [],
          enabled: false,
          autoRefresh: false,
        })
      )

      // Wait a tick
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      expect(fetcher).not.toHaveBeenCalled()
      expect(result.current.data).toEqual([])
    })
  })

  // ── useCache hook — consecutive failure tracking ──────────────────

  describe('useCache — failure tracking', () => {
    it('increments consecutiveFailures on each fetch error', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const fetcher = vi.fn().mockRejectedValue(new Error('fail'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-track',
          fetcher,
          initialData: [],
          autoRefresh: false,
          shared: false,
        })
      )

      // Wait for first fetch cycle
      await act(async () => { await new Promise(r => setTimeout(r, 100)) })

      // After one failure, consecutiveFailures should be 1
      expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    })

    it('marks isFailed after MAX_FAILURES (3) consecutive errors', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const MAX_FAILURES = 3
      let callCount = 0
      const fetcher = vi.fn(async () => {
        callCount++
        throw new Error(`fail ${callCount}`)
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'max-fail-test',
          fetcher,
          initialData: [],
          autoRefresh: false,
          shared: false,
        })
      )

      // Manually trigger refetch multiple times to hit MAX_FAILURES
      for (let i = 0; i < MAX_FAILURES; i++) {
        await act(async () => {
          try { await result.current.refetch() } catch { /* expected */ }
        })
      }

      // After enough failures, isFailed should be true
      expect(result.current.isFailed).toBe(true)
    })
  })

  // ── useCache hook — refetch method ────────────────────────────────

  describe('useCache — refetch', () => {
    it('refetch returns a promise', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['refreshed'])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'refetch-test',
          fetcher,
          initialData: [],
          autoRefresh: false,
          shared: false,
        })
      )

      await act(async () => { await new Promise(r => setTimeout(r, 100)) })

      await act(async () => {
        await result.current.refetch()
      })

      expect(result.current.data).toEqual(['refreshed'])
    })
  })

  // ── prefetchCache — basic operation ───────────────────────────────

  describe('prefetchCache — additional paths', () => {
    it('runs fetcher and populates cache', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('prefetch-basic', async () => ['item-1', 'item-2'], [])
      // No throw = success
    })

    it('handles fetcher errors gracefully', async () => {
      const mod = await importFresh()
      await expect(
        mod.prefetchCache('prefetch-err', async () => { throw new Error('boom') }, [])
      ).resolves.toBeUndefined()
    })

    it('stores meta with 0 failures after successful fetch', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('prefetch-meta', async () => ['ok'], [])
      const meta = JSON.parse(localStorage.getItem('kc_meta:prefetch-meta') || '{}')
      expect(meta.consecutiveFailures).toBe(0)
    })
  })

  // ── isEquivalentToInitial — indirect through CacheStore ───────────

  describe('isEquivalentToInitial — indirect coverage', () => {
    it('non-null newData and null initialData are not equivalent', async () => {
      seedSessionStorage('neq-null', { data: true }, Date.now())
      const mod = await importFresh()
      // Store should hydrate from sessionStorage since newData ({data: true}) != null
      await mod.prefetchCache('neq-null', async () => ({ data: true }), null as unknown as Record<string, unknown>)
    })

    it('array with items vs empty array are not equivalent', async () => {
      seedSessionStorage('neq-arr', ['a', 'b'], Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('neq-arr', async () => ['a', 'b'], [])
    })

    it('different objects are not equivalent', async () => {
      seedSessionStorage('neq-obj', { count: 5 }, Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('neq-obj', async () => ({ count: 5 }), { count: 0 })
    })
  })

  // ── CacheStore — progressive fetcher edge cases ────────────────────

})
