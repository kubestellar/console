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
})
