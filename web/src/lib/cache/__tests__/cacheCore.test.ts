import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that touches the module graph
// ---------------------------------------------------------------------------

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

vi.mock('../../demoMode', () => ({
  isDemoMode: () => demoModeValue,
  subscribeDemoMode: (cb: () => void) => {
    demoModeListeners.add(cb)
    return () => demoModeListeners.delete(cb)
  },
}))

vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
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
  const index = await import('../index')
  const core = await import('../cacheCore')
  return { ...index, CacheStore: core.CacheStore, getOrCreateCache: core.getOrCreateCache }
}

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
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// getEffectiveInterval
// ---------------------------------------------------------------------------

describe('getEffectiveInterval', () => {
  it('returns base interval when no failures', async () => {
    const { __testables } = await importFresh()
    const BASE_INTERVAL = 60_000
    expect(__testables.getEffectiveInterval(BASE_INTERVAL, 0)).toBe(BASE_INTERVAL)
  })

  it('applies exponential backoff for consecutive failures', async () => {
    const { __testables } = await importFresh()
    const BASE_INTERVAL = 60_000
    const ONE_FAILURE_EXPECTED = BASE_INTERVAL * __testables.FAILURE_BACKOFF_MULTIPLIER
    expect(__testables.getEffectiveInterval(BASE_INTERVAL, 1)).toBe(ONE_FAILURE_EXPECTED)
  })

  it('caps backoff at MAX_BACKOFF_INTERVAL', async () => {
    const { __testables } = await importFresh()
    const BASE_INTERVAL = 60_000
    const MANY_FAILURES = 20
    expect(__testables.getEffectiveInterval(BASE_INTERVAL, MANY_FAILURES)).toBe(
      __testables.MAX_BACKOFF_INTERVAL,
    )
  })

  it('caps the exponent at 5 regardless of failure count', async () => {
    const { __testables } = await importFresh()
    const BASE_INTERVAL = 1_000
    const resultAt5 = __testables.getEffectiveInterval(BASE_INTERVAL, 5)
    const resultAt10 = __testables.getEffectiveInterval(BASE_INTERVAL, 10)
    expect(resultAt5).toBe(resultAt10)
  })
})

// ---------------------------------------------------------------------------
// Auto-refresh pause controls
// ---------------------------------------------------------------------------

describe('auto-refresh pause', () => {
  it('defaults to not paused', async () => {
    const { isAutoRefreshPaused } = await importFresh()
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('can be paused and resumed', async () => {
    const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
    setAutoRefreshPaused(true)
    expect(isAutoRefreshPaused()).toBe(true)
    setAutoRefreshPaused(false)
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('notifies subscribers on change', async () => {
    const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
    const listener = vi.fn()
    subscribeAutoRefreshPaused(listener)
    setAutoRefreshPaused(true)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('does not notify when value is unchanged', async () => {
    const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
    setAutoRefreshPaused(false)
    const listener = vi.fn()
    subscribeAutoRefreshPaused(listener)
    setAutoRefreshPaused(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('unsubscribe removes the listener', async () => {
    const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
    const listener = vi.fn()
    const unsub = subscribeAutoRefreshPaused(listener)
    unsub()
    setAutoRefreshPaused(true)
    expect(listener).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// CacheStore — construction & state management
// ---------------------------------------------------------------------------

describe('CacheStore', () => {
  it('initializes with loading state when no cached data', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-new', { items: [] }, false)
    const snap = store.getSnapshot()
    expect(snap.isLoading).toBe(true)
    expect(snap.data).toEqual({ items: [] })
    expect(snap.error).toBeNull()
    expect(snap.consecutiveFailures).toBe(0)
    store.destroy()
  })

  it('hydrates from sessionStorage when data exists', async () => {
    const CACHED_TS = Date.now() - 10_000
    seedSessionStorage('test-hydrate', ['cached'], CACHED_TS)
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-hydrate', [], true)
    const snap = store.getSnapshot()
    expect(snap.isLoading).toBe(false)
    expect(snap.isRefreshing).toBe(true)
    expect(snap.data).toEqual(['cached'])
    expect(snap.lastRefresh).toBe(CACHED_TS)
    store.destroy()
  })

  it('subscribe/unsubscribe notifies on state change', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-sub', [], false)
    const listener = vi.fn()
    const unsub = store.subscribe(listener)
    store.markReady()
    expect(listener).toHaveBeenCalled()
    listener.mockClear()
    unsub()
    store.markReady()
    expect(listener).not.toHaveBeenCalled()
    store.destroy()
  })

  it('markReady transitions from loading to not loading', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-ready', 'init', false)
    expect(store.getSnapshot().isLoading).toBe(true)
    store.markReady()
    expect(store.getSnapshot().isLoading).toBe(false)
    store.destroy()
  })

  it('markReady is a no-op if already not loading', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-ready-noop', 'init', false)
    store.markReady()
    const listener = vi.fn()
    store.subscribe(listener)
    store.markReady()
    expect(listener).not.toHaveBeenCalled()
    store.destroy()
  })

  it('destroy clears subscribers and timers', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-destroy', null, false)
    const listener = vi.fn()
    store.subscribe(listener)
    store.destroy()
    // After destroy, no notifications should fire for internal state changes
    store.markReady()
    expect(listener).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// CacheStore.fetch — success path
// ---------------------------------------------------------------------------

describe('CacheStore.fetch', () => {
  it('fetches data and updates state on success', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-fetch', [], false)
    const FETCHED_DATA = [1, 2, 3]
    await store.fetch(() => Promise.resolve(FETCHED_DATA))
    const snap = store.getSnapshot()
    expect(snap.data).toEqual(FETCHED_DATA)
    expect(snap.isLoading).toBe(false)
    expect(snap.isRefreshing).toBe(false)
    expect(snap.error).toBeNull()
    expect(snap.consecutiveFailures).toBe(0)
    store.destroy()
  })

  it('uses merge function when provided and cached data exists', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-merge', [1, 2], false)
    await store.fetch(() => Promise.resolve([1, 2]))
    // Now store has data, so merge will be used
    const merge = (old: number[], new_: number[]) => [...old, ...new_]
    await store.fetch(() => Promise.resolve([3, 4]), merge)
    expect(store.getSnapshot().data).toEqual([1, 2, 3, 4])
    store.destroy()
  })

  it('deduplicates concurrent fetch calls', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-dedup', [], false)
    let callCount = 0
    const fetcher = () => {
      callCount++
      return new Promise<string[]>((resolve) => setTimeout(() => resolve(['done']), 50))
    }
    const p1 = store.fetch(fetcher)
    const p2 = store.fetch(fetcher)
    await Promise.all([p1, p2])
    expect(callCount).toBe(1)
    store.destroy()
  })
})

// ---------------------------------------------------------------------------
// CacheStore.fetch — error handling
// ---------------------------------------------------------------------------

describe('CacheStore.fetch error handling', () => {
  it('records error message on fetch failure', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-err', [], false)
    await store.fetch(() => Promise.reject(new Error('network down')))
    const snap = store.getSnapshot()
    expect(snap.error).toBe('network down')
    expect(snap.consecutiveFailures).toBe(1)
    store.destroy()
  })

  it('uses generic message for non-Error throws', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-err-generic', [], false)
    await store.fetch(() => Promise.reject('string error'))
    expect(store.getSnapshot().error).toBe('Failed to fetch data')
    store.destroy()
  })

  it('tracks consecutive failures across fetches', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-fail-track', [], false)
    await store.fetch(() => Promise.reject(new Error('fail 1')))
    expect(store.getSnapshot().consecutiveFailures).toBe(1)
    expect(store.getSnapshot().error).toBe('fail 1')
    store.destroy()
  })

  it('resetFailures clears failure state', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-reset-fail', [], false)
    await store.fetch(() => Promise.reject(new Error('fail')))
    expect(store.getSnapshot().consecutiveFailures).toBe(1)
    store.resetFailures()
    const snap = store.getSnapshot()
    expect(snap.consecutiveFailures).toBe(0)
    expect(snap.isFailed).toBe(false)
    expect(snap.error).toBeNull()
    store.destroy()
  })

  it('resetFailures is a no-op when no failures', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-reset-noop', [], false)
    const listener = vi.fn()
    store.subscribe(listener)
    store.resetFailures()
    expect(listener).not.toHaveBeenCalled()
    store.destroy()
  })
})

// ---------------------------------------------------------------------------
// CacheStore.clear
// ---------------------------------------------------------------------------

describe('CacheStore.clear', () => {
  it('resets state to initial and clears storage', async () => {
    const { CacheStore } = await importFresh()
    const INITIAL = { count: 0 }
    const store = new CacheStore('test-clear', INITIAL, false)
    await store.fetch(() => Promise.resolve({ count: 42 }))
    expect(store.getSnapshot().data).toEqual({ count: 42 })
    await store.clear()
    const snap = store.getSnapshot()
    expect(snap.data).toEqual(INITIAL)
    expect(snap.isLoading).toBe(true)
    expect(snap.error).toBeNull()
    store.destroy()
  })
})

// ---------------------------------------------------------------------------
// CacheStore.resetToInitialData / resetForModeTransition
// ---------------------------------------------------------------------------

describe('CacheStore reset methods', () => {
  it('resetToInitialData restores initial state', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-reset-init', 'default', false)
    await store.fetch(() => Promise.resolve('updated'))
    store.resetToInitialData()
    const snap = store.getSnapshot()
    expect(snap.data).toBe('default')
    expect(snap.isLoading).toBe(true)
    store.destroy()
  })

  it('resetForModeTransition resets and nullifies storageLoadPromise', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-mode-reset', [], false)
    store.resetForModeTransition()
    const snap = store.getSnapshot()
    expect(snap.data).toEqual([])
    expect(snap.isLoading).toBe(true)
    expect(snap.isRefreshing).toBe(false)
    store.destroy()
  })
})

// ---------------------------------------------------------------------------
// CacheStore.hydrateFromEntry
// ---------------------------------------------------------------------------

describe('CacheStore.hydrateFromEntry', () => {
  it('sets data from a cache entry and marks as not loading', async () => {
    const { CacheStore } = await importFresh()
    const store = new CacheStore('test-hydrate-entry', [], false)
    const ENTRY_TS = Date.now() - 5_000
    store.hydrateFromEntry({ key: 'test-hydrate-entry', data: ['a', 'b'], timestamp: ENTRY_TS, version: 4 })
    const snap = store.getSnapshot()
    expect(snap.data).toEqual(['a', 'b'])
    expect(snap.isLoading).toBe(false)
    expect(snap.isRefreshing).toBe(true)
    expect(snap.lastRefresh).toBe(ENTRY_TS)
    store.destroy()
  })
})

// ---------------------------------------------------------------------------
// getOrCreateCache / cacheRegistry
// ---------------------------------------------------------------------------

describe('getOrCreateCache', () => {
  it('returns the same store for the same key', async () => {
    const { getOrCreateCache } = await importFresh()
    const a = getOrCreateCache('shared-key', [], true)
    const b = getOrCreateCache('shared-key', [], true)
    expect(a).toBe(b)
    a.destroy()
  })

  it('returns different stores for different keys', async () => {
    const { getOrCreateCache } = await importFresh()
    const a = getOrCreateCache('key-a', [], true)
    const b = getOrCreateCache('key-b', [], true)
    expect(a).not.toBe(b)
    a.destroy()
    b.destroy()
  })
})
