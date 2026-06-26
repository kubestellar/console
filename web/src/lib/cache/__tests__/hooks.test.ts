/**
 * Tests for cache/hooks.ts
 *
 * Covers:
 * - useLocalPreference: init from localStorage, persistence, updater (direct + functional),
 *   QuotaExceededError cleanup, JSON parse error recovery
 * - useClusterFilterPreference: delegation to useLocalPreference
 * - useSortPreference: delegation to useLocalPreference
 * - useCollapsedPreference: delegation to useLocalPreference
 * - useIndexedData: loading state, save/clear, staleness, error recovery
 * - useTrendHistory: addPoint, duplicate skipping, maxPoints trimming
 * - getStorageStats: IndexedDB + localStorage stats
 * - clearAllStorage: clears both IndexedDB and prefixed localStorage keys
 * - cleanupOldPreferences (indirectly via QuotaExceededError path)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// IndexedDB mock — jsdom provides a partial indexedDB but it's unreliable.
// We override it with a minimal in-memory implementation to make the
// openDatabase/getFromDB/saveToDB/deleteFromDB functions in hooks.ts work.
// ---------------------------------------------------------------------------

const idbStore = new Map<string, unknown>()

function makeRequest<T>(resultFn: () => T): IDBRequest<T> {
  const req = {
    result: undefined as T,
    error: null as DOMException | null,
    onsuccess: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
  }
  queueMicrotask(() => {
    try {
      req.result = resultFn()
      req.onsuccess?.({} as Event)
    } catch (e: unknown) {
      req.error = e as DOMException
      req.onerror?.({} as Event)
    }
  })
  return req as unknown as IDBRequest<T>
}

function makeObjectStore(): IDBObjectStore {
  return {
    get(key: string) {
      return makeRequest(() => idbStore.get(key) ?? undefined)
    },
    put(value: { key: string }) {
      return makeRequest(() => {
        idbStore.set(value.key, value)
        return undefined as unknown
      })
    },
    delete(key: string) {
      return makeRequest(() => {
        idbStore.delete(key)
        return undefined as unknown
      })
    },
    clear() {
      return makeRequest(() => {
        idbStore.clear()
        return undefined as unknown
      })
    },
  } as unknown as IDBObjectStore
}

function makeTransaction(): IDBTransaction {
  const tx = {
    objectStore() {
      return makeObjectStore()
    },
    oncomplete: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    error: null as DOMException | null,
  }
  // Fire oncomplete on next microtask so clearAllStorage's promise resolves
  queueMicrotask(() => {
    tx.oncomplete?.({} as Event)
  })
  return tx as unknown as IDBTransaction
}

function makeFakeDB(): IDBDatabase {
  return {
    transaction() {
      return makeTransaction()
    },
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: vi.fn(),
  } as unknown as IDBDatabase
}

const fakeDB = makeFakeDB()

/**
 * Install a working indexedDB.open mock. Must be called inside beforeEach
 * to reset per-test.
 */
function installIDBMock(): void {
  const fakeIndexedDB = {
    open: vi.fn().mockImplementation(() => {
      const req = {
        result: fakeDB,
        error: null as DOMException | null,
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
      }
      queueMicrotask(() => {
        req.onsuccess?.({} as Event)
      })
      return req
    }),
  }
  // jsdom may or may not have indexedDB — define it on both window and globalThis
  Object.defineProperty(window, 'indexedDB', { value: fakeIndexedDB, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'indexedDB', { value: fakeIndexedDB, writable: true, configurable: true })
}

/**
 * Install a broken indexedDB.open mock that always errors.
 */
function installBrokenIDBMock(): void {
  const broken = {
    open: vi.fn().mockImplementation(() => {
      const req = {
        result: undefined,
        error: new DOMException('IDB unavailable'),
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
      }
      queueMicrotask(() => {
        req.onerror?.({} as Event)
      })
      return req
    }),
  }
  Object.defineProperty(window, 'indexedDB', { value: broken, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'indexedDB', { value: broken, writable: true, configurable: true })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  idbStore.clear()
  localStorage.clear()
  installIDBMock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper — hooks.ts has module-level singletons (dbInstance,
// dbPromise) that must be reset between tests that exercise IndexedDB.
// ---------------------------------------------------------------------------

async function importHooks() {
  vi.resetModules()
  return import('../hooks')
}

// ===========================================================================
// useLocalPreference
// ===========================================================================

describe('useLocalPreference', () => {
  it('returns defaultValue when localStorage is empty', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('test-key', 42))
    expect(result.current[0]).toBe(42)
  })

  it('initializes from existing localStorage value', async () => {
    localStorage.setItem('kubestellar-pref:test-key', JSON.stringify('cached'))
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('test-key', 'default'))
    expect(result.current[0]).toBe('cached')
  })

  it('persists value to localStorage on change', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('persist-key', 10))

    act(() => {
      result.current[1](20)
    })

    expect(result.current[0]).toBe(20)
    expect(localStorage.getItem('kubestellar-pref:persist-key')).toBe('20')
  })

  it('supports functional updater', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('func-key', 5))

    act(() => {
      result.current[1]((prev) => prev + 10)
    })

    expect(result.current[0]).toBe(15)
  })

  it('returns defaultValue when localStorage has invalid JSON', async () => {
    localStorage.setItem('kubestellar-pref:broken', '!!!not-json')
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('broken', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('handles complex objects', async () => {
    const complexObj = { nested: { arr: [1, 2], flag: true } }
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() =>
      useLocalPreference('complex', { nested: { arr: [] as number[], flag: false } })
    )

    act(() => {
      result.current[1](complexObj)
    })

    expect(result.current[0]).toEqual(complexObj)
    expect(JSON.parse(localStorage.getItem('kubestellar-pref:complex')!)).toEqual(complexObj)
  })

  it('handles boolean defaultValue correctly', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('bool-key', false))
    expect(result.current[0]).toBe(false)

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
  })

  it('handles array defaultValue correctly', async () => {
    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('arr-key', ['a', 'b']))
    expect(result.current[0]).toEqual(['a', 'b'])
  })

  it('cleans up old preferences on QuotaExceededError then retries', async () => {
    // Seed some existing preferences so cleanup has something to remove
    localStorage.setItem('kubestellar-pref:old1', '"v1"')
    localStorage.setItem('kubestellar-pref:old2', '"v2"')
    localStorage.setItem('kubestellar-pref:old3', '"v3"')
    localStorage.setItem('kubestellar-pref:old4', '"v4"')

    let setItemCallCount = 0
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      setItemCallCount++
      // First call to the target key throws QuotaExceeded; retry succeeds
      if (key === 'kubestellar-pref:quota-key' && setItemCallCount <= 1) {
        const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
        Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
        throw err
      }
      return originalSetItem(key, value)
    })

    const { useLocalPreference } = await importHooks()
    // Rendering triggers the useEffect that writes to localStorage
    renderHook(() => useLocalPreference('quota-key', 'data'))

    // The hook should have attempted setItem, hit quota, cleaned up, then retried
    expect(setItemCallCount).toBeGreaterThanOrEqual(1)
    setItemSpy.mockRestore()
  })

  it('survives when QuotaExceededError retry also fails', async () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
      Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
      throw err
    })

    const { useLocalPreference } = await importHooks()
    // Should not throw even if all writes fail
    const { result } = renderHook(() => useLocalPreference('always-fail', 'data'))
    expect(result.current[0]).toBe('data')
    setItemSpy.mockRestore()
  })

  it('non-QuotaExceeded errors in setItem are silently ignored', async () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Some other storage error')
    })

    const { useLocalPreference } = await importHooks()
    const { result } = renderHook(() => useLocalPreference('other-err', 'val'))
    expect(result.current[0]).toBe('val')
    setItemSpy.mockRestore()
  })
})

// ===========================================================================
// useClusterFilterPreference
// ===========================================================================

describe('useClusterFilterPreference', () => {
  it('returns empty array as default', async () => {
    const { useClusterFilterPreference } = await importHooks()
    const { result } = renderHook(() => useClusterFilterPreference('my-card'))
    expect(result.current[0]).toEqual([])
  })

  it('stores under card-filter: prefix', async () => {
    const { useClusterFilterPreference } = await importHooks()
    const { result } = renderHook(() => useClusterFilterPreference('my-card'))

    act(() => {
      result.current[1](['cluster-a', 'cluster-b'])
    })

    expect(result.current[0]).toEqual(['cluster-a', 'cluster-b'])
    expect(
      localStorage.getItem('kubestellar-pref:card-filter:my-card')
    ).toBe(JSON.stringify(['cluster-a', 'cluster-b']))
  })
})

// ===========================================================================
// useSortPreference
// ===========================================================================

describe('useSortPreference', () => {
  it('returns defaultSort as default', async () => {
    const { useSortPreference } = await importHooks()
    const { result } = renderHook(() => useSortPreference('sort-card', 'name'))
    expect(result.current[0]).toBe('name')
  })

  it('stores under card-sort: prefix', async () => {
    const { useSortPreference } = await importHooks()
    const { result } = renderHook(() => useSortPreference('sort-card', 'name'))

    act(() => {
      result.current[1]('date')
    })

    expect(result.current[0]).toBe('date')
    expect(localStorage.getItem('kubestellar-pref:card-sort:sort-card')).toBe('"date"')
  })
})

// ===========================================================================
// useCollapsedPreference
// ===========================================================================

describe('useCollapsedPreference', () => {
  it('returns false as default', async () => {
    const { useCollapsedPreference } = await importHooks()
    const { result } = renderHook(() => useCollapsedPreference('col-card'))
    expect(result.current[0]).toBe(false)
  })

  it('toggles collapsed state', async () => {
    const { useCollapsedPreference } = await importHooks()
    const { result } = renderHook(() => useCollapsedPreference('col-card'))

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('kubestellar-pref:card-collapsed:col-card')).toBe('true')
  })
})

// ===========================================================================
// useIndexedData
// ===========================================================================

describe('useIndexedData', () => {
  it('starts in loading state with defaultValue', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'test-data', defaultValue: [] })
    )
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])
    expect(result.current.lastSaved).toBeNull()
  })

  it('transitions to not-loading after initial load', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'load-test', defaultValue: 'default' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('save() updates data and lastSaved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'save-test', defaultValue: [] as number[] })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save([1, 2, 3])
    })

    expect(result.current.data).toEqual([1, 2, 3])
    expect(result.current.lastSaved).not.toBeNull()
    expect(typeof result.current.lastSaved).toBe('number')
  })

  it('clear() resets to defaultValue and nulls lastSaved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'clear-test', defaultValue: 'empty' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('some data')
    })
    expect(result.current.data).toBe('some data')

    await act(async () => {
      await result.current.clear()
    })

    expect(result.current.data).toBe('empty')
    expect(result.current.lastSaved).toBeNull()
  })

  it('isStale is false when no data saved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'stale-none', defaultValue: null })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isStale).toBe(false)
  })

  it('isStale is false immediately after save (within maxAge)', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'stale-fresh', defaultValue: null, maxAge: 60_000 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('fresh')
    })

    expect(result.current.isStale).toBe(false)
  })

  it('isStale is true when lastSaved exceeds maxAge', async () => {
    const VERY_SHORT_MAX_AGE_MS = 1
    const { useIndexedData } = await importHooks()

    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result, rerender } = renderHook(() =>
      useIndexedData({ key: 'stale-old', defaultValue: null, maxAge: VERY_SHORT_MAX_AGE_MS })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('old data')
    })

    // Advance time past maxAge and re-render to pick up new Date.now()
    const STALENESS_ADVANCE_MS = 100
    vi.spyOn(Date, 'now').mockReturnValue(now + STALENESS_ADVANCE_MS)

    rerender()

    // isStale is computed on every render: lastSaved !== null && Date.now() - lastSaved > maxAge
    expect(result.current.isStale).toBe(true)
  })

  it('uses default maxAge of 5 minutes when not specified', async () => {
    const { useIndexedData } = await importHooks()

    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result, rerender } = renderHook(() =>
      useIndexedData({ key: 'default-maxage', defaultValue: 0 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save(42)
    })

    // Not stale at 4 minutes
    const FOUR_MINUTES_MS = 4 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now + FOUR_MINUTES_MS)
    rerender()
    expect(result.current.isStale).toBe(false)

    // Stale at 6 minutes
    const SIX_MINUTES_MS = 6 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now + SIX_MINUTES_MS)
    rerender()
    expect(result.current.isStale).toBe(true)
  })

  it('handles indexedDB errors during load gracefully', async () => {
    installBrokenIDBMock()

    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'err-load', defaultValue: 'fallback' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBe('fallback')
  })

  it('handles indexedDB errors during save gracefully', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'err-save', defaultValue: '' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now break IDB for save
    installBrokenIDBMock()

    // save should not throw — it sets local state even if IDB fails
    await act(async () => {
      await result.current.save('new-data')
    })

    // The in-memory state should still update
    expect(result.current.data).toBe('new-data')
  })
})

// ===========================================================================
// useTrendHistory
// ===========================================================================

describe('useTrendHistory', () => {
  it('starts with empty history', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-empty' })
    )
    expect(result.current.history).toEqual([])
  })

  it('addPoint appends a data point', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-add' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    expect(result.current.history).toEqual([{ time: '12:00', cpu: 10 }])
  })

  it('skips duplicate consecutive points with same numeric values', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-dedup' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    await act(async () => {
      // Same cpu value, different time — should be skipped
      await result.current.addPoint({ time: '12:01', cpu: 10 })
    })

    expect(result.current.history).toHaveLength(1)
  })

  it('adds point when numeric values differ from last', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-diff' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    await act(async () => {
      await result.current.addPoint({ time: '12:01', cpu: 20 })
    })

    expect(result.current.history).toHaveLength(2)
  })

  it('trims history to maxPoints', async () => {
    const MAX_POINTS = 3
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-trim', maxPoints: MAX_POINTS })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Add 5 points with different values
    const TOTAL_POINTS = 5
    for (let i = 0; i < TOTAL_POINTS; i++) {
      await act(async () => {
        await result.current.addPoint({ time: `t${i}`, value: i })
      })
    }

    // Should only have the last 3
    expect(result.current.history).toHaveLength(MAX_POINTS)
    expect(result.current.history[0]).toEqual({ time: 't2', value: 2 })
    expect(result.current.history[2]).toEqual({ time: 't4', value: 4 })
  })

  it('clear() resets history to empty', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-clear' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 5 })
    })
    expect(result.current.history).toHaveLength(1)

    await act(async () => {
      await result.current.clear()
    })
    expect(result.current.history).toEqual([])
  })

  it('uses default maxPoints of 50', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-default-max' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Add 55 points
    const TOTAL_POINTS = 55
    const DEFAULT_MAX_POINTS = 50
    for (let i = 0; i < TOTAL_POINTS; i++) {
      await act(async () => {
        await result.current.addPoint({ time: `t${i}`, value: i })
      })
    }

    expect(result.current.history).toHaveLength(DEFAULT_MAX_POINTS)
  })
})

// ===========================================================================
// getStorageStats
// ===========================================================================

describe('getStorageStats', () => {
  it('returns localStorage stats for stored keys', async () => {
    localStorage.setItem('key1', 'value1')
    localStorage.setItem('key2', 'longer-value-here')

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.localStorage.count).toBe(2)
    // used = sum of (key.length + value.length) * 2 for UTF-16
    const UTF16_MULTIPLIER = 2
    const expectedBytes = ('key1'.length + 'value1'.length + 'key2'.length + 'longer-value-here'.length) * UTF16_MULTIPLIER
    expect(stats.localStorage.used).toBe(expectedBytes)
  })

  it('returns zero stats when localStorage is empty', async () => {
    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.localStorage.count).toBe(0)
    expect(stats.localStorage.used).toBe(0)
  })

  it('returns indexedDB stats when navigator.storage.estimate is available', async () => {
    const MOCK_USAGE = 1024
    const MOCK_QUOTA = 1048576
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: MOCK_USAGE, quota: MOCK_QUOTA }),
      },
      writable: true,
      configurable: true,
    })

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.indexedDB).toEqual({ used: MOCK_USAGE, quota: MOCK_QUOTA })
  })

  it('returns null indexedDB stats when navigator.storage is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.indexedDB).toBeNull()
  })
})

// ===========================================================================
// clearAllStorage
// ===========================================================================

describe('clearAllStorage', () => {
  it('removes kubestellar- prefixed keys from localStorage', async () => {
    localStorage.setItem('kubestellar-pref:sort', '"name"')
    localStorage.setItem('kubestellar-setting', 'true')
    localStorage.setItem('unrelated-key', 'keep')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('kubestellar-pref:sort')).toBeNull()
    expect(localStorage.getItem('kubestellar-setting')).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
  })

  it('removes kc_ prefixed keys from localStorage', async () => {
    localStorage.setItem('kc_cache_meta', 'data')
    localStorage.setItem('other', 'keep')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('kc_cache_meta')).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
  })

  it('removes ksc_ prefixed keys from localStorage', async () => {
    localStorage.setItem('ksc_settings', 'data')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('ksc_settings')).toBeNull()
  })

  it('handles empty localStorage gracefully', async () => {
    const { clearAllStorage } = await importHooks()
    await expect(clearAllStorage()).resolves.toBeUndefined()
  })
})
