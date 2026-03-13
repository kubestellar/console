/**
 * Storage Hooks for Cards
 *
 * Provides easy-to-use hooks for cards to leverage IndexedDB and localStorage
 * with proper separation of concerns:
 * - IndexedDB: Large data (logs, metrics, history)
 * - localStorage: Small preferences (filters, sort, collapsed state)
 */

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// localStorage Hook for Preferences
// ============================================================================

/**
 * Hook for storing small preferences in localStorage
 * Use for: filters, sort order, collapsed state, UI preferences
 *
 * @example
 * const [sortBy, setSortBy] = useLocalPreference('deployment-issues-sort', 'name')
 * const [collapsed, setCollapsed] = useLocalPreference('my-card-collapsed', false)
 */
export function useLocalPreference<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `kubestellar-pref:${key}`

  // Initialize from localStorage
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        return JSON.parse(stored) as T
      }
    } catch {
      // Ignore parse errors
    }
    return defaultValue
  })

  // Persist to localStorage when value changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch (e) {
      // Quota exceeded - remove old preferences
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        cleanupOldPreferences()
        try {
          localStorage.setItem(storageKey, JSON.stringify(value))
        } catch {
          // Give up
        }
      }
    }
  }, [storageKey, value])

  const updateValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prev)
        : newValue
      return next
    })
  }, [])

  return [value, updateValue]
}

/**
 * Hook for storing cluster filter preferences
 */
export function useClusterFilterPreference(cardKey: string) {
  return useLocalPreference<string[]>(`card-filter:${cardKey}`, [])
}

/**
 * Hook for storing sort preferences
 */
export function useSortPreference<T extends string>(cardKey: string, defaultSort: T) {
  return useLocalPreference<T>(`card-sort:${cardKey}`, defaultSort)
}

/**
 * Hook for storing collapsed state
 */
export function useCollapsedPreference(cardKey: string) {
  return useLocalPreference<boolean>(`card-collapsed:${cardKey}`, false)
}

// ============================================================================
// IndexedDB Hook for Large Data
// ============================================================================

interface UseIndexedDataOptions<T> {
  /** Unique key for this data */
  key: string
  /** Default value when no data cached */
  defaultValue: T
  /** Max age in milliseconds before data is considered stale (default: 5 min) */
  maxAge?: number
}

interface UseIndexedDataResult<T> {
  /** The cached data */
  data: T
  /** Whether data is being loaded from IndexedDB */
  isLoading: boolean
  /** Timestamp of when data was last saved */
  lastSaved: number | null
  /** Whether data is stale (older than maxAge) */
  isStale: boolean
  /** Save new data to IndexedDB */
  save: (data: T) => Promise<void>
  /** Clear cached data */
  clear: () => Promise<void>
}

/**
 * Hook for storing large data in IndexedDB
 * Use for: logs, metrics history, scan results, command output
 *
 * @example
 * const { data, save, isStale } = useIndexedData<EventLog[]>({
 *   key: 'events:prod-cluster',
 *   defaultValue: [],
 *   maxAge: 5 * 60 * 1000, // 5 minutes
 * })
 *
 * // Save new data
 * await save(newEvents)
 */
export function useIndexedData<T>({
  key,
  defaultValue,
  maxAge = 5 * 60 * 1000,
}: UseIndexedDataOptions<T>): UseIndexedDataResult<T> {
  const [data, setData] = useState<T>(defaultValue)
  const [isLoading, setIsLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState<number | null>(null)

  // Load from IndexedDB on mount
  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const db = await openDatabase()
        const result = await getFromDB<{ data: T; timestamp: number }>(db, key)
        if (mounted && result) {
          setData(result.data)
          setLastSaved(result.timestamp)
        }
      } catch (e) {
        console.error(`[IndexedData] Failed to load ${key}:`, e)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => { mounted = false }
  }, [key])

  const save = useCallback(async (newData: T) => {
    setData(newData)
    const timestamp = Date.now()
    setLastSaved(timestamp)

    try {
      const db = await openDatabase()
      await saveToDB(db, key, { data: newData, timestamp })
    } catch (e) {
      console.error(`[IndexedData] Failed to save ${key}:`, e)
    }
  }, [key])

  const clear = useCallback(async () => {
    setData(defaultValue)
    setLastSaved(null)

    try {
      const db = await openDatabase()
      await deleteFromDB(db, key)
    } catch (e) {
      console.error(`[IndexedData] Failed to clear ${key}:`, e)
    }
  }, [key, defaultValue])

  const isStale = lastSaved !== null && Date.now() - lastSaved > maxAge

  return { data, isLoading, lastSaved, isStale, save, clear }
}

// ============================================================================
// IndexedDB Utilities
// ============================================================================

const DB_NAME = 'kc_cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'

let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
  })

  return dbPromise
}

async function getFromDB<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)

    request.onsuccess = () => {
      const result = request.result
      resolve(result ? result.value : null)
    }
    request.onerror = () => resolve(null)
  })
}

async function saveToDB<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({ key, value })

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function deleteFromDB(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(key)

    request.onsuccess = () => resolve()
    request.onerror = () => resolve() // Ignore errors
  })
}

// ============================================================================
// Cleanup Utilities
// ============================================================================

/**
 * Remove old localStorage preferences to free up space
 */
function cleanupOldPreferences(): void {
  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('kubestellar-pref:')) {
      keysToRemove.push(key)
    }
  }

  // Remove oldest half
  const removeCount = Math.ceil(keysToRemove.length / 2)
  for (let i = 0; i < removeCount; i++) {
    localStorage.removeItem(keysToRemove[i])
  }
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  indexedDB: { used: number; quota: number } | null
  localStorage: { used: number; count: number }
}> {
  // IndexedDB stats
  let indexedDBStats = null
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    indexedDBStats = {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    }
  }

  // localStorage stats
  let localStorageUsed = 0
  let localStorageCount = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      const value = localStorage.getItem(key)
      if (value) {
        localStorageUsed += key.length + value.length
        localStorageCount++
      }
    }
  }

  return {
    indexedDB: indexedDBStats,
    localStorage: { used: localStorageUsed * 2, count: localStorageCount }, // *2 for UTF-16
  }
}

/**
 * Clear all cached data (both IndexedDB and localStorage)
 */
export async function clearAllStorage(): Promise<void> {
  // Clear IndexedDB
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.clear()
  } catch {
    // Ignore
  }

  // Clear kubestellar localStorage
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('kubestellar-') || key?.startsWith('kc_') || key?.startsWith('ksc_')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

// ============================================================================
// Trend History Hook (for time-series cards)
// ============================================================================

interface TrendPoint {
  time: string
  [key: string]: number | string
}

interface UseTrendHistoryOptions {
  /** Unique key for this trend data */
  key: string
  /** Max data points to keep (default: 50) */
  maxPoints?: number
  /** Max age in milliseconds (default: 30 min) */
  maxAge?: number
}

/**
 * Hook for storing trend/time-series data in IndexedDB
 * Use for: resource trends, metrics history, health trends
 *
 * @example
 * const { history, addPoint, clear, isStale } = useTrendHistory<ResourcePoint>({
 *   key: 'resource-trend',
 *   maxPoints: 24,
 *   maxAge: 30 * 60 * 1000, // 30 minutes
 * })
 *
 * // Add new data point
 * addPoint({ time: '12:00', cpuCores: 10, memoryGB: 32 })
 */
export function useTrendHistory<T extends TrendPoint>({
  key,
  maxPoints = 50,
  maxAge = 30 * 60 * 1000,
}: UseTrendHistoryOptions) {
  const {
    data: history,
    isLoading,
    lastSaved,
    isStale,
    save,
    clear,
  } = useIndexedData<T[]>({
    key: `trend:${key}`,
    defaultValue: [],
    maxAge,
  })

  const addPoint = useCallback(async (point: T) => {
    // Check if this point is different from the last one (avoid duplicates)
    const lastPoint = history[history.length - 1]
    if (lastPoint) {
      // Compare all numeric values
      const isDifferent = Object.keys(point).some(k => {
        if (k === 'time') return false
        return point[k] !== lastPoint[k]
      })
      if (!isDifferent) return // Skip if data unchanged
    }

    // Add new point and trim to maxPoints
    const newHistory = [...history, point].slice(-maxPoints)
    await save(newHistory)
  }, [history, maxPoints, save])

  return {
    history,
    isLoading,
    lastSaved,
    isStale,
    addPoint,
    clear,
  }
}
