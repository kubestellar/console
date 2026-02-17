/**
 * Unified Caching Layer for Dashboard Cards
 *
 * This module provides a single, consistent caching pattern that all cards should use.
 * Uses a SQLite database in a Web Worker for persistent storage, with IndexedDB fallback.
 *
 * Features:
 * - SQLite WASM persistence via Web Worker (all I/O off main thread)
 * - Preloaded in-memory metadata (zero-cost Map.get() instead of sync localStorage)
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
import { isDemoMode, subscribeDemoMode } from '../demoMode'
import { registerCacheReset, registerRefetch } from '../modeTransition'
import { STORAGE_KEY_KUBECTL_HISTORY } from '../constants'
import { CacheWorkerRpc } from './workerRpc'
import type { CacheEntry as WorkerCacheEntry, CacheMeta as WorkerCacheMeta } from './workerMessages'

// ============================================================================
// Configuration
// ============================================================================

/** Cache version - increment when cache structure changes to invalidate old caches */
const CACHE_VERSION = 4

/** Storage key prefixes (for localStorage metadata — legacy, kept for migration) */
const META_PREFIX = 'kc_meta:'

/** IndexedDB configuration (legacy — kept for migration and fallback) */
const DB_NAME = 'kc_cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'

/** Maximum consecutive failures before marking as failed */
const MAX_FAILURES = 3

/** Base backoff multiplier for consecutive failures */
const FAILURE_BACKOFF_MULTIPLIER = 2

/** Maximum backoff interval (10 minutes) */
const MAX_BACKOFF_INTERVAL = 600_000

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

/**
 * Calculate effective refresh interval with failure backoff.
 */
function getEffectiveInterval(
  baseInterval: number,
  consecutiveFailures: number
): number {
  let interval = baseInterval

  // Apply exponential backoff for failures (2^failures, capped at MAX_BACKOFF)
  if (consecutiveFailures > 0) {
    const backoffMultiplier = Math.pow(FAILURE_BACKOFF_MULTIPLIER, Math.min(consecutiveFailures, 5))
    interval = Math.min(interval * backoffMultiplier, MAX_BACKOFF_INTERVAL)
  }

  return interval
}

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
// Storage Abstraction Layer
// ============================================================================

/**
 * Common interface for cache storage backends (Worker-based or IndexedDB fallback).
 */
interface CacheStorage {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, data: T): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<{ keys: string[]; count: number }>
}

// ============================================================================
// SQLite Worker Storage (Primary)
// ============================================================================

/**
 * Cache storage backed by SQLite WASM in a Web Worker.
 * All I/O happens off the main thread via postMessage RPC.
 */
class WorkerStorage implements CacheStorage {
  constructor(private rpc: CacheWorkerRpc) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const result = await this.rpc.get<T>(key)
    if (result && result.version === CACHE_VERSION) {
      return { key, data: result.data, timestamp: result.timestamp, version: result.version }
    }
    return null
  }

  async set<T>(key: string, data: T): Promise<void> {
    // Fire-and-forget: don't block the fetch cycle on storage I/O
    this.rpc.set(key, { data, timestamp: Date.now(), version: CACHE_VERSION })
  }

  async delete(key: string): Promise<void> {
    this.rpc.deleteKey(key)
  }

  async clear(): Promise<void> {
    return this.rpc.clear()
  }

  async getStats(): Promise<{ keys: string[]; count: number }> {
    return this.rpc.getStats()
  }
}

// ============================================================================
// IndexedDB Storage (Fallback)
// ============================================================================

class IndexedDBStorage implements CacheStorage {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase> | null = null
  private isSupported: boolean = true

  constructor() {
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
        request.onerror = () => { this.isSupported = false; reject(request.error) }
        request.onsuccess = () => { this.db = request.result; resolve(this.db) }
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
            store.createIndex('timestamp', 'timestamp', { unique: false })
          }
        }
      } catch (e) { this.isSupported = false; reject(e) }
    })
    return this.dbPromise
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.isSupported) return null
    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => {
          const entry = req.result as CacheEntry<T> | undefined
          resolve(entry && entry.version === CACHE_VERSION ? entry : null)
        }
        req.onerror = () => resolve(null)
      })
    } catch { return null }
  }

  async set<T>(key: string, data: T): Promise<void> {
    if (!this.isSupported) return
    try {
      const db = await this.initDB()
      const entry: CacheEntry<T> = { key, data, timestamp: Date.now(), version: CACHE_VERSION }
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch { /* ignore */ }
  }

  async delete(key: string): Promise<void> {
    if (!this.isSupported) return
    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      })
    } catch { /* ignore */ }
  }

  async clear(): Promise<void> {
    if (!this.isSupported) return
    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear()
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      })
    } catch { /* ignore */ }
  }

  async getStats(): Promise<{ keys: string[]; count: number }> {
    if (!this.isSupported) return { keys: [], count: 0 }
    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const keys: string[] = []
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor()
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) { keys.push(cursor.key as string); cursor.continue() }
          else resolve({ keys, count: keys.length })
        }
        req.onerror = () => resolve({ keys: [], count: 0 })
      })
    } catch { return { keys: [], count: 0 } }
  }
}

// ============================================================================
// Preloaded Metadata Map (replaces synchronous localStorage reads)
// ============================================================================

/**
 * In-memory map of cache metadata, populated at startup from the SQLite worker.
 * Replaces synchronous localStorage.getItem(META_PREFIX + key) calls.
 * All reads are zero-cost Map.get(); writes are fire-and-forget to the worker.
 */
const preloadedMetaMap = new Map<string, CacheMeta>()

/** The active worker RPC instance (null if using IndexedDB fallback). */
let workerRpc: CacheWorkerRpc | null = null

// ============================================================================
// Storage Singleton
// ============================================================================

/** The active storage backend — WorkerStorage or IndexedDB fallback. */
let cacheStorage: CacheStorage = new IndexedDBStorage()

/**
 * Initialize the SQLite Web Worker cache backend.
 * Call this early in app startup (main.tsx), before rendering.
 * Returns the worker RPC instance for migration use.
 */
export async function initCacheWorker(): Promise<CacheWorkerRpc> {
  try {
    const worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    )
    const rpc = new CacheWorkerRpc(worker)
    await rpc.waitForReady()

    workerRpc = rpc
    cacheStorage = new WorkerStorage(rpc)
    return rpc
  } catch (e) {
    console.warn('[Cache] SQLite Worker failed, using IndexedDB fallback:', e)
    cacheStorage = new IndexedDBStorage()
    throw e
  }
}

/**
 * Populate the preloaded metadata map from the SQLite worker.
 * Call after initCacheWorker() succeeds.
 */
export function initPreloadedMeta(meta: Record<string, WorkerCacheMeta>): void {
  preloadedMetaMap.clear()
  for (const [key, value] of Object.entries(meta)) {
    preloadedMetaMap.set(key, {
      consecutiveFailures: value.consecutiveFailures,
      lastError: value.lastError,
      lastSuccessfulRefresh: value.lastSuccessfulRefresh,
    })
  }
}

/** Check whether the SQLite worker is active (vs IndexedDB fallback). */
export function isSQLiteWorkerActive(): boolean {
  return workerRpc !== null
}

// ============================================================================
// Demo Mode Integration - Clear caches on mode toggle
// ============================================================================

/**
 * Clear all in-memory cache stores. Called by mode transition coordinator
 * when demo mode is toggled (in either direction).
 * This ensures cards get fresh data for the new mode.
 */
function clearAllInMemoryCaches(): void {
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).resetToInitialData()
  }
}

// Register with mode transition coordinator (called by toggleDemoMode)
if (typeof window !== 'undefined') {
  registerCacheReset('unified-cache', clearAllInMemoryCaches)
}

// ============================================================================
// Cache Store (Module-level singleton)
// ============================================================================

class CacheStore<T> {
  private state: CacheState<T>
  private subscribers = new Set<Subscriber>()
  private fetchingRef = false
  private refreshTimeoutRef: ReturnType<typeof setTimeout> | null = null
  private initialDataLoaded = false
  private storageLoadPromise: Promise<void> | null = null
  private resetVersion = 0

  constructor(
    private key: string,
    private initialData: T,
    private persist: boolean = true
  ) {
    // Initialize with initial data, then async load from storage
    const meta = this.loadMeta()

    // Always start with isLoading=true until we confirm cached data exists.
    // This prevents the "blank card" state where isLoading=false but data hasn't arrived.
    // The loadFromStorage() method will set isLoading=false, isRefreshing=true when cache is found.
    this.state = {
      data: initialData,
      isLoading: true, // Always start loading - will be set false when cache found or fetch completes
      isRefreshing: false,
      error: null, // Don't surface errors at dashboard level
      isFailed: meta.consecutiveFailures >= MAX_FAILURES,
      consecutiveFailures: meta.consecutiveFailures,
      lastRefresh: meta.lastSuccessfulRefresh ?? null,
    }

    // Async load from storage - store the promise so we can await it before fetching
    if (this.persist) {
      this.storageLoadPromise = this.loadFromStorage()
    }
  }

  // Storage operations (async via SQLite worker or IndexedDB fallback)
  private async loadFromStorage(): Promise<void> {
    if (!this.persist || this.initialDataLoaded) return

    try {
      const entry = await cacheStorage.get<T>(this.key)
      if (entry) {
        // Cache found - show cached data immediately, start background refresh
        this.initialDataLoaded = true
        this.setState({
          data: entry.data,
          isLoading: false,
          isRefreshing: true, // Will fetch latest in background
          lastRefresh: entry.timestamp,
        })
      }
    } catch {
      // Ignore errors, will use initial data with isLoading=true
    }
  }

  private async saveToStorage(data: T): Promise<void> {
    if (!this.persist) return
    try {
      await cacheStorage.set(this.key, data)
    } catch (e) {
      console.error(`[Cache] Failed to save ${this.key}:`, e)
    }
  }

  // Metadata: read from preloaded in-memory Map (zero-cost), persist via worker
  private loadMeta(): CacheMeta {
    return preloadedMetaMap.get(this.key) ?? { consecutiveFailures: 0 }
  }

  private saveMeta(meta: CacheMeta): void {
    // Update in-memory map immediately (synchronous)
    preloadedMetaMap.set(this.key, meta)
    // Fire-and-forget persistence to the SQLite worker
    if (workerRpc) {
      workerRpc.setMeta(this.key, meta)
    } else {
      // Fallback: write to localStorage if no worker
      try {
        localStorage.setItem(META_PREFIX + this.key, JSON.stringify(meta))
      } catch { /* ignore */ }
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

  // Mark store as ready (not loading) — used when fetching is disabled (demo mode)
  markReady(): void {
    if (this.state.isLoading) {
      this.setState({ isLoading: false, lastRefresh: Date.now() })
    }
  }

  /**
   * Reset store for mode transition. Sets loading state and reloads any
   * cached data from storage (stale-while-revalidate on mode switch).
   * In demo mode, useCache returns demoData regardless of state.data,
   * so the storage reload only matters for live mode transitions.
   */
  resetToInitialData(): void {
    this.resetVersion++
    this.fetchingRef = false
    this.initialDataLoaded = false
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
    })
    // Re-trigger storage load to recover cached live data
    if (this.persist) {
      this.storageLoadPromise = this.loadFromStorage()
    }
  }

  // Fetching
  async fetch(fetcher: () => Promise<T>, merge?: (old: T, new_: T) => T, progressiveFetcher?: (onProgress: (partialData: T) => void) => Promise<T>): Promise<void> {
    if (this.fetchingRef) return
    this.fetchingRef = true

    // Capture version to detect concurrent resets (mode transitions)
    const fetchVersion = this.resetVersion

    // Wait for storage to load before determining if we have cached data
    // This ensures we don't show skeleton when cached data is available
    if (this.storageLoadPromise) {
      const currentPromise = this.storageLoadPromise
      await currentPromise
      // Only clear if it hasn't been replaced by a concurrent resetToInitialData()
      if (this.storageLoadPromise === currentPromise) {
        this.storageLoadPromise = null
      }
    }

    // If a reset happened during IDB load, discard this stale fetch
    if (this.resetVersion !== fetchVersion) {
      this.fetchingRef = false
      return
    }

    const hasCachedData = this.state.data !== this.initialData || this.initialDataLoaded

    this.setState({
      isLoading: !hasCachedData,
      isRefreshing: hasCachedData,
    })

    try {
      // Progressive fetcher: push partial updates to UI as each chunk arrives
      const onProgress = progressiveFetcher ? (partialData: T) => {
        if (this.resetVersion !== fetchVersion) return  // stale — ignore
        this.setState({
          data: partialData,
          isLoading: false,
          isRefreshing: true,
        })
      } : undefined

      const newData = progressiveFetcher && onProgress
        ? await progressiveFetcher(onProgress)
        : await fetcher()

      // If a reset happened during fetch, discard stale results
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      const finalData = merge && hasCachedData ? merge(this.state.data, newData) : newData

      await this.saveToStorage(finalData)
      this.saveMeta({ consecutiveFailures: 0, lastSuccessfulRefresh: Date.now() })

      // Final check after storage save
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

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
      // If a reset happened during fetch, discard stale error
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch data'
      const newFailures = this.state.consecutiveFailures + 1
      const hasData = this.state.data !== this.initialData || this.initialDataLoaded
      const reachedMaxFailures = newFailures >= MAX_FAILURES

      this.saveMeta({
        consecutiveFailures: newFailures,
        lastError: errorMessage,
        lastSuccessfulRefresh: this.state.lastRefresh ?? undefined,
      })

      this.setState({
        // Keep isLoading: true when we have no cached data and haven't
        // exhausted retries — skeleton stays visible while auto-refresh retries.
        // After MAX_FAILURES, isFailed triggers failure state instead of skeleton.
        isLoading: !hasData && !reachedMaxFailures,
        isRefreshing: false,
        error: null,
        isFailed: reachedMaxFailures,
        consecutiveFailures: newFailures,
      })
    } finally {
      this.fetchingRef = false
    }
  }

  // Clear cache
  async clear(): Promise<void> {
    await cacheStorage.delete(this.key)
    preloadedMetaMap.delete(this.key)
    if (workerRpc) {
      workerRpc.setMeta(this.key, { consecutiveFailures: 0 })
    } else {
      localStorage.removeItem(META_PREFIX + this.key)
    }
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

  // Reset failure counters (used when manually refreshing a cluster)
  resetFailures(): void {
    if (this.state.consecutiveFailures === 0) return

    this.saveMeta({
      consecutiveFailures: 0,
      lastSuccessfulRefresh: this.state.lastRefresh ?? undefined,
    })

    this.setState({
      consecutiveFailures: 0,
      isFailed: false,
    })
  }
}

// ============================================================================
// Cache Registry (for shared caches)
// ============================================================================

const cacheRegistry = new Map<string, CacheStore<unknown>>()

function getOrCreateCache<T>(key: string, initialData: T, persist: boolean): CacheStore<T> {
  if (!cacheRegistry.has(key)) {
    cacheRegistry.set(key, new CacheStore(key, initialData, persist) as CacheStore<unknown>)
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
  /** Initial data when cache is empty (used as loading state in live mode) */
  initialData: T
  /** Data to display in demo mode (defaults to initialData if not provided) */
  demoData?: T
  /** Whether to persist to IndexedDB (default: true) */
  persist?: boolean
  /** Whether to auto-refresh at interval (default: true) */
  autoRefresh?: boolean
  /** Whether fetching is enabled (default: true) */
  enabled?: boolean
  /** When true and demoData is provided, fall back to demoData if live fetch returns empty data.
   *  Use this for "demo until X is installed" cards that are in DEMO_DATA_CARDS. (default: false) */
  demoWhenEmpty?: boolean
  /** Merge function for combining old and new data */
  merge?: (oldData: T, newData: T) => T
  /** Share cache across components with same key (default: true) */
  shared?: boolean
  /** Alternative fetcher that receives an onProgress callback for progressive/partial updates.
   *  If provided, used instead of `fetcher`. Each onProgress call updates the UI immediately. */
  progressiveFetcher?: (onProgress: (partialData: T) => void) => Promise<T>
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
  /** Whether demoWhenEmpty fallback is active (live data returned empty, showing demo data) */
  isDemoFallback: boolean
}

export function useCache<T>({
  key,
  fetcher,
  category = 'default',
  refreshInterval,
  initialData,
  demoData,
  persist = true,
  autoRefresh = true,
  enabled = true,
  demoWhenEmpty = false,
  merge,
  shared = true,
  progressiveFetcher,
}: UseCacheOptions<T>): UseCacheResult<T> {
  // Subscribe to demo mode - this ensures we re-render when demo mode changes
  const demoMode = useSyncExternalStore(subscribeDemoMode, isDemoMode, isDemoMode)

  // Effective enabled: both the passed prop AND not in demo mode
  // This handles cases where enabled: !isDemoMode() was passed but component didn't re-render
  const effectiveEnabled = enabled && !demoMode

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

  const progressiveFetcherRef = useRef(progressiveFetcher)
  progressiveFetcherRef.current = progressiveFetcher

  const refetch = useCallback(async () => {
    if (!effectiveEnabled) return
    await store.fetch(() => fetcherRef.current(), mergeRef.current, progressiveFetcherRef.current)
  }, [effectiveEnabled, store])

  const clearAndRefetch = useCallback(async () => {
    await store.clear()
    await refetch()
  }, [store, refetch])

  // Initial fetch and auto-refresh
  // Calculate effective interval with failure backoff
  const baseInterval = refreshInterval ?? REFRESH_RATES[category]
  const effectiveInterval = getEffectiveInterval(baseInterval, state.consecutiveFailures)

  // Track mount state to distinguish initial mount from mode-switch re-fires.
  // On initial mount / page navigation: fetch immediately (needed for data).
  // On mode transition (enabled false→true after mount): skip immediate refetch,
  // let triggerAllRefetches() handle it after the 500ms skeleton timer.
  const hasMountedRef = useRef(false)
  const prevEnabledRef = useRef(effectiveEnabled)
  const initialFetchDoneRef = useRef(false)

  useEffect(() => {
    if (!effectiveEnabled) {
      // In demo/disabled mode, no fetch will run — mark loading as done
      store.markReady()
      hasMountedRef.current = true
      prevEnabledRef.current = effectiveEnabled
      initialFetchDoneRef.current = false
      return
    }

    // Detect mode transition: enabled changed false→true after initial mount
    const isModeTransition = hasMountedRef.current && !prevEnabledRef.current && effectiveEnabled
    hasMountedRef.current = true
    prevEnabledRef.current = effectiveEnabled

    // Only fetch immediately on initial mount or page navigation, NOT when
    // the effect re-fires due to consecutiveFailures/backoff interval changes.
    if (!isModeTransition && !initialFetchDoneRef.current) {
      // Initial mount or page navigation remount — fetch immediately
      initialFetchDoneRef.current = true
      refetch()
    }
    // else: mode transition — triggerAllRefetches() will call refetch after skeleton timer
    // else: backoff re-fire — let the interval handle the next retry

    // Register for mode-transition refetches so triggerAllRefetches() reaches us
    const unregisterRefetch = registerRefetch(`cache:${key}`, refetch)

    // Auto-refresh interval
    // The interval restarts when consecutiveFailures changes (backoff kicks in)
    if (autoRefresh) {
      const intervalId = setInterval(refetch, effectiveInterval)
      return () => { clearInterval(intervalId); unregisterRefetch() }
    }
    return () => unregisterRefetch()
  }, [effectiveEnabled, autoRefresh, effectiveInterval, refetch, store, key, state.consecutiveFailures])

  // Cleanup non-shared stores on unmount
  useEffect(() => {
    return () => {
      if (!shared && storeRef.current) {
        storeRef.current.destroy()
      }
    }
  }, [shared])

  // When disabled (demo mode), return demoData (or initialData) instead of cached live data
  // This ensures demo mode shows demo content while preserving cache for live mode
  const demoDisplayData = demoData !== undefined ? demoData : initialData

  // demoWhenEmpty: fall back to demoData when live fetch returned empty results.
  // This handles "demo until X is installed" cards (e.g., Kagenti) that are in DEMO_DATA_CARDS
  // but fetch live data that returns empty when the feature isn't installed.
  const shouldFallbackToDemo = effectiveEnabled && demoWhenEmpty && demoData !== undefined
    && !state.isLoading && Array.isArray(state.data) && (state.data as unknown[]).length === 0

  // Optimistic demo: for demoWhenEmpty hooks, show demoData immediately while
  // the live fetch runs in the background.  This avoids skeleton flicker for
  // "demo until X is installed" cards — they render demo content instantly and
  // swap to real data only if the fetch returns non-empty results.
  const showOptimisticDemo = effectiveEnabled && demoWhenEmpty && demoData !== undefined
    && state.isLoading

  return {
    data: !effectiveEnabled ? demoDisplayData
      : shouldFallbackToDemo ? demoData
      : showOptimisticDemo ? demoData
      : state.data,
    isLoading: effectiveEnabled ? (state.isLoading && !shouldFallbackToDemo && !showOptimisticDemo) : false,
    isRefreshing: state.isRefreshing || showOptimisticDemo,
    error: state.error,
    isFailed: state.isFailed,
    consecutiveFailures: state.consecutiveFailures,
    lastRefresh: state.lastRefresh,
    isDemoFallback: shouldFallbackToDemo || !effectiveEnabled || showOptimisticDemo,
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

/** Clear all caches (both storage and metadata) */
export async function clearAllCaches(): Promise<void> {
  // Clear storage backend
  await cacheStorage.clear()

  // Clear preloaded metadata
  preloadedMetaMap.clear()

  // Clear any remaining localStorage metadata (fallback/legacy)
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
  const stats = await cacheStorage.getStats()
  return { ...stats, entries: cacheRegistry.size }
}

/** Invalidate a specific cache (force refetch on next use) */
export async function invalidateCache(key: string): Promise<void> {
  const store = cacheRegistry.get(key)
  if (store) {
    await (store as CacheStore<unknown>).clear()
  }
  await cacheStorage.delete(key)
  preloadedMetaMap.delete(key)
}

/**
 * Reset failure counters for all caches related to a specific cluster.
 * This removes the exponential backoff so the next refresh happens at normal interval.
 * Call this when manually refreshing a cluster (user clicked refresh button).
 *
 * @param clusterName - The cluster name to match in cache keys
 * @returns Number of caches that had their failures reset
 */
export function resetFailuresForCluster(clusterName: string): number {
  let resetCount = 0

  for (const [key, store] of cacheRegistry.entries()) {
    // Cache keys typically include cluster name, e.g., "pods:cluster-name:namespace:limit"
    if (key.includes(clusterName) || key.includes(':all:')) {
      const typedStore = store as CacheStore<unknown>
      typedStore.resetFailures()
      resetCount++
    }
  }

  return resetCount
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

/**
 * Preload ALL cache keys from storage at app startup.
 * This ensures cached data is available immediately when components mount,
 * eliminating skeleton flashes on page navigation.
 * Call this early in app initialization, before rendering routes.
 */
export async function preloadCacheFromStorage(): Promise<void> {
  const stats = await cacheStorage.getStats()
  if (stats.count === 0) return

  const loadPromises = stats.keys.map(async (key) => {
    try {
      const entry = await cacheStorage.get<unknown>(key)
      if (entry) {
        const store = getOrCreateCache(key, entry.data, true)
        const storeWithState = store as unknown as {
          initialDataLoaded: boolean
          state: CacheState<unknown>
        }
        storeWithState.initialDataLoaded = true
        storeWithState.state = {
          ...storeWithState.state,
          data: entry.data,
          isLoading: false,
          isRefreshing: true, // Will fetch fresh data in background
          lastRefresh: entry.timestamp,
        }
      }
    } catch {
      // Ignore individual load failures
    }
  })

  await Promise.all(loadPromises)
}

/** Migrate old localStorage cache entries (run once on app startup) */
export async function migrateFromLocalStorage(): Promise<void> {
  // Migrate old ksc_ prefixed keys to kc_ prefix
  const kscKeys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('ksc_') || key?.startsWith('ksc-')) {
      kscKeys.push(key)
    }
  }
  for (const oldKey of kscKeys) {
    try {
      const value = localStorage.getItem(oldKey)
      const newKey = oldKey.replace(/^ksc[_-]/, (m) => m === 'ksc_' ? 'kc_' : 'kc-')
      if (value !== null && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, value)
      }
      localStorage.removeItem(oldKey)
    } catch { /* ignore */ }
  }

  const OLD_PREFIX = 'kc_cache:'
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
        if (entry.data !== undefined) {
          await cacheStorage.set(key, entry.data)
        }
      }
      localStorage.removeItem(fullKey)
    } catch {
      localStorage.removeItem(fullKey)
    }
  }

  // Clean up kubectl-history which was a major source of quota issues
  localStorage.removeItem(STORAGE_KEY_KUBECTL_HISTORY)
}

/**
 * Migrate data from IndexedDB to SQLite worker (one-time migration).
 * Call this after initCacheWorker() succeeds and before preloadCacheFromStorage().
 */
export async function migrateIDBToSQLite(): Promise<void> {
  if (!workerRpc) return

  // Read all entries from the old IndexedDB
  const idb = new IndexedDBStorage()

  try {
    const stats = await idb.getStats()
    if (stats.count === 0) {
      // Also migrate localStorage metadata
      await migrateLocalStorageMetaToSQLite()
      return
    }

    const cacheEntries: Array<{ key: string; entry: WorkerCacheEntry }> = []
    for (const key of stats.keys) {
      const entry = await idb.get<unknown>(key)
      if (entry) {
        cacheEntries.push({
          key,
          entry: { data: entry.data, timestamp: entry.timestamp, version: entry.version },
        })
      }
    }

    // Collect localStorage metadata
    const metaEntries: Array<{ key: string; meta: WorkerCacheMeta }> = []
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (lsKey?.startsWith(META_PREFIX)) {
        try {
          const meta = JSON.parse(localStorage.getItem(lsKey)!) as CacheMeta
          const cacheKey = lsKey.replace(META_PREFIX, '')
          metaEntries.push({ key: cacheKey, meta })
        } catch { /* ignore corrupted entries */ }
      }
    }

    // Bulk-insert into SQLite via worker
    await workerRpc.migrate({ cacheEntries, metaEntries })

    // Clean up old storage
    await idb.clear()
    const metaKeysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(META_PREFIX)) {
        metaKeysToRemove.push(key)
      }
    }
    metaKeysToRemove.forEach(key => localStorage.removeItem(key))

    // Delete the IndexedDB database entirely
    try {
      indexedDB.deleteDatabase(DB_NAME)
    } catch { /* ignore */ }
  } catch (e) {
    console.error('[Cache] IDB→SQLite migration failed:', e)
  }
}

/** Migrate localStorage metadata to SQLite (when no IDB data exists). */
async function migrateLocalStorageMetaToSQLite(): Promise<void> {
  if (!workerRpc) return

  const metaEntries: Array<{ key: string; meta: WorkerCacheMeta }> = []
  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const lsKey = localStorage.key(i)
    if (lsKey?.startsWith(META_PREFIX)) {
      try {
        const meta = JSON.parse(localStorage.getItem(lsKey)!) as CacheMeta
        metaEntries.push({ key: lsKey.replace(META_PREFIX, ''), meta })
        keysToRemove.push(lsKey)
      } catch { /* ignore */ }
    }
  }

  if (metaEntries.length > 0) {
    await workerRpc.migrate({ cacheEntries: [], metaEntries })
    keysToRemove.forEach(key => localStorage.removeItem(key))
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
