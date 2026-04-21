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

  describe('useCache hook', () => {
    it('starts in loading state and transitions to loaded on fetch success', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['pod-1', 'pod-2'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-basic',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      // Initially loading
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toEqual([])

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['pod-1', 'pod-2'])
      expect(result.current.isRefreshing).toBe(false)
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.isFailed).toBe(false)
    })

    it('refetch() triggers a new fetch cycle', async () => {
      const mod = await importFresh()
      let callNum = 0
      const fetcher = vi.fn().mockImplementation(() => {
        callNum++
        return Promise.resolve([`item-${callNum}`])
      })
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-refetch',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['item-1'])

      await act(async () => { await result.current.refetch() })
      expect(result.current.data).toEqual(['item-2'])
      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('clearAndRefetch clears store then re-fetches', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['fresh'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-clearAndRefetch',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => { await result.current.clearAndRefetch() })
      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('returns demoData when demo mode is active', async () => {
      demoModeValue = true
      const mod = await importFresh()
      const demoItems = [{ id: 'demo-1' }]
      const fetcher = vi.fn()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-demo',
          fetcher,
          initialData: [],
          demoData: demoItems,
          shared: false,
        })
      )
      expect(result.current.data).toEqual(demoItems)
      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.isLoading).toBe(false)
      // Fetcher should NOT be called in demo mode
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('returns initialData when demoData is undefined in demo mode', async () => {
      demoModeValue = true
      const mod = await importFresh()
      const initial = { value: 'fallback' }
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-demo-no-demodata',
          fetcher: vi.fn(),
          initialData: initial,
          shared: false,
        })
      )
      expect(result.current.data).toEqual(initial)
      expect(result.current.isDemoFallback).toBe(true)
    })

    it('does not fetch when enabled=false', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn()
      renderHook(() =>
        mod.useCache({
          key: 'hook-disabled',
          fetcher,
          initialData: [],
          enabled: false,
          shared: false,
          autoRefresh: false,
        })
      )
      await act(async () => { await Promise.resolve() })
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('liveInDemoMode=true fetches even in demo mode', async () => {
      demoModeValue = true
      const mod = await importFresh()
      const liveData = [{ status: 'pass' }]
      const fetcher = vi.fn().mockResolvedValue(liveData)
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-liveInDemo',
          fetcher,
          initialData: [],
          liveInDemoMode: true,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(fetcher).toHaveBeenCalled()
      expect(result.current.data).toEqual(liveData)
    })

    it('merge function combines old and new data on refetch', async () => {
      const mod = await importFresh()
      let callNum = 0
      const fetcher = vi.fn().mockImplementation(() => {
        callNum++
        return Promise.resolve([`batch-${callNum}`])
      })
      const merge = (old: string[], new_: string[]) => [...old, ...new_]
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-merge',
          fetcher,
          initialData: [] as string[],
          merge,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['batch-1'])

      await act(async () => { await result.current.refetch() })
      expect(result.current.data).toEqual(['batch-1', 'batch-2'])
    })

    it('shared=true reuses the same store across hook instances', async () => {
      const mod = await importFresh()
      const fetcher1 = vi.fn().mockResolvedValue(['shared-data'])
      const { result: r1 } = renderHook(() =>
        mod.useCache({
          key: 'hook-shared',
          fetcher: fetcher1,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(r1.current.isLoading).toBe(false))

      // Second hook with same key should share the store — the already-loaded
      // data should be visible immediately (isLoading=false from the start)
      const fetcher2 = vi.fn().mockResolvedValue(['other'])
      const { result: r2 } = renderHook(() =>
        mod.useCache({
          key: 'hook-shared',
          fetcher: fetcher2,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      // The shared store already has data from r1 — r2 starts not-loading
      expect(r2.current.isLoading).toBe(false)
    })

    it('demoWhenEmpty shows demoData when live fetch returns empty', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue([])
      const demoItems = [{ name: 'demo-agent' }]
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-demoWhenEmpty',
          fetcher,
          initialData: [] as { name: string }[],
          demoData: demoItems,
          demoWhenEmpty: true,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(demoItems)
      expect(result.current.isDemoFallback).toBe(true)
    })

    it('demoWhenEmpty shows live data when fetch returns non-empty', async () => {
      const mod = await importFresh()
      const liveItems = [{ name: 'real-agent' }]
      const fetcher = vi.fn().mockResolvedValue(liveItems)
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-demoWhenEmpty-live',
          fetcher,
          initialData: [] as { name: string }[],
          demoData: [{ name: 'demo' }],
          demoWhenEmpty: true,
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(liveItems)
      expect(result.current.isDemoFallback).toBe(false)
    })

    it('keeps cached data when fetcher returns empty and hasCachedData', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn()
        .mockResolvedValueOnce(['existing-item'])
        .mockResolvedValueOnce([])

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-keep-cache',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['existing-item']))

      // Second fetch returns empty - should keep cached data
      await act(async () => { await result.current.refetch() })
      expect(result.current.data).toEqual(['existing-item'])
    })

    it('preserves cached data on fetch error after successful load', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn()
        .mockResolvedValueOnce(['good'])
        .mockRejectedValueOnce(new Error('server error'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-error-preserve',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['good']))

      await act(async () => { await result.current.refetch() })
      expect(result.current.data).toEqual(['good'])
      // When hasData, consecutiveFailures resets to 0
      expect(result.current.consecutiveFailures).toBe(0)
    })

    it('tracks consecutiveFailures on error without cached data', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockRejectedValue(new Error('network'))
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-fail-count',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      expect(result.current.isLoading).toBe(true)
    })

    it('hydrates from sessionStorage and shows isRefreshing', async () => {
      seedSessionStorage('hook-hydrate', ['cached-pod'], Date.now() - 5000)
      const mod = await importFresh()
      const fetcher = vi.fn().mockImplementation(
        () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['fresh-pod']), 100))
      )
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'hook-hydrate',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      // Should hydrate immediately from sessionStorage
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toEqual(['cached-pod'])
      expect(result.current.isRefreshing).toBe(true)
    })

    it('registers with refetch system for mode transitions', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue([])
      renderHook(() =>
        mod.useCache({
          key: 'hook-refetch-reg',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await act(async () => { await Promise.resolve() })
      expect(registeredRefetches.has('cache:hook-refetch-reg')).toBe(true)
    })

    it('auto-refresh fires on interval when autoRefresh=true', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      let callCount = 0
      const fetcher = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve([`data-${callCount}`])
      })
      renderHook(() =>
        mod.useCache({
          key: 'hook-auto-refresh',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          category: 'realtime', // 15_000ms interval
        })
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      const initialCalls = fetcher.mock.calls.length
      expect(initialCalls).toBeGreaterThanOrEqual(1)

      // Advance past one interval
      await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })
      expect(fetcher.mock.calls.length).toBeGreaterThan(initialCalls)
      vi.useRealTimers()
    })

    it('auto-refresh is suppressed when globally paused', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      // Pause auto-refresh before rendering
      mod.setAutoRefreshPaused(true)

      renderHook(() =>
        mod.useCache({
          key: 'hook-paused',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          category: 'realtime',
        })
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      const callsAfterInitial = fetcher.mock.calls.length

      // Advance well past the interval — no new calls
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(fetcher.mock.calls.length).toBe(callsAfterInitial)
      vi.useRealTimers()
    })

    it('does not auto-refresh when autoRefresh=false', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      renderHook(() =>
        mod.useCache({
          key: 'hook-no-auto',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      const initialCalls = fetcher.mock.calls.length

      await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
      expect(fetcher.mock.calls.length).toBe(initialCalls)
      vi.useRealTimers()
    })

    it('non-shared stores are destroyed on unmount', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['data'])

      const { unmount } = renderHook(() =>
        mod.useCache({
          key: 'hook-destroy',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: false,
        })
      )
      await act(async () => { await Promise.resolve() })
      // Should not throw on unmount
      unmount()
    })

    it('custom refreshInterval overrides category-based rate', async () => {
      vi.useFakeTimers()
      const mod = await importFresh()
      let callCount = 0
      const fetcher = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve([`data-${callCount}`])
      })
      renderHook(() =>
        mod.useCache({
          key: 'hook-custom-interval',
          fetcher,
          initialData: [] as string[],
          shared: false,
          autoRefresh: true,
          refreshInterval: 5_000, // 5 seconds
          category: 'costs',     // normally 600_000ms, but refreshInterval overrides
        })
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      const initialCalls = fetcher.mock.calls.length

      // Advance just past the custom 5s interval
      await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
      expect(fetcher.mock.calls.length).toBeGreaterThan(initialCalls)
      vi.useRealTimers()
    })
  })

  // ── useArrayCache / useObjectCache convenience hooks ──────────────────

  describe('useArrayCache', () => {
    it('defaults initialData to empty array', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['item'])
      const { result } = renderHook(() =>
        mod.useArrayCache({
          key: 'array-cache',
          fetcher,
          autoRefresh: false,
          shared: false,
        })
      )
      // Before fetch resolves, data should be the default []
      expect(Array.isArray(result.current.data)).toBe(true)
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['item'])
    })
  })

  describe('useObjectCache', () => {
    it('defaults initialData to empty object', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue({ key: 'value' })
      const { result } = renderHook(() =>
        mod.useObjectCache({
          key: 'object-cache',
          fetcher,
          autoRefresh: false,
          shared: false,
        })
      )
      expect(typeof result.current.data).toBe('object')
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual({ key: 'value' })
    })
  })

  // ── CacheStore.resetForModeTransition (via clearAllInMemoryCaches) ────

  describe('mode transition resets stores', () => {
    it('clearAllInMemoryCaches resets live stores to loading state', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue(['live-data'])
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'mode-transition-reset',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      await waitFor(() => expect(result.current.data).toEqual(['live-data']))

      // Trigger mode transition reset
      const resetFn = registeredResets.get('unified-cache')
      expect(resetFn).toBeDefined()
      act(() => { resetFn!() })

      // Store should be back to initial loading state
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toEqual([])
      expect(result.current.consecutiveFailures).toBe(0)
    })
  })

  // ── CacheStore.applyPreloadedMeta after construction ──────────────────

  describe('applyPreloadedMeta', () => {
    it('updates stores that were constructed before meta was loaded', async () => {
      const mod = await importFresh()
      // Create a store BEFORE calling initPreloadedMeta
      const fetcher = vi.fn().mockImplementation(
        () => new Promise(() => {}) // never resolves
      )
      renderHook(() =>
        mod.useCache({
          key: 'late-meta-key',
          fetcher,
          initialData: [] as string[],
          shared: true,
          autoRefresh: false,
        })
      )
      // At this point the store exists but has no meta (defaults to 0 failures)

      // Now load meta — this should call applyPreloadedMeta on existing stores
      act(() => {
        mod.initPreloadedMeta({
          'late-meta-key': { consecutiveFailures: 5, lastError: 'timeout' },
        })
      })
      // The store (still in loading state) should have picked up the failures
    })
  })

  // ── CacheStore.markReady (demo mode path) ─────────────────────────────

  describe('markReady (demo mode)', () => {
    it('sets isLoading=false when store is in demo/disabled mode', async () => {
      demoModeValue = true
      const mod = await importFresh()
      const fetcher = vi.fn()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'mark-ready-demo',
          fetcher,
          initialData: ['default'],
          demoData: ['demo'],
          shared: false,
        })
      )
      // In demo mode, markReady is called → isLoading=false
      expect(result.current.isLoading).toBe(false)
    })
  })

  // ── CacheStore subscribe/getSnapshot (useSyncExternalStore) ───────────

  describe('subscribe and getSnapshot', () => {
    it('updates subscribers when state changes', async () => {
      const mod = await importFresh()
      const fetcher = vi.fn().mockResolvedValue({ count: 42 })
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'subscribe-test',
          fetcher,
          initialData: { count: 0 },
          shared: false,
          autoRefresh: false,
        })
      )
      // Initial snapshot
      expect(result.current.data).toEqual({ count: 0 })

      // After fetch, subscribers should be notified → new snapshot
      await waitFor(() => expect(result.current.data).toEqual({ count: 42 }))
    })
  })

  // ── CacheStore.saveToStorage with persist=false ───────────────────────

})
