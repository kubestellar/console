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

/**
 * sessionStorage prefix for sync cache snapshots.
 * sessionStorage is synchronous, survives page reload (same tab), and is
 * automatically cleared when the tab closes — no stale data accumulation.
 * Used to hydrate CacheStore constructors instantly, avoiding skeleton flash.
 */
const SS_PREFIX = 'kcc:'

/** Try to write a cache entry to sessionStorage (best-effort, quota-safe). */
function ssWrite(key: string, data: unknown, timestamp: number): void {
  try {
    // Store cache version alongside data to avoid hydrating incompatible shapes after deploys.
    sessionStorage.setItem(
      SS_PREFIX + key,
      JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
    )
  } catch {
    // QuotaExceededError — silently skip, IDB is the durable fallback
  }
}

/** Synchronous read from sessionStorage. Returns null on miss, version mismatch, or parse error. */
function ssRead<T>(key: string): { data: T; timestamp: number } | null {
  try {
    const storageKey = SS_PREFIX + key
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('d' in parsed) ||
      !('t' in parsed) ||
      !('v' in parsed) ||
      (parsed as { v: number }).v !== CACHE_VERSION
    ) {
      // Clear stale or incompatible snapshot so future reads don't keep failing.
      sessionStorage.removeItem(storageKey)
      return null
    }

    const { d, t } = parsed as { d: T; t: number }
    return { data: d, timestamp: t }
  } catch {
    return null
  }
}

/**
 * Remove ALL sessionStorage snapshots with the kcc: prefix.
 * Called during cache clearing to prevent stale data rehydration (#4967, #4970).
 */
function clearSessionSnapshots(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(SS_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

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
// Global Auto-Refresh Pause
// ============================================================================

/**
 * When true, all cache auto-refresh intervals are suppressed.
 * Controlled by the dashboard "Auto" checkbox. Manual refetch() calls
 * and initial data loads still work — only periodic background refreshes
 * are paused.
 */
let globalAutoRefreshPaused = false
const autoRefreshPauseListeners = new Set<(paused: boolean) => void>()

function notifyAutoRefreshPauseListeners() {
  autoRefreshPauseListeners.forEach(fn => fn(globalAutoRefreshPaused))
}

/** Check whether auto-refresh is globally paused. */
export function isAutoRefreshPaused(): boolean {
  return globalAutoRefreshPaused
}

/** Pause or resume all cache auto-refresh intervals. */
export function setAutoRefreshPaused(paused: boolean): void {
  if (globalAutoRefreshPaused === paused) return
  globalAutoRefreshPaused = paused
  notifyAutoRefreshPauseListeners()
}

/** Subscribe to auto-refresh pause state changes. Returns unsubscribe fn. */
export function subscribeAutoRefreshPaused(cb: (paused: boolean) => void): () => void {
  autoRefreshPauseListeners.add(cb)
  return () => autoRefreshPauseListeners.delete(cb)
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
  /** In-memory snapshot populated by preloadAll() — makes get() synchronous after startup */
  private snapshot = new Map<string, CacheEntry<unknown>>()
  private snapshotReady = false

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

  /**
   * Batch-read ALL entries from IndexedDB in a single transaction.
   * Called once at startup so subsequent get() calls are instant Map lookups.
   */
  async preloadAll(): Promise<Map<string, CacheEntry<unknown>>> {
    if (!this.isSupported) return this.snapshot
    try {
      const db = await this.initDB()
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).getAll()
        req.onsuccess = () => {
          const entries = req.result as CacheEntry<unknown>[]
          for (const entry of entries) {
            if (entry.version === CACHE_VERSION) {
              this.snapshot.set(entry.key, entry)
            }
          }
          this.snapshotReady = true
          resolve(this.snapshot)
        }
        req.onerror = () => { this.snapshotReady = true; resolve(this.snapshot) }
      })
    } catch {
      this.snapshotReady = true
      return this.snapshot
    }
  }

  /**
   * Synchronous read from the in-memory snapshot.
   * Returns null if snapshot isn't ready yet or key doesn't exist.
   * Used by CacheStore constructor for zero-delay cache hydration.
   */
  getFromSnapshot<T>(key: string): CacheEntry<T> | null {
    if (!this.snapshotReady) return null
    return (this.snapshot.get(key) as CacheEntry<T>) ?? null
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    // Fast path: return from in-memory snapshot (populated by preloadAll)
    if (this.snapshotReady) {
      const cached = this.snapshot.get(key) as CacheEntry<T> | undefined
      return cached ?? null
    }
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
      // Keep snapshot in sync so future get() calls return fresh data
      this.snapshot.set(key, entry as CacheEntry<unknown>)
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch { /* ignore */ }
  }

  async delete(key: string): Promise<void> {
    if (!this.isSupported) return
    this.snapshot.delete(key)
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
    this.snapshot.clear()
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
const _idbStorage = new IndexedDBStorage()
let cacheStorage: CacheStorage = _idbStorage

// Start batch-reading ALL IDB entries immediately at module load.
// By the time components mount and call loadFromStorage(), the snapshot
// is populated and get() returns synchronously from the Map.
const _idbPreloadPromise = _idbStorage.preloadAll()

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
    console.warn('[Cache] SQLite Worker unavailable, using IndexedDB fallback:', e)
    // Reuse the existing _idbStorage instance so that the snapshot hydrated by
    // preloadAll() remains consistent with the active storage backend.
    cacheStorage = _idbStorage
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
      lastSuccessfulRefresh: value.lastSuccessfulRefresh })
  }
  // Update any stores that were constructed before meta was available
  // (i.e. before the async worker init completed after first render).
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).applyPreloadedMeta()
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
 * Clear all in-memory AND persistent cache stores. Called by mode transition
 * coordinator when demo mode is toggled (in either direction).
 *
 * This ensures no stale real-cluster data leaks into demo mode (and vice versa).
 * Steps:
 * 1. Wipe the persistent backend (SQLite / IndexedDB) so no old entries
 *    can be reloaded on future page loads or storage-load cycles.
 * 2. Clear the preloaded metadata map (failure counters, etc.).
 * 3. Clear sessionStorage snapshots (kcc:*) so stale data cannot rehydrate.
 * 4. Reset every in-memory CacheStore to its initial (empty) state WITHOUT
 *    reloading from storage (the storage was just cleared).
 */
function clearAllInMemoryCaches(): void {
  // 1. Clear persistent storage (fire-and-forget)
  cacheStorage.clear().catch((e) => {
    console.error('[Cache] Failed to clear persistent storage during mode transition:', e)
  })

  // 2. Clear metadata
  preloadedMetaMap.clear()

  // 3. Clear sessionStorage snapshots so next mount cannot rehydrate stale data (#4967)
  clearSessionSnapshots()

  // 4. Reset every in-memory store WITHOUT reloading from (now-empty) storage
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).resetForModeTransition()
  }
}

// Register with mode transition coordinator (called by toggleDemoMode)
if (typeof window !== 'undefined') {
  registerCacheReset('unified-cache', clearAllInMemoryCaches)
}

/**
 * Check if fetcher output is equivalent to the initial (empty) data.
 * Used to detect "no data available" responses that shouldn't overwrite cache.
 * Handles: empty arrays, objects with all-empty/zero fields, null.
 */
function isEquivalentToInitial<T>(newData: T, initialData: T): boolean {
  // Null/undefined
  if (newData == null && initialData == null) return true

  // Arrays: both empty
  if (Array.isArray(newData) && Array.isArray(initialData)) {
    return (newData as unknown[]).length === 0 && (initialData as unknown[]).length === 0
  }

  // Objects: compare via JSON (catches {alerts:[], inventory:[], nodeCount:0} etc.)
  if (typeof newData === 'object' && typeof initialData === 'object') {
    try {
      return JSON.stringify(newData) === JSON.stringify(initialData)
    } catch {
      return false
    }
  }

  return false
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

    // Try to hydrate from sessionStorage (synchronous — survives page reload).
    // Falls back to IDB snapshot if available, then async IDB read.
    const ssEntry = this.persist ? ssRead<T>(key) : null
    const snapshot = ssEntry
      ?? (this.persist ? _idbStorage.getFromSnapshot<T>(key) : null)
    // Accept the snapshot if it contains non-initial data OR has a valid timestamp
    // (a valid timestamp means it was a real fetch result, even if the data is empty).
    if (snapshot && (!isEquivalentToInitial(snapshot.data, initialData) || snapshot.timestamp > 0)) {
      this.initialDataLoaded = true
      this.state = {
        data: snapshot.data,
        isLoading: false,
        isRefreshing: true,
        error: null,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: snapshot.timestamp }
      this.storageLoadPromise = Promise.resolve()
    } else {
      this.state = {
        data: initialData,
        isLoading: true,
        isRefreshing: false,
        error: null,
        isFailed: meta.consecutiveFailures >= MAX_FAILURES,
        consecutiveFailures: meta.consecutiveFailures,
        lastRefresh: meta.lastSuccessfulRefresh ?? null }
      // Async fallback — load from storage if snapshot wasn't ready
      if (this.persist) {
        this.storageLoadPromise = this.loadFromStorage()
      }
    }
  }

  // Storage operations (async via SQLite worker or IndexedDB fallback)
  private async loadFromStorage(): Promise<void> {
    if (!this.persist || this.initialDataLoaded) return

    // Wait for the IDB batch preload to finish so get() hits the in-memory Map
    await _idbPreloadPromise

    try {
      const entry = await cacheStorage.get<T>(this.key)
      if (entry && (!isEquivalentToInitial(entry.data, this.initialData) || entry.timestamp > 0)) {
        // Cache found with real data (or valid empty result) - show immediately, start background refresh.
        this.initialDataLoaded = true
        // Mirror to sessionStorage so next reload hydrates synchronously
        ssWrite(this.key, entry.data, entry.timestamp)
        this.setState({
          data: entry.data,
          isLoading: false,
          isRefreshing: true,
          lastRefresh: entry.timestamp,
          isFailed: false,
          consecutiveFailures: 0 })
        this.saveMeta({ consecutiveFailures: 0, lastSuccessfulRefresh: entry.timestamp })
      }
    } catch {
      // Ignore errors, will use initial data with isLoading=true
    }
  }

  private async saveToStorage(data: T): Promise<void> {
    if (!this.persist) return
    // Write to sessionStorage first (sync, survives reload) so next page load
    // can hydrate the store instantly in the constructor.
    ssWrite(this.key, data, Date.now())
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
      consecutiveFailures: 0 })
    // Re-trigger storage load to recover cached live data
    if (this.persist) {
      this.storageLoadPromise = this.loadFromStorage()
    }
  }

  /**
   * Reset store for a demo/live mode transition WITHOUT reloading from
   * persistent storage.  Used when persistent storage has already been
   * cleared by the mode transition coordinator, so there is nothing
   * useful to reload.
   *
   * The next fetch cycle will populate the store with appropriate data
   * (demo data via useCache or live data from the backend).
   */
  resetForModeTransition(): void {
    this.resetVersion++
    this.fetchingRef = false
    this.initialDataLoaded = false
    this.storageLoadPromise = null
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0 })
  }

  /**
   * Apply persisted meta (consecutiveFailures, lastSuccessfulRefresh) to stores
   * that were constructed before initPreloadedMeta() completed.
   * Only updates stores still in the initial loading state with no snapshot data.
   */
  applyPreloadedMeta(): void {
    if (!this.initialDataLoaded && this.state.isLoading) {
      const meta = this.loadMeta()
      this.setState({
        isFailed: meta.consecutiveFailures >= MAX_FAILURES,
        consecutiveFailures: meta.consecutiveFailures,
        lastRefresh: meta.lastSuccessfulRefresh ?? null })
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
      try {
        await currentPromise
      } catch {
        // Storage load failed — proceed with current in-memory state
      }
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
      isRefreshing: hasCachedData })

    try {
      // Progressive fetcher: push partial updates to UI as each chunk arrives.
      // Only update `data` here — don't touch isLoading/isRefreshing.
      // The fetch() completion below sets isLoading: false.
      // This lets CardWrapper show partial data + refresh spinner while
      // more clusters are still streaming in via SSE.
      //
      // Throttle progress updates to avoid overwhelming React with rapid-fire
      // re-renders when multiple clusters respond within the same tick (#4935).
      // Each update creates a new state object reference so useSyncExternalStore
      // triggers a synchronous re-render.
      /** Minimum interval (ms) between progress-driven re-renders */
      const PROGRESS_THROTTLE_MS = 100
      let lastProgressTs = 0
      let pendingProgress: T | null = null
      let progressTimerId: ReturnType<typeof setTimeout> | null = null

      const flushProgress = () => {
        if (pendingProgress === null) return
        if (this.resetVersion !== fetchVersion) return
        this.setState({ data: pendingProgress })
        pendingProgress = null
        lastProgressTs = Date.now()
      }

      const onProgress = progressiveFetcher ? (partialData: T) => {
        if (this.resetVersion !== fetchVersion) return  // stale — ignore
        // Skip empty progress updates — don't wipe cached data with []
        if (isEquivalentToInitial(partialData, this.initialData)) return

        const now = Date.now()
        pendingProgress = partialData

        if (now - lastProgressTs >= PROGRESS_THROTTLE_MS) {
          // Enough time has passed — flush immediately
          if (progressTimerId) { clearTimeout(progressTimerId); progressTimerId = null }
          flushProgress()
        } else if (!progressTimerId) {
          // Schedule a flush at the end of the throttle window
          const remaining = PROGRESS_THROTTLE_MS - (now - lastProgressTs)
          progressTimerId = setTimeout(() => {
            progressTimerId = null
            flushProgress()
          }, remaining)
        }
      } : undefined

      const newData = progressiveFetcher && onProgress
        ? await progressiveFetcher(onProgress)
        : await fetcher()

      // Flush any pending throttled progress update before processing final data
      if (progressTimerId) { clearTimeout(progressTimerId); progressTimerId = null }

      // If a reset happened during fetch, discard stale results
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      // Guard: fetcher returned empty data (equivalent to initialData) AND we
      // already have cached data — keep the cache to avoid wiping good data
      // with an empty response (e.g. backend not yet connected).
      // On cold load (no cached data), fall through so the empty result is
      // accepted as a valid successful fetch; don't keep the skeleton forever.
      if (isEquivalentToInitial(newData, this.initialData) && hasCachedData) {
        // Have cache — keep it, just stop refreshing
        this.fetchingRef = false
        this.setState({ isLoading: false, isRefreshing: false })
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
        lastRefresh: Date.now() })
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

      // If a progressive fetcher pushed partial data via onProgress before
      // throwing, the state.data has been updated but never saved to storage.
      // Save it now so it survives page refresh.
      if (hasData && this.persist) {
        this.saveToStorage(this.state.data)
        this.initialDataLoaded = true
      }

      this.saveMeta({
        consecutiveFailures: newFailures,
        lastError: errorMessage,
        lastSuccessfulRefresh: hasData ? Date.now() : (this.state.lastRefresh ?? undefined) })

      this.setState({
        // Keep isLoading: true when we have no cached data and haven't
        // exhausted retries — skeleton stays visible while auto-refresh retries.
        // After MAX_FAILURES, isFailed triggers failure state instead of skeleton.
        isLoading: !hasData && !reachedMaxFailures,
        isRefreshing: false,
        error: errorMessage,
        isFailed: hasData ? false : reachedMaxFailures,
        consecutiveFailures: hasData ? 0 : newFailures })
    } finally {
      this.fetchingRef = false
    }
  }

  // Clear cache
  async clear(): Promise<void> {
    await cacheStorage.delete(this.key)
    // Remove sessionStorage snapshot so re-creating the store cannot rehydrate stale data (#4969)
    try { sessionStorage.removeItem(SS_PREFIX + this.key) } catch { /* ignore */ }
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
      lastRefresh: null })
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
      lastSuccessfulRefresh: this.state.lastRefresh ?? undefined })

    this.setState({
      consecutiveFailures: 0,
      isFailed: false })
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
  /** When true, the fetcher runs even in demo mode. Use for cards that serve live data
   *  on Netlify (e.g. nightly E2E status backed by a Netlify Function). (default: false) */
  liveInDemoMode?: boolean
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
  liveInDemoMode = false,
  merge,
  shared = true,
  progressiveFetcher }: UseCacheOptions<T>): UseCacheResult<T> {
  // Subscribe to demo mode - this ensures we re-render when demo mode changes
  const demoMode = useSyncExternalStore(subscribeDemoMode, isDemoMode, isDemoMode)

  // Subscribe to global auto-refresh pause (dashboard "Auto" checkbox)
  const autoRefreshGloballyPaused = useSyncExternalStore(
    subscribeAutoRefreshPaused, isAutoRefreshPaused, isAutoRefreshPaused
  )

  // Effective enabled: both the passed prop AND not in demo mode
  // liveInDemoMode bypasses the demo check for cards backed by serverless functions
  const effectiveEnabled = enabled && (!demoMode || liveInDemoMode)

  // Track mount state to distinguish initial mount from mode-switch re-fires.
  // On initial mount / page navigation: fetch immediately (needed for data).
  // On mode transition (enabled false→true after mount): skip immediate refetch,
  // let triggerAllRefetches() handle it after the 500ms skeleton timer.
  const hasMountedRef = useRef(false)
  const prevEnabledRef = useRef(effectiveEnabled)
  const initialFetchDoneRef = useRef(false)

  // Track the auto-refresh timer in a ref to avoid thrashing (#5252).
  // Without this, changing consecutiveFailures recreates the interval on every
  // render, defeating the exponential backoff.
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Get or create cache store.
  // Track the key so we can reset the ref when the cache key changes
  // (e.g., switching clusters). Without this, storeRef points to stale data (#5259).
  const storeRef = useRef<CacheStore<T> | null>(null)
  const storeKeyRef = useRef(key)

  if (!storeRef.current || storeKeyRef.current !== key) {
    // Key changed — clear the old auto-refresh timer so it doesn't keep
    // polling the previous key (#5399), and reset the initial-fetch guard
    // so the new key triggers an immediate fetch (#5400).
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = null
    }
    initialFetchDoneRef.current = false

    storeKeyRef.current = key
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

  const clearAndRefetch = async () => {
    await store.clear()
    await refetch()
  }

  // Initial fetch and auto-refresh
  // Calculate effective interval with failure backoff
  const baseInterval = refreshInterval ?? REFRESH_RATES[category]
  const effectiveInterval = getEffectiveInterval(baseInterval, state.consecutiveFailures)

  useEffect(() => {
    if (!effectiveEnabled) {
      // In demo/disabled mode, no fetch will run — mark loading as done
      store.markReady()
      hasMountedRef.current = true
      prevEnabledRef.current = effectiveEnabled
      initialFetchDoneRef.current = false
      // Clear any pending auto-refresh timer
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
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
      refetch().catch(() => { /* errors handled inside CacheStore.fetch */ })
    }
    // else: mode transition — triggerAllRefetches() will call refetch after skeleton timer
    // else: backoff re-fire — let the interval handle the next retry

    // Register for mode-transition refetches so triggerAllRefetches() reaches us
    const unregisterRefetch = registerRefetch(`cache:${key}`, refetch)

    // Auto-refresh interval — uses a ref-tracked timer to prevent thrashing.
    // Only create a new timer if none is already pending (#5252).
    if (autoRefresh && !autoRefreshGloballyPaused) {
      if (!autoRefreshTimerRef.current) {
        autoRefreshTimerRef.current = setInterval(() => {
          refetch().catch(() => { /* errors handled inside CacheStore.fetch */ })
        }, effectiveInterval)
      }
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = null
    }

    return () => {
      unregisterRefetch()
    }
  }, [effectiveEnabled, autoRefresh, autoRefreshGloballyPaused, refetch, store, key])

  // Restart the auto-refresh timer when the backoff interval changes.
  // Separated from the main effect to avoid re-running mount/mode-transition logic (#5252).
  useEffect(() => {
    if (!autoRefreshTimerRef.current || !autoRefresh || autoRefreshGloballyPaused) return
    // Clear old timer and create a new one with updated interval
    clearInterval(autoRefreshTimerRef.current)
    autoRefreshTimerRef.current = setInterval(() => {
      refetch().catch(() => { /* errors handled inside CacheStore.fetch */ })
    }, effectiveInterval)
  }, [effectiveInterval, autoRefresh, autoRefreshGloballyPaused, refetch])

  // Clean up auto-refresh timer on unmount
  useEffect(() => {
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [])

  // Cleanup non-shared stores on unmount
  useEffect(() => {
    return () => {
      if (!shared && storeRef.current) {
        storeRef.current.destroy()
      }
    }
  }, [shared])

  // Stabilize demoData and initialData references — callers typically pass
  // inline expressions (e.g. `demoData: getDemoX()`) which create new arrays
  // on every render.  In demo mode the return value used this new reference
  // directly, causing all downstream hooks to recalculate every render.
  // Combined with useLayoutEffect state reports this caused React error #185
  // (Maximum update depth exceeded).  Capturing via ref keeps the identity
  // stable across renders while still picking up the first provided value.
  //
  // Update the refs when the caller provides meaningfully different data (#5425).
  // JSON.stringify comparison is used to detect structural changes without
  // triggering on every render when the caller creates new-but-equal objects.
  const demoDataRef = useRef(demoData)
  const initialDataRef = useRef(initialData)

  const demoDataJSON = JSON.stringify(demoData)
  const initialDataJSON = JSON.stringify(initialData)
  const prevDemoJSON = useRef(demoDataJSON)
  const prevInitialJSON = useRef(initialDataJSON)

  if (demoDataJSON !== prevDemoJSON.current) {
    prevDemoJSON.current = demoDataJSON
    demoDataRef.current = demoData
  }
  if (initialDataJSON !== prevInitialJSON.current) {
    prevInitialJSON.current = initialDataJSON
    initialDataRef.current = initialData
  }

  const stableDemoData = demoDataRef.current
  const stableInitialData = initialDataRef.current

  // When disabled (demo mode), return demoData (or initialData) instead of cached live data
  // This ensures demo mode shows demo content while preserving cache for live mode
  const demoDisplayData = stableDemoData !== undefined ? stableDemoData : stableInitialData

  // demoWhenEmpty: fall back to demoData when live fetch returned empty results.
  // This handles "demo until X is installed" cards (e.g., Kagenti) that are in DEMO_DATA_CARDS
  // but fetch live data that returns empty when the feature isn't installed.
  const shouldFallbackToDemo = effectiveEnabled && demoWhenEmpty && stableDemoData !== undefined
    && !state.isLoading && Array.isArray(state.data) && (state.data as unknown[]).length === 0

  // Optimistic demo: for demoWhenEmpty hooks, show demoData immediately while
  // the live fetch runs in the background.  This avoids skeleton flicker for
  // "demo until X is installed" cards — they render demo content instantly and
  // swap to real data only if the fetch returns non-empty results.
  // IMPORTANT: Only apply when current data is empty — if the store already has
  // real cached data (e.g. from initialData populated via localStorage), showing
  // demo data would discard that warm cache (#3397).
  const hasNonEmptyData = Array.isArray(state.data) ? (state.data as unknown[]).length > 0 : !!state.data
  const showOptimisticDemo = effectiveEnabled && demoWhenEmpty && stableDemoData !== undefined
    && state.isLoading && !hasNonEmptyData

  return {
    data: !effectiveEnabled ? demoDisplayData
      : shouldFallbackToDemo ? stableDemoData
      : showOptimisticDemo ? stableDemoData
      : state.data,
    isLoading: effectiveEnabled ? (state.isLoading && !shouldFallbackToDemo && !showOptimisticDemo) : false,
    isRefreshing: state.isRefreshing || showOptimisticDemo,
    error: state.error,
    isFailed: state.isFailed,
    consecutiveFailures: state.consecutiveFailures,
    lastRefresh: state.lastRefresh,
    isDemoFallback: shouldFallbackToDemo || !effectiveEnabled || showOptimisticDemo,
    refetch,
    clearAndRefetch }
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
    initialData: options.initialData ?? [] })
}

/** Hook for object data with automatic empty object initial value */
export function useObjectCache<T extends Record<string, unknown>>(
  options: Omit<UseCacheOptions<T>, 'initialData'> & { initialData?: T }
): UseCacheResult<T> {
  return useCache({
    ...options,
    initialData: options.initialData ?? ({} as T) })
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

  // Clear sessionStorage snapshots so stale data cannot rehydrate (#4970)
  clearSessionSnapshots()

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

/**
 * Reset failure counters for ALL cache stores and trigger immediate refetch.
 * Called when clusters become available after initial page load — any hooks
 * that failed during the race window (clusters not loaded yet) get a fresh retry.
 */
export function resetAllCacheFailures(): void {
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).resetFailures()
  }
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
          lastRefresh: entry.timestamp }
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
          entry: { data: entry.data, timestamp: entry.timestamp, version: entry.version } })
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
  clearAllStorage } from './hooks'
