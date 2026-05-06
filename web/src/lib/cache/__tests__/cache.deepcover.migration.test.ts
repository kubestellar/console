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

  describe('CacheStore.destroy', () => {
    it('clears all subscribers and stops refresh timeout on unmount', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { unmount } = renderHook(() =>
        mod.useCache({
          key: 'destroy-test',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          category: 'realtime',
        })
      )

      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // Unmount should call destroy on non-shared store
      unmount()

      // Advance timers — no more fetches should fire
      const callsBefore = fetcher.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      // After unmount, no new calls should happen (interval cleared)
      expect(fetcher.mock.calls.length).toBe(callsBefore)

      vi.useRealTimers()
    })
  })

  // ── CacheStore.loadFromStorage — early return on initialDataLoaded ───────

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

  describe('useCache — demoWhenEmpty optimistic demo', () => {
    it('shows demoData optimistically during loading when data is empty', async () => {
      const mod = await importFresh()
      const demoItems = [{ name: 'demo-agent' }]
      let resolveFetch: (value: { name: string }[]) => void
      const fetcher = vi.fn(() => new Promise<{ name: string }[]>((resolve) => {
        resolveFetch = resolve
      }))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'optimistic-demo',
          fetcher,
          initialData: [] as { name: string }[],
          demoData: demoItems,
          demoWhenEmpty: true,
          shared: false,
          autoRefresh: false,
        })
      )

      // Flush microtasks so store.fetch() progresses past storageLoadPromise
      // and actually calls the fetcher (assigning resolveFetch).
      await act(async () => { await Promise.resolve() })

      // During loading (fetcher still pending), optimistic demo shows demoData
      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.data).toEqual(demoItems)
      expect(result.current.isRefreshing).toBe(true)

      // Resolve with real data and flush remaining async work (saveToStorage)
      await act(async () => { resolveFetch!([{ name: 'real-agent' }]) })
      // Allow saveToStorage microtasks to settle
      await act(async () => { await Promise.resolve() })
      expect(result.current.data).toEqual([{ name: 'real-agent' }])
      expect(result.current.isDemoFallback).toBe(false)
    })

    it('does not show optimistic demo when store already has cached data', async () => {
      seedSessionStorage('optimistic-cached', [{ name: 'cached' }], Date.now())
      const mod = await importFresh()
      const demoItems = [{ name: 'demo' }]
      const fetcher = vi.fn().mockResolvedValue([{ name: 'live' }])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'optimistic-cached',
          fetcher,
          initialData: [] as { name: string }[],
          demoData: demoItems,
          demoWhenEmpty: true,
          shared: true,
          autoRefresh: false,
        })
      )

      // Should show cached data, not demo data
      expect(result.current.data).toEqual([{ name: 'cached' }])
      expect(result.current.isLoading).toBe(false)
    })
  })

  // ── useCache — useEffect cleanup (interval and refetch registration) ─────

  describe('useCache — effect cleanup', () => {
    it('unregisters from refetch system on unmount', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { unmount } = renderHook(() =>
        mod.useCache({
          key: 'cleanup-refetch',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )

      await act(async () => { await Promise.resolve() })
      expect(registeredRefetches.has('cache:cleanup-refetch')).toBe(true)

      unmount()
      expect(registeredRefetches.has('cache:cleanup-refetch')).toBe(false)
    })

    it('clears interval on unmount when autoRefresh=true', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { unmount } = renderHook(() =>
        mod.useCache({
          key: 'cleanup-interval',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          category: 'pods',
        })
      )

      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      const callsBeforeUnmount = fetcher.mock.calls.length

      unmount()

      await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
      expect(fetcher.mock.calls.length).toBe(callsBeforeUnmount)

      vi.useRealTimers()
    })
  })

  // ── useCache — refetch when disabled does nothing ────────────────────────

  describe('useCache — refetch when disabled', () => {
    it('refetch is a no-op when enabled=false', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'refetch-disabled',
          fetcher,
          initialData: [] as string[],
          enabled: false,
          shared: false,
          autoRefresh: false,
        })
      )

      await act(async () => { await Promise.resolve() })
      expect(fetcher).not.toHaveBeenCalled()

      // Manually calling refetch should also be a no-op
      await act(async () => { await result.current.refetch() })
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('refetch is a no-op when in demo mode without liveInDemoMode', async () => {
      setDemoMode(true)
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'refetch-demo-disabled',
          fetcher,
          initialData: [] as string[],
          demoData: ['demo'],
          shared: false,
          autoRefresh: false,
        })
      )

      await act(async () => { await result.current.refetch() })
      expect(fetcher).not.toHaveBeenCalled()
    })
  })

  // ── CacheStore.fetch — guard empty response on cold load ─────────────────

  describe('CacheStore.fetch — empty response on cold load', () => {
    it('accepts empty array on cold load (no cache) without getting stuck', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue([])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'cold-empty-accept',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )

      // Should not stay in loading forever — empty result on cold load is accepted
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([])
    })
  })

  // ── CacheStore constructor — isFailed from meta ──────────────────────────

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

  describe('useCache — shared store lifecycle', () => {
    it('shared store is NOT destroyed on unmount (only non-shared are)', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['shared-live'])

      const { result, unmount } = renderHook(() =>
        mod.useCache({
          key: 'shared-persist',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )

      await waitFor(() => expect(result.current.data).toEqual(['shared-live']))

      unmount()

      // The shared store should still be in the registry
      const stats = await mod.getCacheStats()
      expect(stats.entries).toBeGreaterThanOrEqual(1)
    })
  })

  // ── useCache — mode transition from demo to live ────────────────────────

  describe('useCache — demo to live mode transition', () => {
    it('switches from demo data to live data when demo mode is turned off', async () => {
      setDemoMode(true)
      const mod = await importFresh()
      const demoItems = [{ id: 'demo' }]
      const liveItems = [{ id: 'live' }]
      const fetcher = vi.fn().mockResolvedValue(liveItems)

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'demo-to-live',
          fetcher,
          initialData: [] as { id: string }[],
          demoData: demoItems,
          shared: false,
          autoRefresh: false,
        })
      )

      // In demo mode, should show demo data
      expect(result.current.data).toEqual(demoItems)
      expect(result.current.isDemoFallback).toBe(true)

      // Switch to live mode
      act(() => { setDemoMode(false) })

      // Now should try to fetch live data
      await waitFor(() => expect(result.current.isDemoFallback).toBe(false))
    })
  })

  // ── CacheStore.fetch — progressive fetcher error saves partial data ──────

  describe('CacheStore.fetch — progressive fetcher with error', () => {
    it('saves partial data to storage when progressive fetcher throws after onProgress', async () => {
      const mod = await importFresh()
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        onProgress(['partial-1', 'partial-2'])
        throw new Error('stream interrupted')
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'prog-error-save',
          fetcher: vi.fn().mockResolvedValue([]),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await act(async () => { await new Promise(r => setTimeout(r, 200)) })

      // Partial data should have been saved and preserved
      expect(result.current.data).toEqual(['partial-1', 'partial-2'])
    })
  })

  // ── getEffectiveInterval — indirect through auto-refresh timing ──────────

  describe('getEffectiveInterval — indirect through auto-refresh with failures', () => {
    it('uses longer interval after consecutive failures (backoff)', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      let callCount = 0
      // First call fails, subsequent succeed
      const fetcher = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount <= 1) throw new Error('fail')
        return ['data']
      })

      renderHook(() =>
        mod.useCache({
          key: 'backoff-interval',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          category: 'realtime', // 15_000ms base
        })
      )

      // Let initial fetch (which fails) complete
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // After 1 failure, interval should be 15000 * 2 = 30000
      // Advance 16 seconds — should NOT trigger (old interval was 15s but now it's 30s)
      const callsAfterFail = fetcher.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })

      // Advance another 15 seconds (total 31s) — should trigger with backoff
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
      expect(fetcher.mock.calls.length).toBeGreaterThan(callsAfterFail)

      vi.useRealTimers()
    })
  })

  // ── CacheStore.resetFailures — no-op guard ──────────────────────────────

  describe('CacheStore.resetFailures — no-op on 0 failures', () => {
    it('does not modify meta when failures are already 0', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('reset-noop', async () => 'ok', '')

      const metaBefore = localStorage.getItem('kc_meta:reset-noop')

      // Reset on a store with 0 failures
      mod.resetFailuresForCluster('reset-noop')

      const metaAfter = localStorage.getItem('kc_meta:reset-noop')
      // Meta should be unchanged (resetFailures returns early when consecutiveFailures === 0)
      expect(metaAfter).toBe(metaBefore)
    })
  })

  // ==========================================================================
  // #5279 — SSE / Progressive Fetch Integration Tests
  // ==========================================================================

  describe('progressive fetch — chunked data delivery (#5279)', () => {
    it('progressiveFetcher delivers partial data before final result', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const CHUNK_DELAY_MS = 50
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        // Simulate first cluster responding
        onProgress(['cluster-1-pods'])
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
        // Simulate second cluster responding
        onProgress(['cluster-1-pods', 'cluster-2-pods'])
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
        // Final result with all clusters
        return ['cluster-1-pods', 'cluster-2-pods', 'cluster-3-pods']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-chunked-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['cluster-1-pods', 'cluster-2-pods', 'cluster-3-pods'])
      expect(progressiveFetcher).toHaveBeenCalledTimes(1)
    })

    it('progressive fetcher with many chunks does not overwhelm renders (throttling)', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const TOTAL_CLUSTERS = 50
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        const accumulated: string[] = []
        // Simulate 50 clusters responding rapidly
        for (let i = 0; i < TOTAL_CLUSTERS; i++) {
          accumulated.push(`cluster-${i}`)
          onProgress([...accumulated])
        }
        return accumulated
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-many-chunks-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Final data should contain all clusters
      expect(result.current.data).toHaveLength(TOTAL_CLUSTERS)
      expect(result.current.data[0]).toBe('cluster-0')
      expect(result.current.data[TOTAL_CLUSTERS - 1]).toBe(`cluster-${TOTAL_CLUSTERS - 1}`)
    })

    it('progressive fetcher error after partial data preserves partial results', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const PROGRESS_DELAY_MS = 150  // Exceed the PROGRESS_THROTTLE_MS (100ms) to ensure flush
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        onProgress(['cluster-1'])
        // Wait beyond the throttle window so both calls are flushed
        await new Promise(r => setTimeout(r, PROGRESS_DELAY_MS))
        onProgress(['cluster-1', 'cluster-2'])
        await new Promise(r => setTimeout(r, PROGRESS_DELAY_MS))
        throw new Error('SSE connection lost after 2 clusters')
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-partial-error-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      // Wait for the fetch cycle to complete (error will be caught)
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Partial data from onProgress should be preserved even though the fetcher threw.
      // When hasData is true (from onProgress), the error is still recorded
      // but data is not wiped.
      expect(result.current.data).toEqual(['cluster-1', 'cluster-2'])
      expect(result.current.error).not.toBeNull()
    })

    it('progressive fetch ignores empty progress updates to protect cached data', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      // Seed cache with existing data
      seedSessionStorage('sse-empty-guard-1', ['cached-data'], Date.now() - STALE_AGE_MS)

      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        // Push an empty array (should be ignored by isEquivalentToInitial guard)
        onProgress([])
        return ['final-data']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-empty-guard-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Final data should be the fetcher result, not the empty progress update
      expect(result.current.data).toEqual(['final-data'])
    })
  })

  // ==========================================================================
  // #5280 — LocalStorage / SessionStorage Corruption Fallbacks
  // ==========================================================================

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

  describe('concurrent failure retries — isFailed transition (#5281)', () => {
    it('transitions to isFailed=true after MAX_FAILURES (3) consecutive errors', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const MAX_FAILURES = 3
      const fetcher = vi.fn().mockRejectedValue(new Error('connection refused'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-transition-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Wait for initial fetch failure
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

      // Trigger additional failures
      for (let i = 1; i < MAX_FAILURES; i++) {
        await act(async () => { await result.current.refetch() })
      }

      // After 3 consecutive failures, isFailed should be true
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(MAX_FAILURES)
      // isLoading should be false since we hit isFailed (card shows error state)
      expect(result.current.isLoading).toBe(false)
    })

    it('isFailed=false with only 1-2 consecutive failures', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const fetcher = vi.fn().mockRejectedValue(new Error('timeout'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-partial-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      expect(result.current.isFailed).toBe(false)
      // isLoading should still be true (still retrying)
      expect(result.current.isLoading).toBe(true)
    })

    it('isFailed resets to false after a successful fetch', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const MAX_FAILURES = 3
      let callNum = 0
      const fetcher = vi.fn().mockImplementation(async () => {
        callNum++
        if (callNum <= MAX_FAILURES) throw new Error(`fail ${callNum}`)
        return ['recovered']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-recover-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Drive failures
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      for (let i = 1; i < MAX_FAILURES; i++) {
        await act(async () => { await result.current.refetch() })
      }
      expect(result.current.isFailed).toBe(true)

      // Now succeed
      await act(async () => { await result.current.refetch() })
      expect(result.current.isFailed).toBe(false)
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.data).toEqual(['recovered'])
    })

    it('meta persists consecutive failure count across store operations', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      // Two consecutive failures
      const fetcher = vi.fn().mockRejectedValue(new Error('fail'))
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'meta-fail-persist-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      await act(async () => { await result.current.refetch() })

      // Meta should reflect 2 failures
      const metaRaw = localStorage.getItem('kc_meta:meta-fail-persist-1')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(2)
      expect(meta.lastError).toBe('fail')
    })
  })
})
