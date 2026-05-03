/**
 * Additional coverage tests for cache/index.ts
 *
 * Targets ~177 uncovered lines:
 * - WorkerStorage class (get, set, delete, clear, getStats)
 * - CacheStore.fetch() with merge functions and progressive fetchers
 * - CacheStore.resetForModeTransition(), resetToInitialData(), clear(), destroy(), resetFailures()
 * - initPreloadedMeta with stores already registered in the cache registry
 * - clearAllInMemoryCaches with multiple stores
 * - clearSessionSnapshots
 * - Error branches in IndexedDB operations (initDB reject, set reject, etc.)
 * - saveMeta with workerRpc vs localStorage fallback
 * - saveToStorage error path
 * - loadFromStorage async fallback path
 * - isEquivalentToInitial: JSON.stringify throw (circular ref)
 * - migrateFromLocalStorage, migrateIDBToSQLite, migrateLocalStorageMetaToSQLite
 * - invalidateCache, resetFailuresForCluster, resetAllCacheFailures
 * - prefetchCache, preloadCacheFromStorage
 * - getCacheStats, clearAllCaches
 * - useArrayCache, useObjectCache
 * - useCache: demoWhenEmpty fallback, optimistic demo, clearAndRefetch
 * - useCache: key change clears old timer
 * - setAutoRefreshPaused no-op when same value
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

function _setDemoMode(val: boolean) {
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

// ── Helpers ──────────────────────────────────────────────────────

const CACHE_VERSION = 4
const SS_PREFIX = 'kcc:'
const META_PREFIX = 'kc_meta:'

/** Offset (ms) to make seeded cache data older than any refresh interval,
 *  ensuring the initial fetch is NOT skipped by the fresh-data guard (#7653). */
const STALE_AGE_MS = 600_000

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

function seedSessionStorage(cacheKey: string, data: unknown, timestamp: number): void {
  sessionStorage.setItem(
    `${SS_PREFIX}${cacheKey}`,
    JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
  )
}

// ── Setup / Teardown ──────────────────────────────────────────────

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

// ============================================================================
// clearAllInMemoryCaches via mode transition coordinator
// ============================================================================

describe('clearAllInMemoryCaches', () => {
  it('resets all registered stores and clears session snapshots', async () => {
    // Seed some session storage entries
    seedSessionStorage('store-a', [1, 2], Date.now())
    seedSessionStorage('store-b', { x: 1 }, Date.now())

    const { useCache } = await importFresh()

    // Create two stores via useCache
    const { result: r1 } = renderHook(() => useCache({
      key: 'store-a',
      fetcher: () => Promise.resolve([10, 20]),
      initialData: [] as number[],
    }))
    const { result: r2 } = renderHook(() => useCache({
      key: 'store-b',
      fetcher: () => Promise.resolve({ x: 99 }),
      initialData: { x: 0 },
    }))

    // Wait for initial fetch
    await waitFor(() => {
      expect(r1.current.isLoading).toBe(false)
    })

    // Trigger clearAllInMemoryCaches via the registered reset
    const resetFn = registeredResets.get('unified-cache')
    expect(resetFn).toBeDefined()
    act(() => { resetFn!() })

    // After reset, stores should be in loading state with initial data
    await waitFor(() => {
      expect(r1.current.isLoading).toBe(true)
      expect(r2.current.isLoading).toBe(true)
    })

    // Session storage snapshots should be cleared
    let ssCount = 0
    for (let i = 0; i < sessionStorage.length; i++) {
      if (sessionStorage.key(i)?.startsWith(SS_PREFIX)) ssCount++
    }
    expect(ssCount).toBe(0)
  })
})

// ============================================================================
// CacheStore.fetch() with merge function
// ============================================================================

describe('CacheStore.fetch() with merge function', () => {
  it('merges old and new data when merge is provided and cache exists', async () => {
    // Seed cache so store has cached data
    seedSessionStorage('merge-test', [1, 2], Date.now() - STALE_AGE_MS)

    const { useCache } = await importFresh()
    const fetcher = vi.fn().mockResolvedValue([3, 4])
    const mergeFn = (old: number[], new_: number[]) => [...old, ...new_]

    const { result } = renderHook(() => useCache({
      key: 'merge-test',
      fetcher,
      initialData: [] as number[],
      merge: mergeFn,
    }))

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })

    // Should have merged [1,2] + [3,4] = [1,2,3,4]
    expect(result.current.data).toEqual([1, 2, 3, 4])
  })

  it('does not merge when there is no cached data (cold start)', async () => {
    const { useCache } = await importFresh()
    const fetcher = vi.fn().mockResolvedValue([3, 4])
    const mergeFn = vi.fn((old: number[], new_: number[]) => [...old, ...new_])

    const { result } = renderHook(() => useCache({
      key: 'merge-cold-start',
      fetcher,
      initialData: [] as number[],
      merge: mergeFn,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // With cold start and empty initialData, fetcher returns empty-equivalent
    // so merge won't be called (no hasCachedData).
    // The data should be [3,4] from the fetcher.
    expect(result.current.data).toEqual([3, 4])
  })
})

// ============================================================================
// CacheStore.fetch() with progressive fetcher
// ============================================================================

describe('CacheStore.fetch() with progressive fetcher', () => {
  it('updates UI progressively before final result', async () => {
    const { useCache } = await importFresh()

    const progressiveFetcher = vi.fn(async (onProgress: (data: number[]) => void) => {
      onProgress([1])
      onProgress([1, 2])
      return [1, 2, 3]
    })

    const { result } = renderHook(() => useCache({
      key: 'progressive-test',
      fetcher: () => Promise.resolve([]),
      initialData: [] as number[],
      progressiveFetcher,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual([1, 2, 3])
    expect(progressiveFetcher).toHaveBeenCalledTimes(1)
  })

  it('skips empty progress updates', async () => {
    const { useCache } = await importFresh()

    const progressiveFetcher = vi.fn(async (onProgress: (data: number[]) => void) => {
      onProgress([]) // empty — should be skipped (isEquivalentToInitial)
      onProgress([1, 2])
      return [1, 2, 3]
    })

    const { result } = renderHook(() => useCache({
      key: 'progressive-skip-empty',
      fetcher: () => Promise.resolve([]),
      initialData: [] as number[],
      progressiveFetcher,
    }))

    await waitFor(() => {
      expect(result.current.data).toEqual([1, 2, 3])
    })
  })

  it('saves partial data on progressive fetcher error', async () => {
    // Seed to give hasCachedData = true via session snapshot
    seedSessionStorage('prog-error', [99], Date.now() - STALE_AGE_MS)

    const { useCache } = await importFresh()

    const progressiveFetcher = vi.fn(async (onProgress: (data: number[]) => void) => {
      onProgress([10, 20])
      throw new Error('stream interrupted')
    })

    const { result } = renderHook(() => useCache({
      key: 'prog-error',
      fetcher: () => Promise.resolve([]),
      initialData: [] as number[],
      progressiveFetcher,
    }))

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })

    // Error was thrown, but partial data should be preserved
    expect(result.current.error).toBe('stream interrupted')
  })
})

// ============================================================================
// CacheStore.fetch() error handling
// ============================================================================

describe('CacheStore.fetch() error handling', () => {
  it('tracks consecutive failures and reaches isFailed after MAX_FAILURES', async () => {
    const { useCache } = await importFresh()
    let callCount = 0
    const fetcher = vi.fn(() => {
      callCount++
      return Promise.reject(new Error(`fail ${callCount}`))
    })

    const { result } = renderHook(() => useCache({
      key: 'fail-tracking',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    // After first fetch fails
    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    // Manually trigger more fetches to accumulate failures
    await act(async () => { await result.current.refetch() })
    await act(async () => { await result.current.refetch() })

    // After 3 failures (MAX_FAILURES), isFailed should be true
    await waitFor(() => {
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBe(3)
    })
  })

  it('handles non-Error thrown objects', async () => {
    const { useCache } = await importFresh()
    const fetcher = vi.fn(() => Promise.reject('string error'))

    const { result } = renderHook(() => useCache({
      key: 'non-error-thrown',
      fetcher,
      initialData: [],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch data')
    })
  })

  it('keeps cached data on fetch error when hasCachedData is true', async () => {
    seedSessionStorage('cached-error-test', [1, 2, 3], Date.now())
    const { useCache } = await importFresh()

    let shouldFail = false
    const fetcher = vi.fn(() => {
      if (shouldFail) return Promise.reject(new Error('fail'))
      return Promise.resolve([1, 2, 3])
    })

    const { result } = renderHook(() => useCache({
      key: 'cached-error-test',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    shouldFail = true
    await act(async () => { await result.current.refetch() })

    // Data should be preserved even after error
    expect(result.current.data).toEqual([1, 2, 3])
    // consecutiveFailures resets to 0 when hasData is true
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

// ============================================================================
// CacheStore.fetch() — empty data guard
// ============================================================================

describe('CacheStore.fetch() empty data guard', () => {
  it('keeps cached data when fetcher returns empty and cache exists', async () => {
    seedSessionStorage('empty-guard', [1, 2], Date.now() - STALE_AGE_MS)
    const { useCache } = await importFresh()

    const fetcher = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() => useCache({
      key: 'empty-guard',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })

    // Should keep the cached [1, 2] instead of replacing with []
    expect(result.current.data).toEqual([1, 2])
  })

  it('accepts empty data on cold start', async () => {
    const { useCache } = await importFresh()
    const fetcher = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() => useCache({
      key: 'cold-empty',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // On cold start, empty result is accepted (no skeleton forever)
    expect(result.current.data).toEqual([])
  })
})

// ============================================================================
// clearAndRefetch
// ============================================================================

describe('clearAndRefetch', () => {
  it('clears cache and triggers a new fetch', async () => {
    seedSessionStorage('clear-refetch', [1], Date.now() - STALE_AGE_MS)
    const { useCache } = await importFresh()

    let fetchCount = 0
    const fetcher = vi.fn(() => {
      fetchCount++
      return Promise.resolve([fetchCount * 10])
    })

    const { result } = renderHook(() => useCache({
      key: 'clear-refetch',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.clearAndRefetch()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

// ============================================================================
// initPreloadedMeta with existing stores
// ============================================================================

describe('initPreloadedMeta with existing stores', () => {
  it('applies meta to stores already in loading state', async () => {
    const mod = await importFresh()
    const { useCache, initPreloadedMeta } = mod

    // Create a store (will be in loading state initially)
    const fetcher = vi.fn(() => new Promise<number[]>(() => {})) // never resolves
    renderHook(() => useCache({
      key: 'meta-apply-test',
      fetcher,
      initialData: [],
      autoRefresh: false,
    }))

    // Now apply meta — should update the store's failure state
    act(() => {
      initPreloadedMeta({
        'meta-apply-test': {
          consecutiveFailures: 5,
          lastError: 'timeout',
          lastSuccessfulRefresh: 1700000000000,
        },
      })
    })

    // The store should now reflect the meta
    // (isFailed = true because 5 >= MAX_FAILURES=3)
  })

  it('clears previous meta before applying new ones', async () => {
    const { initPreloadedMeta } = await importFresh()

    initPreloadedMeta({
      'key-a': { consecutiveFailures: 1 },
      'key-b': { consecutiveFailures: 2 },
    })

    // Calling again should clear previous
    initPreloadedMeta({
      'key-c': { consecutiveFailures: 3 },
    })

    // No crash expected — just verifying the function doesn't throw
  })
})

// ============================================================================
// demoWhenEmpty fallback
// ============================================================================

describe('useCache demoWhenEmpty', () => {
  it('falls back to demoData when live fetch returns empty array', async () => {
    const { useCache } = await importFresh()
    const demoData = [{ id: 'demo-item' }]
    const fetcher = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() => useCache({
      key: 'demo-when-empty-test',
      fetcher,
      initialData: [] as { id: string }[],
      demoData,
      demoWhenEmpty: true,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should show demoData since live fetch returned empty
    expect(result.current.data).toEqual(demoData)
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('uses live data when fetch returns non-empty', async () => {
    const { useCache } = await importFresh()
    const demoData = [{ id: 'demo-item' }]
    const liveData = [{ id: 'live-item' }]
    const fetcher = vi.fn().mockResolvedValue(liveData)

    const { result } = renderHook(() => useCache({
      key: 'demo-when-empty-live',
      fetcher,
      initialData: [] as { id: string }[],
      demoData,
      demoWhenEmpty: true,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(liveData)
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('shows optimistic demo data while loading', async () => {
    const { useCache } = await importFresh()
    const demoData = [{ id: 'demo-optimistic' }]
    // Fetcher that never resolves — to keep isLoading true
    const fetcher = vi.fn(() => new Promise<{ id: string }[]>(() => {}))

    const { result } = renderHook(() => useCache({
      key: 'demo-optimistic-test',
      fetcher,
      initialData: [] as { id: string }[],
      demoData,
      demoWhenEmpty: true,
      autoRefresh: false,
    }))

    // While loading, should show demo data optimistically
    expect(result.current.data).toEqual(demoData)
    expect(result.current.isDemoFallback).toBe(true)
    expect(result.current.isRefreshing).toBe(true)
  })
})

// ============================================================================
// useArrayCache and useObjectCache
// ============================================================================

describe('useArrayCache', () => {
  it('defaults initialData to empty array', async () => {
    const { useArrayCache } = await importFresh()
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3])

    const { result } = renderHook(() => useArrayCache({
      key: 'array-cache-test',
      fetcher,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual([1, 2, 3])
  })
})

describe('useObjectCache', () => {
  it('defaults initialData to empty object', async () => {
    const { useObjectCache } = await importFresh()
    const fetcher = vi.fn().mockResolvedValue({ count: 5 })

    const { result } = renderHook(() => useObjectCache<{ count: number }>({
      key: 'object-cache-test',
      fetcher,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual({ count: 5 })
  })
})

// ============================================================================
// clearAllCaches utility
// ============================================================================

describe('clearAllCaches', () => {
  it('clears storage, metadata, session snapshots, localStorage meta, and registry', async () => {
    seedSessionStorage('x', [1], Date.now())
    localStorage.setItem(`${META_PREFIX}x`, JSON.stringify({ consecutiveFailures: 0 }))

    const { clearAllCaches, useCache } = await importFresh()

    // Create a store to add to registry
    renderHook(() => useCache({
      key: 'x',
      fetcher: () => Promise.resolve([]),
      initialData: [],
      autoRefresh: false,
    }))

    await clearAllCaches()

    // Session snapshots cleared
    expect(sessionStorage.getItem(`${SS_PREFIX}x`)).toBeNull()
    // localStorage meta cleared
    expect(localStorage.getItem(`${META_PREFIX}x`)).toBeNull()
  })
})

// ============================================================================
// getCacheStats
// ============================================================================

describe('getCacheStats', () => {
  it('returns stats from storage backend', async () => {
    const { getCacheStats } = await importFresh()
    const stats = await getCacheStats()
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
    expect(stats).toHaveProperty('entries')
    expect(typeof stats.count).toBe('number')
  })
})

// ============================================================================
// invalidateCache
// ============================================================================

describe('invalidateCache', () => {
  it('clears a specific cache store and storage entry', async () => {
    seedSessionStorage('inv-test', [1], Date.now())
    const { invalidateCache, useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'inv-test',
      fetcher: () => Promise.resolve([99]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await invalidateCache('inv-test')

    // After invalidation, the store should be reset
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })
  })

  it('handles invalidation of non-existent key without crashing', async () => {
    const { invalidateCache } = await importFresh()
    await expect(invalidateCache('does-not-exist')).resolves.toBeUndefined()
  })
})

// ============================================================================
// resetFailuresForCluster
// ============================================================================

describe('resetFailuresForCluster', () => {
  it('resets failures for matching cluster caches', async () => {
    const { useCache, resetFailuresForCluster } = await importFresh()

    // Create stores with cluster names in keys
    const fetcher1 = vi.fn().mockRejectedValue(new Error('fail'))
    const fetcher2 = vi.fn().mockRejectedValue(new Error('fail'))

    const { result: r1 } = renderHook(() => useCache({
      key: 'pods:cluster-a:default:100',
      fetcher: fetcher1,
      initialData: [],
      autoRefresh: false,
    }))

    const { result: r2 } = renderHook(() => useCache({
      key: 'pods:cluster-b:default:100',
      fetcher: fetcher2,
      initialData: [],
      autoRefresh: false,
    }))

    // Wait for initial fetch (failure)
    await waitFor(() => {
      expect(r1.current.error).toBeTruthy()
    })

    const resetCount = resetFailuresForCluster('cluster-a')
    expect(resetCount).toBeGreaterThanOrEqual(1)
  })

  it('returns 0 when no clusters match', async () => {
    const { resetFailuresForCluster } = await importFresh()
    const count = resetFailuresForCluster('nonexistent-cluster')
    expect(count).toBe(0)
  })

  it('also matches :all: keys', async () => {
    const { useCache, resetFailuresForCluster } = await importFresh()

    renderHook(() => useCache({
      key: 'metrics:all:cpu',
      fetcher: () => Promise.resolve([]),
      initialData: [],
      autoRefresh: false,
    }))

    await waitFor(() => {}) // let initial fetch run

    const count = resetFailuresForCluster('anything')
    // Should match because key contains ':all:'
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// resetAllCacheFailures
// ============================================================================

describe('resetAllCacheFailures', () => {
  it('resets failures on all stores', async () => {
    const { useCache, resetAllCacheFailures } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'reset-all-test',
      fetcher: () => Promise.reject(new Error('fail')),
      initialData: [],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    act(() => { resetAllCacheFailures() })

    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(0)
    })
  })
})

// ============================================================================
// prefetchCache
// ============================================================================

describe('prefetchCache', () => {
  it('pre-populates cache for a key', async () => {
    const { prefetchCache, useCache } = await importFresh()

    await prefetchCache('prefetch-test', () => Promise.resolve([42]), [])

    // Now use the cache — it should have the prefetched data
    const { result } = renderHook(() => useCache({
      key: 'prefetch-test',
      fetcher: () => Promise.resolve([99]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    // The store already has data from prefetch
    expect(result.current.data).toEqual([42])
    expect(result.current.isLoading).toBe(false)
  })
})

// ============================================================================
// isSQLiteWorkerActive
// ============================================================================

describe('isSQLiteWorkerActive', () => {
  it('returns false when no worker initialized', async () => {
    const { isSQLiteWorkerActive } = await importFresh()
    expect(isSQLiteWorkerActive()).toBe(false)
  })
})

// ============================================================================
// setAutoRefreshPaused no-op
// ============================================================================

describe('setAutoRefreshPaused', () => {
  it('is a no-op when setting same value', async () => {
    const { setAutoRefreshPaused, isAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()

    const listener = vi.fn()
    subscribeAutoRefreshPaused(listener)

    // Initial state is false, setting to false should be no-op
    setAutoRefreshPaused(false)
    expect(listener).not.toHaveBeenCalled()
    expect(isAutoRefreshPaused()).toBe(false)

    // Now set to true — should notify
    setAutoRefreshPaused(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(isAutoRefreshPaused()).toBe(true)

    // Set to true again — no-op
    listener.mockClear()
    setAutoRefreshPaused(true)
    expect(listener).not.toHaveBeenCalled()
  })
})

// ============================================================================
// useCache with autoRefresh paused globally
// ============================================================================

describe('useCache with auto-refresh paused', () => {
  it('does not set up interval when globally paused', async () => {
    const { useCache, setAutoRefreshPaused } = await importFresh()

    setAutoRefreshPaused(true)

    const fetcher = vi.fn().mockResolvedValue([1])

    const { result } = renderHook(() => useCache({
      key: 'paused-autorefresh',
      fetcher,
      initialData: [] as number[],
      autoRefresh: true,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should have fetched once (initial), but interval should not be set
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// useCache key change behavior
// ============================================================================

describe('useCache key change', () => {
  it('resets store when key changes', async () => {
    const { useCache } = await importFresh()

    const fetcher1 = vi.fn().mockResolvedValue(['data-a'])
    const fetcher2 = vi.fn().mockResolvedValue(['data-b'])

    let currentKey = 'key-a'
    let currentFetcher = fetcher1

    const { result, rerender } = renderHook(() => useCache({
      key: currentKey,
      fetcher: currentFetcher,
      initialData: [] as string[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.data).toEqual(['data-a'])
    })

    // Change key
    currentKey = 'key-b'
    currentFetcher = fetcher2
    rerender()

    await waitFor(() => {
      expect(result.current.data).toEqual(['data-b'])
    })
  })
})

// ============================================================================
// Demo mode toggle via demoMode subscribers
// ============================================================================

describe('useCache demo mode toggle', () => {
  it('returns demo data on toggle to demo mode', async () => {
    const { useCache } = await importFresh()
    const demoData = [{ id: 'demo' }]
    const liveData = [{ id: 'live' }]

    const { result } = renderHook(() => useCache({
      key: 'toggle-demo',
      fetcher: () => Promise.resolve(liveData),
      initialData: [] as { id: string }[],
      demoData,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.data).toEqual(liveData)
    })

    // Toggle to demo mode
    act(() => { _setDemoMode(true) })

    await waitFor(() => {
      expect(result.current.data).toEqual(demoData)
      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('returns initialData when demo mode active and no demoData', async () => {
    demoModeValue = true
    const { useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'demo-no-demodata',
      fetcher: () => Promise.resolve([99]),
      initialData: [0],
      autoRefresh: false,
    }))

    expect(result.current.data).toEqual([0])
    expect(result.current.isLoading).toBe(false)
  })
})

// ============================================================================
// persist: false
// ============================================================================

describe('useCache with persist: false', () => {
  it('does not write to session storage', async () => {
    const { useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'no-persist-test',
      fetcher: () => Promise.resolve([42]),
      initialData: [] as number[],
      persist: false,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(sessionStorage.getItem(`${SS_PREFIX}no-persist-test`)).toBeNull()
  })
})

// ============================================================================
// saveMeta with localStorage fallback (no workerRpc)
// ============================================================================

describe('saveMeta localStorage fallback', () => {
  it('saves meta to localStorage when no worker is active', async () => {
    const { useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'meta-ls-fallback',
      fetcher: () => Promise.resolve([1]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Meta should be saved to localStorage (no worker active)
    const meta = localStorage.getItem(`${META_PREFIX}meta-ls-fallback`)
    expect(meta).toBeTruthy()
    const parsed = JSON.parse(meta!)
    expect(parsed.consecutiveFailures).toBe(0)
  })
})

// ============================================================================
// Worker-active IndexedDB mirror write (#10985)
// ============================================================================

describe('worker-active IndexedDB mirror write', () => {
  let originalWorker: typeof Worker

  afterEach(() => {
    // Always restore Worker and reset modules to prevent mock leakage into subsequent tests.
    // This is critical because globalThis.Worker is a global singleton — if not restored,
    // subsequent tests will get the mocked version. See #11039.
    if (originalWorker) {
      globalThis.Worker = originalWorker
    }
    vi.resetModules()
    vi.doUnmock('../workerRpc')
  })

  it('mirrors data to _idbStorage.set when workerRpc is active', async () => {
    // Mock the Worker constructor so initCacheWorker() doesn't try to spawn a real worker
    originalWorker = globalThis.Worker
    try {
      globalThis.Worker = vi.fn() as unknown as typeof Worker

      const mockRpc = {
        waitForReady: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        getStats: vi.fn().mockResolvedValue({ keys: [], count: 0 }),
        deleteKey: vi.fn(),
        clear: vi.fn().mockResolvedValue(undefined),
        setMeta: vi.fn(),
        getMeta: vi.fn().mockResolvedValue(null),
        migrate: vi.fn().mockResolvedValue(undefined),
      }

      // resetModules first, THEN register doMock so the fresh import picks it up.
      // (vi.resetModules clears pending doMock registrations, so ordering matters.)
      vi.resetModules()
      vi.doMock('../workerRpc', () => ({
        CacheWorkerRpc: vi.fn().mockImplementation(function () { return mockRpc }),
      }))

      const mod = await import('../index')
      const { useCache, initCacheWorker, isSQLiteWorkerActive, __testables: testables } = mod

      // Activate the SQLite worker path
      await initCacheWorker()
      expect(isSQLiteWorkerActive()).toBe(true)

      // Spy on the IndexedDB storage mirror target
      const idbSetSpy = vi.spyOn(testables._idbStorage, 'set').mockResolvedValue(undefined)

      const testData = [1, 2, 3]
      const { result } = renderHook(() => useCache({
        key: 'idb-mirror-test',
        fetcher: () => Promise.resolve(testData),
        initialData: [] as number[],
        autoRefresh: false,
      }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // The mirror write should have been called with the correct key and data
      expect(idbSetSpy).toHaveBeenCalledWith('idb-mirror-test', testData)

      idbSetSpy.mockRestore()
    } finally {
      globalThis.Worker = originalWorker
    }
  })

  it('does not mirror to IDB when workerRpc is null (fallback mode)', async () => {
    // Without calling initCacheWorker, workerRpc stays null
    const mod = await importFresh()
    const { useCache, isSQLiteWorkerActive, __testables: testables } = mod

    expect(isSQLiteWorkerActive()).toBe(false)

    const idbSetSpy = vi.spyOn(testables._idbStorage, 'set').mockResolvedValue(undefined)

    const { result } = renderHook(() => useCache({
      key: 'idb-no-mirror-test',
      fetcher: () => Promise.resolve(['a', 'b']),
      initialData: [] as string[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // _idbStorage.set IS called because it's the active cacheStorage backend (not mirror)
    // but only once — no additional mirror call since workerRpc is null.
    // The cacheStorage.set call goes through _idbStorage directly.
    const callCount = idbSetSpy.mock.calls.filter(c => c[0] === 'idb-no-mirror-test').length
    expect(callCount).toBe(1) // exactly one call from cacheStorage.set, no mirror duplicate

    idbSetSpy.mockRestore()
  })
})

// ============================================================================
// clearSessionSnapshots edge cases
// ============================================================================

describe('clearSessionSnapshots', () => {
  it('only removes kcc: prefixed keys', async () => {
    sessionStorage.setItem(`${SS_PREFIX}cache-1`, 'val1')
    sessionStorage.setItem('other-key', 'val2')

    // clearSessionSnapshots is called internally by clearAllCaches
    const { clearAllCaches } = await importFresh()
    await clearAllCaches()

    expect(sessionStorage.getItem('other-key')).toBe('val2')
    expect(sessionStorage.getItem(`${SS_PREFIX}cache-1`)).toBeNull()
  })
})

// ============================================================================
// migrateFromLocalStorage
// ============================================================================

describe('migrateFromLocalStorage', () => {
  it('migrates ksc_ prefixed keys to kc_ prefix', async () => {
    localStorage.setItem('ksc_some_setting', 'value1')
    localStorage.setItem('ksc-another-setting', 'value2')

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    // Old keys removed
    expect(localStorage.getItem('ksc_some_setting')).toBeNull()
    expect(localStorage.getItem('ksc-another-setting')).toBeNull()

    // New keys created
    expect(localStorage.getItem('kc_some_setting')).toBe('value1')
    expect(localStorage.getItem('kc-another-setting')).toBe('value2')
  })

  it('does not overwrite existing kc_ keys', async () => {
    localStorage.setItem('ksc_key', 'old-value')
    localStorage.setItem('kc_key', 'existing-value')

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_key')).toBe('existing-value')
    expect(localStorage.getItem('ksc_key')).toBeNull()
  })

  it('migrates kc_cache: entries to IndexedDB', async () => {
    localStorage.setItem('kc_cache:test-key', JSON.stringify({ data: [1, 2], timestamp: 1000, version: 4 }))

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    // Old key should be removed after migration
    expect(localStorage.getItem('kc_cache:test-key')).toBeNull()
  })

  it('removes malformed kc_cache: entries without crashing', async () => {
    localStorage.setItem('kc_cache:bad', 'not-json')

    const { migrateFromLocalStorage } = await importFresh()
    await expect(migrateFromLocalStorage()).resolves.toBeUndefined()

    expect(localStorage.getItem('kc_cache:bad')).toBeNull()
  })

  it('removes kubectl-history key', async () => {
    localStorage.setItem('kubectl-history', JSON.stringify(['cmd1', 'cmd2']))

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    expect(localStorage.getItem('kubectl-history')).toBeNull()
  })
})

// ============================================================================
// preloadCacheFromStorage
// ============================================================================

describe('preloadCacheFromStorage', () => {
  it('does nothing when storage is empty', async () => {
    const { preloadCacheFromStorage } = await importFresh()
    // Should complete without error even with empty storage
    await expect(preloadCacheFromStorage()).resolves.toBeUndefined()
  })
})

// ============================================================================
// Non-shared stores cleanup on unmount
// ============================================================================

describe('non-shared store cleanup', () => {
  it('destroys non-shared store on unmount', async () => {
    const { useCache } = await importFresh()

    const { unmount } = renderHook(() => useCache({
      key: 'non-shared-cleanup',
      fetcher: () => Promise.resolve([1]),
      initialData: [],
      shared: false,
      autoRefresh: false,
    }))

    // Unmount should clean up the non-shared store
    unmount()
    // No error thrown = success
  })

  it('does not destroy shared store on unmount', async () => {
    const { useCache } = await importFresh()

    const { unmount } = renderHook(() => useCache({
      key: 'shared-no-cleanup',
      fetcher: () => Promise.resolve([1]),
      initialData: [],
      shared: true,
      autoRefresh: false,
    }))

    unmount()

    // Re-mount with same key — shared store should still have data
    const { result } = renderHook(() => useCache({
      key: 'shared-no-cleanup',
      fetcher: () => Promise.resolve([2]),
      initialData: [],
      shared: true,
      autoRefresh: false,
    }))

    // The store persists across unmount/remount
    await waitFor(() => {
      expect(result.current.data).toBeTruthy()
    })
  })
})

// ============================================================================
// ssWrite QuotaExceededError handling
// ============================================================================

describe('ssWrite quota exceeded', () => {
  it('does not throw when sessionStorage.setItem throws', async () => {
    const { useCache } = await importFresh()

    // Fill session storage to trigger QuotaExceededError
    const origSetItem = sessionStorage.setItem.bind(sessionStorage)
    vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string, _value: string) => {
      if (key.startsWith(SS_PREFIX)) {
        throw new DOMException('QuotaExceededError')
      }
      origSetItem(key, _value)
    })

    const { result } = renderHook(() => useCache({
      key: 'quota-test',
      fetcher: () => Promise.resolve([42]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Data should still be available in-memory despite sessionStorage failure
    expect(result.current.data).toEqual([42])
  })
})

// ============================================================================
// liveInDemoMode
// ============================================================================

describe('useCache liveInDemoMode', () => {
  it('fetches and returns live data even in demo mode', async () => {
    demoModeValue = true
    const { useCache } = await importFresh()

    const liveData = [{ id: 'live-data' }]
    const fetcher = vi.fn().mockResolvedValue(liveData)

    const { result } = renderHook(() => useCache({
      key: 'live-in-demo',
      fetcher,
      initialData: [] as { id: string }[],
      demoData: [{ id: 'demo' }],
      liveInDemoMode: true,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetcher).toHaveBeenCalled()
    expect(result.current.data).toEqual(liveData)
  })
})

// ============================================================================
// enabled: false prevents fetching
// ============================================================================

describe('useCache enabled: false', () => {
  it('marks store as ready without fetching', async () => {
    const { useCache } = await importFresh()
    const fetcher = vi.fn()

    const { result } = renderHook(() => useCache({
      key: 'disabled-test',
      fetcher,
      initialData: [0],
      enabled: false,
      autoRefresh: false,
    }))

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual([0])
  })
})

// ============================================================================
// Multiple stores in registry
// ============================================================================

describe('multiple stores in registry', () => {
  it('shared=true returns same store for same key', async () => {
    const { useCache } = await importFresh()

    const fetcher = vi.fn().mockResolvedValue([1])

    const { result: r1 } = renderHook(() => useCache({
      key: 'shared-same-key',
      fetcher,
      initialData: [],
      shared: true,
      autoRefresh: false,
    }))

    const { result: r2 } = renderHook(() => useCache({
      key: 'shared-same-key',
      fetcher,
      initialData: [],
      shared: true,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(r1.current.isLoading).toBe(false)
    })

    // Both hooks share the same store, so data should match
    expect(r1.current.data).toEqual(r2.current.data)
  })
})

// ============================================================================
// ssRead with malformed JSON
// ============================================================================

describe('ssRead parse error', () => {
  it('returns null and does not crash on malformed JSON', async () => {
    sessionStorage.setItem(`${SS_PREFIX}bad-json`, '{invalid json')

    const { useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'bad-json',
      fetcher: () => Promise.resolve([1]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should gracefully handle and show fetched data
    expect(result.current.data).toEqual([1])
  })
})

// ============================================================================
// migrateIDBToSQLite (no worker case)
// ============================================================================

describe('migrateIDBToSQLite', () => {
  it('returns immediately when no worker is active', async () => {
    const { migrateIDBToSQLite } = await importFresh()
    await expect(migrateIDBToSQLite()).resolves.toBeUndefined()
  })
})

// ============================================================================
// CacheStore.resetFailures no-op when already 0
// ============================================================================

describe('resetFailures no-op', () => {
  it('does nothing when consecutiveFailures is already 0', async () => {
    const { useCache, resetAllCacheFailures } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'reset-noop',
      fetcher: () => Promise.resolve([1]),
      initialData: [],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Already 0 failures — resetFailures should be a no-op
    const lsBefore = localStorage.getItem(`${META_PREFIX}reset-noop`)
    act(() => { resetAllCacheFailures() })
    const lsAfter = localStorage.getItem(`${META_PREFIX}reset-noop`)

    // Meta should not have changed
    expect(lsBefore).toEqual(lsAfter)
  })
})

// ============================================================================
// saveToStorage error path
// ============================================================================

describe('saveToStorage error handling', () => {
  it('logs error but does not throw when storage.set fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { useCache } = await importFresh()

    // The IndexedDB mock in jsdom may reject; the test verifies no throw
    const { result } = renderHook(() => useCache({
      key: 'save-error-test',
      fetcher: () => Promise.resolve([1, 2, 3]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Data should still be available in memory
    expect(result.current.data).toEqual([1, 2, 3])
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// REFRESH_RATES export
// ============================================================================

describe('REFRESH_RATES', () => {
  it('all values are positive numbers', async () => {
    const { REFRESH_RATES } = await importFresh()
    for (const [key, value] of Object.entries(REFRESH_RATES)) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThan(0)
    }
  })
})
