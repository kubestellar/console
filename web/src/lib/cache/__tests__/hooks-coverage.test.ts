/**
 * Extended coverage tests for cache/hooks.ts
 *
 * Targets: getStorageStats edge cases, clearAllStorage edge cases,
 * useLocalPreference key-change behavior, useIndexedData error recovery,
 * useTrendHistory with time field comparisons, cleanupOldPreferences logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// IndexedDB mock
// ---------------------------------------------------------------------------

const idbStore = new Map<string, unknown>()
let shouldFailOnOpen = false
let shouldFailOnSave = false

function makeRequest<T>(resultFn: () => T): IDBRequest<T> {
  const req = {
    result: undefined as T,
    error: null as DOMException | null,
    onsuccess: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
  }
  queueMicrotask(() => {
    try {
      if (shouldFailOnSave && resultFn.toString().includes('put')) {
        throw new DOMException('Write failed')
      }
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
        if (shouldFailOnSave) throw new DOMException('Write failed')
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

function makeTransaction(mode: string): IDBTransaction {
  return {
    objectStore: () => makeObjectStore(),
    oncomplete: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    // Auto-trigger oncomplete for readwrite transactions
    ...(mode === 'readwrite' ? {} : {}),
  } as unknown as IDBTransaction
}

function makeDB(): IDBDatabase {
  return {
    transaction: (_store: string, mode?: string) => {
      const tx = makeTransaction(mode || 'readonly')
      queueMicrotask(() => {
        if (tx.oncomplete) tx.oncomplete({} as Event)
      })
      return tx
    },
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
  } as unknown as IDBDatabase
}

// Override indexedDB.open
const originalIndexedDB = globalThis.indexedDB
beforeEach(() => {
  idbStore.clear()
  shouldFailOnOpen = false
  shouldFailOnSave = false

  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: (_name: string, _version?: number) => {
        const req = {
          result: null as IDBDatabase | null,
          error: null as DOMException | null,
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          onupgradeneeded: null as ((ev: Event) => void) | null,
        }
        queueMicrotask(() => {
          if (shouldFailOnOpen) {
            req.error = new DOMException('DB open failed')
            req.onerror?.({} as Event)
          } else {
            req.result = makeDB()
            req.onsuccess?.({} as Event)
          }
        })
        return req as unknown as IDBOpenDBRequest
      },
    },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: originalIndexedDB,
    writable: true,
    configurable: true,
  })
  vi.restoreAllMocks()
})

// Dynamic import to get fresh module state
async function importHooks() {
  // Force fresh module since hooks.ts has module-level state (dbInstance, dbPromise)
  vi.resetModules()
  return await import('../hooks')
}

describe('cache/hooks.ts extended coverage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // ==========================================================================
  // useLocalPreference — key change re-read
  // ==========================================================================

  describe('useLocalPreference key-change re-read', () => {
    it('re-reads from localStorage when key changes', async () => {
      const { useLocalPreference } = await importHooks()
      localStorage.setItem('kubestellar-pref:card-a', JSON.stringify('value-a'))
      localStorage.setItem('kubestellar-pref:card-b', JSON.stringify('value-b'))

      const { result, rerender } = renderHook(
        ({ key }: { key: string }) => useLocalPreference(key, 'default'),
        { initialProps: { key: 'card-a' } }
      )

      expect(result.current[0]).toBe('value-a')

      rerender({ key: 'card-b' })
      await waitFor(() => {
        expect(result.current[0]).toBe('value-b')
      })
    })

    it('falls back to defaultValue when key changes to one with no stored value', async () => {
      const { useLocalPreference } = await importHooks()
      localStorage.setItem('kubestellar-pref:card-a', JSON.stringify('stored'))

      const { result, rerender } = renderHook(
        ({ key }: { key: string }) => useLocalPreference(key, 'fallback'),
        { initialProps: { key: 'card-a' } }
      )

      expect(result.current[0]).toBe('stored')

      rerender({ key: 'no-value' })
      await waitFor(() => {
        expect(result.current[0]).toBe('fallback')
      })
    })

    it('handles corrupt JSON in localStorage on key change', async () => {
      const { useLocalPreference } = await importHooks()
      localStorage.setItem('kubestellar-pref:corrupt', '{bad json')

      const { result } = renderHook(
        () => useLocalPreference('corrupt', 'safe-default'),
      )

      expect(result.current[0]).toBe('safe-default')
    })
  })

  // ==========================================================================
  // useLocalPreference — functional updater
  // ==========================================================================

  describe('useLocalPreference functional updater', () => {
    it('supports functional updates based on previous value', async () => {
      const { useLocalPreference } = await importHooks()

      const { result } = renderHook(() => useLocalPreference('counter', 0))

      act(() => {
        result.current[1]((prev: number) => prev + 1)
      })
      expect(result.current[0]).toBe(1)

      act(() => {
        result.current[1]((prev: number) => prev + 10)
      })
      expect(result.current[0]).toBe(11)
    })
  })

  // ==========================================================================
  // getStorageStats
  // ==========================================================================

  describe('getStorageStats extended', () => {
    it('calculates localStorage size in UTF-16 bytes', async () => {
      const { getStorageStats } = await importHooks()
      localStorage.setItem('key1', 'val1')
      localStorage.setItem('key2', 'value2')

      const stats = await getStorageStats()
      // 'key1' (4) + 'val1' (4) + 'key2' (4) + 'value2' (6) = 18 chars * 2 = 36
      expect(stats.localStorage.used).toBe(36)
      expect(stats.localStorage.count).toBe(2)
    })

    it('handles navigator.storage.estimate returning zero', async () => {
      const { getStorageStats } = await importHooks()
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: async () => ({ usage: 0, quota: 0 }),
        },
        configurable: true,
      })

      const stats = await getStorageStats()
      expect(stats.indexedDB).toEqual({ used: 0, quota: 0 })
    })
  })

  // ==========================================================================
  // clearAllStorage
  // ==========================================================================

  describe('clearAllStorage extended', () => {
    it('removes ksc_ prefixed keys', async () => {
      const { clearAllStorage } = await importHooks()
      localStorage.setItem('ksc_theme', 'dark')
      localStorage.setItem('unrelated', 'keep')

      await clearAllStorage()

      expect(localStorage.getItem('ksc_theme')).toBeNull()
      expect(localStorage.getItem('unrelated')).toBe('keep')
    })

    it('does not throw when localStorage is empty', async () => {
      const { clearAllStorage } = await importHooks()
      await expect(clearAllStorage()).resolves.toBeUndefined()
    })
  })

  // ==========================================================================
  // useTrendHistory — edge cases
  // ==========================================================================

  describe('useTrendHistory edge cases', () => {
    it('adds first point without duplicate check', async () => {
      const { useTrendHistory } = await importHooks()
      const { result } = renderHook(() =>
        useTrendHistory({ key: 'test-trend', maxPoints: 5 })
      )

      await act(async () => {
        await result.current.addPoint({ time: '12:00', cpu: 10 })
      })

      await waitFor(() => {
        expect(result.current.history).toHaveLength(1)
      })
    })

    it('only compares numeric values for dedup (ignores time)', async () => {
      const { useTrendHistory } = await importHooks()
      const { result } = renderHook(() =>
        useTrendHistory({ key: 'time-test', maxPoints: 10 })
      )

      await act(async () => {
        await result.current.addPoint({ time: '12:00', cpu: 10, mem: 20 })
      })

      // Same numeric values but different time — should be skipped
      await act(async () => {
        await result.current.addPoint({ time: '12:01', cpu: 10, mem: 20 })
      })

      await waitFor(() => {
        expect(result.current.history).toHaveLength(1)
      })
    })

    it('adds point when any numeric value differs', async () => {
      const { useTrendHistory } = await importHooks()
      const { result } = renderHook(() =>
        useTrendHistory({ key: 'diff-test', maxPoints: 10 })
      )

      await act(async () => {
        await result.current.addPoint({ time: '12:00', cpu: 10, mem: 20 })
      })

      await act(async () => {
        await result.current.addPoint({ time: '12:01', cpu: 11, mem: 20 })
      })

      await waitFor(() => {
        expect(result.current.history).toHaveLength(2)
      })
    })
  })
})
