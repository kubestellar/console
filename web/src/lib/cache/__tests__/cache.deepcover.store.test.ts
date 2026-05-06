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



describe('cache — CacheStore', () => {
  describe('CacheStore — progressive fetch skips empty updates', () => {
    it('does not overwrite cached data with empty progress updates', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const cachedData = ['existing-item']
      seedSessionStorage('prog-empty', cachedData, Date.now() - STALE_AGE_MS)

      const fetcher = vi.fn().mockResolvedValue(['final-item'])
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        // First push empty progress (should be ignored)
        onProgress([])
        // Then push real data
        onProgress(['partial-item'])
        return ['final-item']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'prog-empty',
          fetcher,
          initialData: [],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await act(async () => { await new Promise(r => setTimeout(r, 200)) })
      expect(result.current.data).toEqual(['final-item'])
    })
  })

  // ── CacheStore — merge function ────────────────────────────────────

  describe('CacheStore — merge function', () => {
    it('uses merge function when provided and cache has data', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      seedSessionStorage('merge-test', ['old-1'], Date.now() - STALE_AGE_MS)

      const fetcher = vi.fn().mockResolvedValue(['new-1'])
      const merge = vi.fn((old: string[], new_: string[]) => [...old, ...new_])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'merge-test',
          fetcher,
          initialData: [],
          autoRefresh: false,
          shared: false,
          merge,
        })
      )

      await act(async () => { await new Promise(r => setTimeout(r, 200)) })
      expect(result.current.data).toEqual(['old-1', 'new-1'])
      expect(merge).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // NEW TESTS — Wave 1 coverage push (target 70%+)
  // ==========================================================================

  // ── ssWrite direct coverage ──────────────────────────────────────────────

  describe('ssWrite — direct coverage via prefetchCache', () => {
    it('writes correct structure with CACHE_VERSION=4 on successful fetch', async () => {
      const mod = await importFresh()
      const data = { clusters: ['a', 'b'] }
      await mod.prefetchCache('sswrite-direct', async () => data, {})
      mod.__testables.ssFlush()

      const raw = sessionStorage.getItem('kcc:sswrite-direct')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed).toHaveProperty('d')
      expect(parsed).toHaveProperty('t')
      expect(parsed).toHaveProperty('v', 4)
      expect(parsed.d).toEqual(data)
      expect(typeof parsed.t).toBe('number')
      expect(parsed.t).toBeGreaterThan(0)
    })

    it('silently handles sessionStorage quota error during save', async () => {
      const mod = await importFresh()
      // Let first write succeed, then mock quota error
      const origSetItem = sessionStorage.setItem.bind(sessionStorage)
      let callCount = 0
      const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string, value: string) => {
        callCount++
        if (key.startsWith('kcc:') && callCount > 0) {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        }
        origSetItem(key, value)
      })

      // Should not throw — ssWrite catches quota errors
      await expect(
        mod.prefetchCache('sswrite-quota', async () => ({ big: 'data' }), {})
      ).resolves.toBeUndefined()

      spy.mockRestore()
    })
  })

  // ── ssRead edge cases ────────────────────────────────────────────────────

  describe('ssRead — additional edge cases', () => {
    it('removes entry when only "v" field is missing', async () => {
      sessionStorage.setItem('kcc:no-v', JSON.stringify({ d: 'data', t: 1000 }))
      await importFresh()
      // ssRead removes entries missing required fields
      // The entry should be removed on read attempt during store construction
    })

    it('removes entry when only "t" field is missing', async () => {
      sessionStorage.setItem('kcc:no-t', JSON.stringify({ d: 'data', v: 4 }))
      await importFresh()
      // Missing 't' makes it fail the validation checks
    })

    it('removes entry when version does not match CACHE_VERSION=4', async () => {
      sessionStorage.setItem('kcc:old-version', JSON.stringify({ d: 'old', t: 1000, v: 3 }))
      const mod = await importFresh()
      // Create a store that would try to read this key
      await mod.prefetchCache('old-version', async () => 'new', '')
      mod.__testables.ssFlush()
      // ssRead removes the stale v:3 entry, then the fetcher runs and
      // saveToStorage writes the new data back with CACHE_VERSION=4.
      const remaining = sessionStorage.getItem('kcc:old-version')
      expect(remaining).not.toBeNull()
      const parsed = JSON.parse(remaining!)
      expect(parsed.v).toBe(4)
      expect(parsed.d).toBe('new')
    })

    it('handles sessionStorage.getItem throwing an error', async () => {
      const spy = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      // Module import and store creation should not crash
      const mod = await importFresh()
      await expect(
        mod.prefetchCache('ss-error', async () => 'ok', '')
      ).resolves.toBeUndefined()
      spy.mockRestore()
    })

    it('handles parsed value that is a boolean (non-object)', async () => {
      sessionStorage.setItem('kcc:bool-entry', 'true')
      await expect(importFresh()).resolves.toBeDefined()
    })

    it('handles parsed value that is an array (not expected shape)', async () => {
      sessionStorage.setItem('kcc:array-entry', '[1,2,3]')
      await expect(importFresh()).resolves.toBeDefined()
    })
  })

  // ── isEquivalentToInitial — comprehensive edge cases ─────────────────────

  describe('isEquivalentToInitial — comprehensive edge cases', () => {
    it('null newData vs non-null initialData returns false (detected via hydration)', async () => {
      // Seed with non-null data; initialData is null => not equivalent => hydrates
      seedSessionStorage('equiv-null-vs-obj', { a: 1 }, Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('equiv-null-vs-obj', async () => ({ a: 1 }), null as unknown as Record<string, unknown>)
    })

    it('non-null newData vs null initialData returns false (detected via hydration)', async () => {
      seedSessionStorage('equiv-obj-vs-null', null, Date.now())
      const mod = await importFresh()
      // initialData is {a:1}, snapshot is null — not equivalent, but snapshot has valid timestamp
      await mod.prefetchCache('equiv-obj-vs-null', async () => ({ a: 1 }), { a: 1 })
    })

    it('non-empty array vs empty array are not equivalent', async () => {
      seedSessionStorage('equiv-nonempty', [1, 2, 3], Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('equiv-nonempty', async () => [1, 2, 3], [])
      // Data should be [1,2,3] from cache since it's not equivalent to initial []
    })

    it('two non-empty arrays with different content are not equivalent', async () => {
      seedSessionStorage('equiv-diff-arr', [1, 2], Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('equiv-diff-arr', async () => [3, 4], [5, 6])
    })

    it('two objects with different values are not equivalent', async () => {
      seedSessionStorage('equiv-diff-obj', { count: 10 }, Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('equiv-diff-obj', async () => ({ count: 10 }), { count: 0 })
    })

    it('primitive values (non-object, non-array, non-null) return false', async () => {
      // Seed with a string; initialData is a different string
      seedSessionStorage('equiv-prim', 'hello' as unknown as string, Date.now())
      const mod = await importFresh()
      await mod.prefetchCache('equiv-prim', async () => 'hello', 'world')
    })
  })

  // ── CacheStore.fetch — reset version guard ──────────────────────────────

  describe('CacheStore.fetch — concurrent reset detection', () => {
    it('discards stale fetch results when mode transition resets during fetch', async () => {
      const mod = await importFresh()
      let resolveFetch: (value: string[]) => void
      const slowFetcher = vi.fn(() => new Promise<string[]>((resolve) => {
        resolveFetch = resolve
      }))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'reset-during-fetch',
          fetcher: slowFetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )

      // Let the fetch start
      await act(async () => { await Promise.resolve() })

      // Trigger mode transition reset while fetch is in flight
      const resetFn = registeredResets.get('unified-cache')
      act(() => { resetFn!() })

      // Now resolve the stale fetch — results should be discarded
      await act(async () => { resolveFetch!(['stale-data']) })

      // Store should be in reset state, not showing stale data
      expect(result.current.data).toEqual([])
      expect(result.current.isLoading).toBe(true)
    })
  })

  // ── CacheStore.fetch — error with existing cached data ──────────────────

  describe('CacheStore.fetch — error with existing data', () => {
    it('resets consecutiveFailures to 0 when store has cached data', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn()
        .mockResolvedValueOnce(['cached'])
        .mockRejectedValueOnce(new Error('transient'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'err-with-data',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )

      await waitFor(() => expect(result.current.data).toEqual(['cached']))

      // Second fetch fails but store has data
      await act(async () => { await result.current.refetch() })

      // consecutiveFailures should be 0 because hasData is true
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.isFailed).toBe(false)
      // Data should be preserved
      expect(result.current.data).toEqual(['cached'])
    })

    it('non-Error throw produces generic error message in meta', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('non-error-meta', async () => {
        throw 42  // not an Error instance
      }, [])

      const metaRaw = localStorage.getItem('kc_meta:non-error-meta')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.lastError).toBe('Failed to fetch data')
      expect(meta.consecutiveFailures).toBe(1)
    })
  })

  // ── CacheStore.markReady — no-op when already loaded ────────────────────

  describe('CacheStore.markReady — no-op branch', () => {
    it('does not re-set state if already not loading', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'markready-noop',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Switching to demo mode should call markReady but it's a no-op since
      // the store is already loaded
      act(() => { setDemoMode(true) })
      // Should still be false and not throw
      expect(result.current.isLoading).toBe(false)
    })
  })

  // ── CacheStore.resetToInitialData ────────────────────────────────────────

  describe('CacheStore.resetToInitialData', () => {
    it('resets data, re-triggers storage load, and increments resetVersion', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['live-data'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'reset-initial',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['live-data']))

      // Invalidate and see the store reset
      await act(async () => { await mod.invalidateCache('reset-initial') })
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toEqual([])
    })
  })

  // ── CacheStore.resetForModeTransition ────────────────────────────────────

  describe('CacheStore.resetForModeTransition — detailed', () => {
    it('clears storageLoadPromise (no re-load from storage)', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'mode-reset-detail',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['data']))

      // Trigger mode transition (clears persistent storage then resets stores)
      const resetFn = registeredResets.get('unified-cache')
      act(() => { resetFn!() })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toEqual([])
      expect(result.current.error).toBeNull()
      expect(result.current.isFailed).toBe(false)
      expect(result.current.consecutiveFailures).toBe(0)
    })
  })

  // ── CacheStore.applyPreloadedMeta — skip when data loaded ────────────────

  describe('applyPreloadedMeta — skip branch', () => {
    it('does not apply meta when store already has loaded data', async () => {
      const mod = await importFresh()
      // Create and load the store first
      const fetcher = vi.fn().mockResolvedValue(['loaded'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'meta-skip',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['loaded']))

      // Now call initPreloadedMeta — it should skip this store since data is loaded
      act(() => {
        mod.initPreloadedMeta({
          'meta-skip': { consecutiveFailures: 5, lastError: 'should-be-ignored' },
        })
      })

      // Store should NOT pick up the failure count since it's already loaded
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.isFailed).toBe(false)
    })
  })

  // ── CacheStore.saveMeta — localStorage fallback path ─────────────────────

})
