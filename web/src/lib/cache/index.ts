/**
 * Unified Caching Layer for Dashboard Cards
 *
 * This module provides a single, consistent caching pattern that all cards should use.
 * Uses IndexedDB for large data storage (50MB+ quota) with localStorage fallback.
 *
 * Features:
 * - IndexedDB persistence for large data (no more quota issues)
 * - Stale-while-revalidate (show cached data while fetching)
 * - Subscriber pattern for multi-component updates
 * - Configurable refresh rates by data category
 * - Failure tracking with consecutive failure counts
 * - Loading vs Refreshing state distinction
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, isRefreshing, refetch } = useCache({
 *   key: 'pods',
 *   fetcher: () => api.getPods(),
 *   category: 'pods',
 * })
 * ```
 */

import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react'

// ============================================================================
// Configuration
// ============================================================================

/** Cache version - increment when cache structure changes to invalidate old caches */
const CACHE_VERSION = 3

/** IndexedDB configuration */
const DB_NAME = 'ksc_cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'

/** Storage key prefixes (for localStorage metadata only) */
const META_PREFIX = 'ksc_meta:'

/** Maximum consecutive failures before marking as failed */
const MAX_FAILURES = 3

/** Minimum time to show refreshing indicator (ensures visibility) */
const MIN_REFRESH_INDICATOR_MS = 500

/** Refresh rates by data category (in milliseconds) */
export const REFRESH_RATES = {
  // Real-time data - refresh frequently
  realtime: 15_000,      // 15 seconds (events, alerts)
  pods: 30_000,          // 30 seconds

  // Cluster state - moderate refresh
  clusters: 60_000,      // 1 minute
  deployments: 60_000,   // 1 minute
  services: 60_000,      // 1 minute

  // Resource metrics
  metrics: 45_000,       // 45 seconds
  gpu: 45_000,           // 45 seconds

  // GitOps/Helm data - less frequent
  helm: 120_000,         // 2 minutes
  gitops: 120_000,       // 2 minutes

  // Static-ish data
  namespaces: 180_000,   // 3 minutes
  rbac: 300_000,         // 5 minutes
  operators: 300_000,    // 5 minutes

  // Cost data - very infrequent
  costs: 600_000,        // 10 minutes

  // Default
  default: 120_000,      // 2 minutes
} as const

export type RefreshCategory = keyof typeof REFRESH_RATES

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T> {
  key: string
  data: T
  timestamp: number
  version: number
}

interface CacheMeta {
  consecutiveFailures: number
  lastError?: string
  lastSuccessfulRefresh?: number
}

interface CacheState<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
}

type Subscriber = () => void

// ============================================================================
// IndexedDB Storage Layer
// ============================================================================

class IndexedDBStorage {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase> | null = null
  private isSupported: boolean = true

  constructor() {
    // Check if IndexedDB is available
    this.isSupported = typeof indexedDB !== 'undefined'
    if (this.isSupported) {
      this.initDB()
    }
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
          console.warn('[Cache] IndexedDB open failed:', request.error)
          this.isSupported = false
          reject(request.error)
        }

        request.onsuccess = () => {
          this.db = request.result
          resolve(this.db)
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // Create cache store if it doesn't exist
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
            store.createIndex('timestamp', 'timestamp', { unique: false })
          }
        }
      } catch (e) {
        console.warn('[Cache] IndexedDB not available:', e)
        this.isSupported = false
        reject(e)
      }
    })

    return this.dbPromise
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.isSupported) return null

    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(key)

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined
          if (entry && entry.version === CACHE_VERSION) {
            resolve(entry)
          } else {
            resolve(null)
          }
        }

        request.onerror = () => {
          console.warn('[Cache] IndexedDB get failed:', request.error)
          resolve(null)
        }
      })
    } catch {
      return null
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    if (!this.isSupported) return

    try {
      const db = await this.initDB()
      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(entry)

        request.onsuccess = () => resolve()
        request.onerror = () => {
          console.warn('[Cache] IndexedDB set failed:', request.error)
          reject(request.error)
        }
      })
    } catch (e) {
      console.warn('[Cache] IndexedDB set error:', e)
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isSupported) return

    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(key)

        request.onsuccess = () => resolve()
        request.onerror = () => {
          console.warn('[Cache] IndexedDB delete failed:', request.error)
          resolve()
        }
      })
    } catch {
      // Ignore
    }
  }

  async clear(): Promise<void> {
    if (!this.isSupported) return

    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.clear()

        request.onsuccess = () => {
          console.log('[Cache] IndexedDB cleared')
          resolve()
        }
        request.onerror = () => {
          console.warn('[Cache] IndexedDB clear failed:', request.error)
          resolve()
        }
      })
    } catch {
      // Ignore
    }
  }

  async getStats(): Promise<{ keys: string[]; count: number }> {
    if (!this.isSupported) return { keys: [], count: 0 }

    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const keys: string[] = []

        const request = store.openCursor()
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            keys.push(cursor.key as string)
            cursor.continue()
          } else {
            resolve({ keys, count: keys.length })
          }
        }
        request.onerror = () => resolve({ keys: [], count: 0 })
      })
    } catch {
      return { keys: [], count: 0 }
    }
  }
}

// Singleton IndexedDB storage instance
const idbStorage = new IndexedDBStorage()

// ============================================================================
// Cache Store (Module-level singleton)
// ============================================================================

class CacheStore<T> {
  private state: CacheState<T>
  private subscribers = new Set<Subscriber>()
  private fetchingRef = false
  private refreshTimeoutRef: ReturnType<typeof setTimeout> | null = null
  private initialDataLoaded = false

  constructor(
    private key: string,
    private initialData: T,
    private persist: boolean = true
  ) {
    // Initialize with initial data, then async load from IndexedDB
    const meta = this.loadMeta()

    this.state = {
      data: initialData,
      isLoading: true,
      isRefreshing: false,
      error: meta.lastError ?? null,
      isFailed: meta.consecutiveFailures >= MAX_FAILURES,
      consecutiveFailures: meta.consecutiveFailures,
      lastRefresh: null,
    }

    // Async load from IndexedDB
    if (this.persist) {
      this.loadFromStorage()
    }
  }

  // Storage operations (async via IndexedDB)
  private async loadFromStorage(): Promise<void> {
    if (!this.persist || this.initialDataLoaded) return

    try {
      const entry = await idbStorage.get<T>(this.key)
      if (entry) {
        this.initialDataLoaded = true
        this.setState({
          data: entry.data,
          isLoading: false,
          lastRefresh: entry.timestamp,
        })
      }
    } catch {
      // Ignore errors, will use initial data
    }
  }

  private async saveToStorage(data: T): Promise<void> {
    if (!this.persist) return
    try {
      await idbStorage.set(this.key, data)
    } catch (e) {
      console.warn(`[Cache] Failed to save ${this.key}:`, e)
    }
  }

  // Metadata stored in localStorage (small, sync access needed)
  private loadMeta(): CacheMeta {
    try {
      const stored = localStorage.getItem(META_PREFIX + this.key)
      if (!stored) return { consecutiveFailures: 0 }
      return JSON.parse(stored) as CacheMeta
    } catch {
      return { consecutiveFailures: 0 }
    }
  }

  private saveMeta(meta: CacheMeta): void {
    try {
      localStorage.setItem(META_PREFIX + this.key, JSON.stringify(meta))
    } catch {
      // Ignore - localStorage might be full but that's okay for metadata
    }
  }

  // State management
  getSnapshot = (): CacheState<T> => this.state

  subscribe = (callback: Subscriber): (() => void) => {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb())
  }

  private setState(updates: Partial<CacheState<T>>): void {
    this.state = { ...this.state, ...updates }
    this.notify()
  }

  // Fetching
  async fetch(fetcher: () => Promise<T>, merge?: (old: T, new_: T) => T): Promise<void> {
    if (this.fetchingRef) return
    this.fetchingRef = true

    const hasCachedData = this.state.data !== this.initialData || this.initialDataLoaded
    const startTime = Date.now()

    this.setState({
      isLoading: !hasCachedData,
      isRefreshing: hasCachedData,
    })

    try {
      const newData = await fetcher()
      const finalData = merge && hasCachedData ? merge(this.state.data, newData) : newData

      // Ensure minimum refresh indicator time
      const elapsed = Date.now() - startTime
      if (elapsed < MIN_REFRESH_INDICATOR_MS) {
        await new Promise(r => setTimeout(r, MIN_REFRESH_INDICATOR_MS - elapsed))
      }

      await this.saveToStorage(finalData)
      this.saveMeta({ consecutiveFailures: 0, lastSuccessfulRefresh: Date.now() })

      this.initialDataLoaded = true
      this.setState({
        data: finalData,
        isLoading: false,
        isRefreshing: false,
        error: null,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: Date.now(),
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch data'
      const newFailures = this.state.consecutiveFailures + 1

      this.saveMeta({
        consecutiveFailures: newFailures,
        lastError: errorMessage,
        lastSuccessfulRefresh: this.state.lastRefresh ?? undefined,
      })

      this.setState({
        isLoading: false,
        isRefreshing: false,
        error: errorMessage,
        isFailed: newFailures >= MAX_FAILURES,
        consecutiveFailures: newFailures,
      })
    } finally {
      this.fetchingRef = false
    }
  }

  // Clear cache
  async clear(): Promise<void> {
    await idbStorage.delete(this.key)
    localStorage.removeItem(META_PREFIX + this.key)
    this.initialDataLoaded = false
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
  }

  // Cleanup
  destroy(): void {
    if (this.refreshTimeoutRef) {
      clearTimeout(this.refreshTimeoutRef)
    }
    this.subscribers.clear()
  }
}

// ============================================================================
// Cache Registry (for shared caches)
// ============================================================================

const cacheRegistry = new Map<string, CacheStore<unknown>>()

function getOrCreateCache<T>(key: string, initialData: T, persist: boolean): CacheStore<T> {
  if (!cacheRegistry.has(key)) {
    cacheRegistry.set(key, new CacheStore(key, initialData, persist))
  }
  return cacheRegistry.get(key) as CacheStore<T>
}

// ============================================================================
// Main Hook
// ============================================================================

export interface UseCacheOptions<T> {
  /** Unique cache key */
  key: string
  /** Function to fetch data */
  fetcher: () => Promise<T>
  /** Refresh category (determines auto-refresh interval) */
  category?: RefreshCategory
  /** Custom refresh interval in ms (overrides category) */
  refreshInterval?: number
  /** Initial data when cache is empty */
  initialData: T
  /** Whether to persist to IndexedDB (default: true) */
  persist?: boolean
  /** Whether to auto-refresh at interval (default: true) */
  autoRefresh?: boolean
  /** Whether fetching is enabled (default: true) */
  enabled?: boolean
  /** Merge function for combining old and new data */
  merge?: (oldData: T, newData: T) => T
  /** Share cache across components with same key (default: true) */
  shared?: boolean
}

export interface UseCacheResult<T> {
  /** The cached/fetched data */
  data: T
  /** Whether initial load is happening (no cached data) */
  isLoading: boolean
  /** Whether a background refresh is in progress */
  isRefreshing: boolean
  /** Error message if last fetch failed */
  error: string | null
  /** Whether 3+ consecutive failures */
  isFailed: boolean
  /** Number of consecutive failures */
  consecutiveFailures: number
  /** Timestamp of last successful refresh */
  lastRefresh: number | null
  /** Manually trigger a refresh */
  refetch: () => Promise<void>
  /** Clear cache and refetch */
  clearAndRefetch: () => Promise<void>
}

export function useCache<T>({
  key,
  fetcher,
  category = 'default',
  refreshInterval,
  initialData,
  persist = true,
  autoRefresh = true,
  enabled = true,
  merge,
  shared = true,
}: UseCacheOptions<T>): UseCacheResult<T> {
  // Get or create cache store
  const storeRef = useRef<CacheStore<T> | null>(null)

  if (!storeRef.current) {
    storeRef.current = shared
      ? getOrCreateCache(key, initialData, persist)
      : new CacheStore(key, initialData, persist)
  }

  const store = storeRef.current

  // Subscribe to store updates using useSyncExternalStore for concurrent mode safety
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  )

  // Memoized fetcher wrapper
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const mergeRef = useRef(merge)
  mergeRef.current = merge

  const refetch = useCallback(async () => {
    if (!enabled) return
    await store.fetch(() => fetcherRef.current(), mergeRef.current)
  }, [enabled, store])

  const clearAndRefetch = useCallback(async () => {
    await store.clear()
    await refetch()
  }, [store, refetch])

  // Initial fetch and auto-refresh
  const effectiveInterval = refreshInterval ?? REFRESH_RATES[category]

  useEffect(() => {
    if (!enabled) return

    // Initial fetch
    refetch()

    // Auto-refresh interval
    if (autoRefresh) {
      const intervalId = setInterval(refetch, effectiveInterval)
      return () => clearInterval(intervalId)
    }
  }, [enabled, autoRefresh, effectiveInterval, refetch])

  // Cleanup non-shared stores on unmount
  useEffect(() => {
    return () => {
      if (!shared && storeRef.current) {
        storeRef.current.destroy()
      }
    }
  }, [shared])

  return {
    data: state.data,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    isFailed: state.isFailed,
    consecutiveFailures: state.consecutiveFailures,
    lastRefresh: state.lastRefresh,
    refetch,
    clearAndRefetch,
  }
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/** Hook for array data with automatic empty array initial value */
export function useArrayCache<T>(
  options: Omit<UseCacheOptions<T[]>, 'initialData'> & { initialData?: T[] }
): UseCacheResult<T[]> {
  return useCache({
    ...options,
    initialData: options.initialData ?? [],
  })
}

/** Hook for object data with automatic empty object initial value */
export function useObjectCache<T extends Record<string, unknown>>(
  options: Omit<UseCacheOptions<T>, 'initialData'> & { initialData?: T }
): UseCacheResult<T> {
  return useCache({
    ...options,
    initialData: options.initialData ?? ({} as T),
  })
}

// ============================================================================
// Utilities
// ============================================================================

/** Clear all caches (both IndexedDB and localStorage metadata) */
export async function clearAllCaches(): Promise<void> {
  // Clear IndexedDB
  await idbStorage.clear()

  // Clear localStorage metadata
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(META_PREFIX)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))

  // Clear registry
  cacheRegistry.clear()
}

/** Get cache statistics */
export async function getCacheStats(): Promise<{ keys: string[]; count: number; entries: number }> {
  const stats = await idbStorage.getStats()
  return { ...stats, entries: cacheRegistry.size }
}

/** Invalidate a specific cache (force refetch on next use) */
export async function invalidateCache(key: string): Promise<void> {
  const store = cacheRegistry.get(key)
  if (store) {
    await (store as CacheStore<unknown>).clear()
  }
  await idbStorage.delete(key)
  localStorage.removeItem(META_PREFIX + key)
}

/** Prefetch data into cache */
export async function prefetchCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  initialData: T
): Promise<void> {
  const store = getOrCreateCache(key, initialData, true)
  await store.fetch(fetcher)
}

/** Migrate old localStorage cache to IndexedDB (run once on app startup) */
export async function migrateFromLocalStorage(): Promise<void> {
  const OLD_PREFIX = 'ksc_cache:'
  const keysToMigrate: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(OLD_PREFIX)) {
      keysToMigrate.push(key)
    }
  }

  for (const fullKey of keysToMigrate) {
    try {
      const stored = localStorage.getItem(fullKey)
      if (stored) {
        const entry = JSON.parse(stored)
        const key = fullKey.replace(OLD_PREFIX, '')
        // Only migrate if data looks valid
        if (entry.data !== undefined) {
          await idbStorage.set(key, entry.data)
          console.log(`[Cache] Migrated ${key} to IndexedDB`)
        }
      }
      // Remove old localStorage entry after migration
      localStorage.removeItem(fullKey)
    } catch (e) {
      console.warn(`[Cache] Failed to migrate ${fullKey}:`, e)
      // Remove corrupted entry
      localStorage.removeItem(fullKey)
    }
  }

  // Also clean up kubectl-history which was a major source of quota issues
  localStorage.removeItem('kubectl-history')

  if (keysToMigrate.length > 0) {
    console.log(`[Cache] Migrated ${keysToMigrate.length} entries from localStorage to IndexedDB`)
  }
}

// Re-export storage hooks for easy importing
export {
  useLocalPreference,
  useClusterFilterPreference,
  useSortPreference,
  useCollapsedPreference,
  useIndexedData,
  getStorageStats,
  clearAllStorage,
} from './hooks'
