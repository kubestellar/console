import { STORAGE_KEY_KUBECTL_HISTORY } from '../constants'
import { CacheWorkerRpc, type WorkerCacheEntry, type WorkerCacheMeta } from './cacheWorkerRpc'
import { logOpfsFallback } from './opfsFallback'

/** Cache version - increment when cache structure changes to invalidate old caches */
export const CACHE_VERSION = 4

/** Storage key prefixes (for localStorage metadata — legacy, kept for migration) */
export const META_PREFIX = 'kc_meta:'

/** IndexedDB configuration (legacy — kept for migration and fallback) */
export const DB_NAME = 'kc_cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'

/** Maximum consecutive failures before marking as failed */
export const MAX_FAILURES = 3

/**
 * Debounce window for sessionStorage writes (ms).
 * Multiple cache saves within this window are batched into a single write per key.
 */
const SS_DEBOUNCE_MS = 500

/**
 * sessionStorage prefix for sync cache snapshots.
 * sessionStorage is synchronous, survives page reload (same tab), and is
 * automatically cleared when the tab closes — no stale data accumulation.
 * Used to hydrate CacheStore constructors instantly, avoiding skeleton flash.
 */
export const SS_PREFIX = 'kcc:'

/** Pending sessionStorage writes, keyed by cache key. */
const ssPending = new Map<string, { data: unknown; timestamp: number }>()
let ssFlushTimer: ReturnType<typeof setTimeout> | null = null

/** Flush all pending sessionStorage writes in one batch. */
export function ssFlush(): void {
  ssFlushTimer = null
  for (const [key, { data, timestamp }] of ssPending) {
    try {
      sessionStorage.setItem(
        SS_PREFIX + key,
        JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
      )
    } catch {
      // QuotaExceededError — silently skip, IDB is the durable fallback
    }
  }
  ssPending.clear()
}

/** Debounced write to sessionStorage. Batches writes within SS_DEBOUNCE_MS. */
export function ssWrite(key: string, data: unknown, timestamp: number): void {
  ssPending.set(key, { data, timestamp })
  if (!ssFlushTimer) {
    ssFlushTimer = setTimeout(ssFlush, SS_DEBOUNCE_MS)
  }
}

/** Synchronous read from sessionStorage. Returns null on miss, version mismatch, or parse error. */
export function ssRead<T>(key: string): { data: T; timestamp: number } | null {
  const pending = ssPending.get(key)
  if (pending) {
    return { data: pending.data as T, timestamp: pending.timestamp }
  }
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
      sessionStorage.removeItem(storageKey)
      return null
    }

    const { d, t } = parsed as { d: T; t: number }
    return { data: d, timestamp: t }
  } catch {
    return null
  }
}

/** Remove ALL sessionStorage snapshots with the kcc: prefix. */
export function clearSessionSnapshots(): void {
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
export const FAILURE_BACKOFF_MULTIPLIER = 2

/** Maximum backoff interval (10 minutes) */
export const MAX_BACKOFF_INTERVAL = 600_000

/** Refresh rates by data category (in milliseconds) */
export const REFRESH_RATES = {
  realtime: 15_000,
  pods: 30_000,
  clusters: 60_000,
  deployments: 60_000,
  services: 60_000,
  metrics: 45_000,
  gpu: 45_000,
  helm: 120_000,
  gitops: 120_000,
  namespaces: 180_000,
  rbac: 300_000,
  operators: 300_000,
  costs: 600_000,
  'ai-ml': 60_000,
  default: 120_000,
} as const

export type RefreshCategory = keyof typeof REFRESH_RATES

export interface CacheEntry<T> {
  key: string
  data: T
  timestamp: number
  version: number
}

export interface CacheMeta {
  consecutiveFailures: number
  lastError?: string
  lastSuccessfulRefresh?: number
}

export interface CacheState<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
}

export type Subscriber = () => void

export interface CacheStorage {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, data: T): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<{ keys: string[]; count: number }>
}

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

export class IndexedDBStorage implements CacheStorage {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase> | null = null
  private isSupported = true
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
      } catch (e: unknown) { this.isSupported = false; reject(e) }
    })
    return this.dbPromise
  }

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

  getFromSnapshot<T>(key: string): CacheEntry<T> | null {
    if (!this.snapshotReady) return null
    return (this.snapshot.get(key) as CacheEntry<T>) ?? null
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
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
    } catch {
      return null
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    if (!this.isSupported) return
    try {
      const db = await this.initDB()
      const entry: CacheEntry<T> = { key, data, timestamp: Date.now(), version: CACHE_VERSION }
      this.snapshot.set(key, entry as CacheEntry<unknown>)
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch (e: unknown) {
      console.error('[Cache] IndexedDB put failed:', e)
    }
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
    } catch (e: unknown) {
      console.error('[Cache] IndexedDB delete failed:', e)
    }
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
    } catch (e: unknown) {
      console.error('[Cache] IndexedDB clear failed:', e)
    }
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
    } catch {
      return { keys: [], count: 0 }
    }
  }
}

export const preloadedMetaMap = new Map<string, CacheMeta>()
export let workerRpc: CacheWorkerRpc | null = null
export const _idbStorage = new IndexedDBStorage()
export let cacheStorage: CacheStorage = _idbStorage
export const _idbPreloadPromise = _idbStorage.preloadAll()

let applyPreloadedMetaToStores: (() => void) | null = null

export function registerPreloadedMetaApplier(callback: () => void): void {
  applyPreloadedMetaToStores = callback
}

export async function initCacheWorker(): Promise<CacheWorkerRpc> {
  try {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    const rpc = new CacheWorkerRpc(worker)
    await rpc.waitForReady()

    workerRpc = rpc
    cacheStorage = new WorkerStorage(rpc)
    return rpc
  } catch (e: unknown) {
    logOpfsFallback('[Cache] SQLite Worker unavailable, using IndexedDB fallback:', e)
    cacheStorage = _idbStorage
    throw e
  }
}

export function initPreloadedMeta(meta: Record<string, WorkerCacheMeta>): void {
  preloadedMetaMap.clear()
  for (const [key, value] of Object.entries(meta)) {
    preloadedMetaMap.set(key, {
      consecutiveFailures: value.consecutiveFailures,
      lastError: value.lastError,
      lastSuccessfulRefresh: value.lastSuccessfulRefresh,
    })
  }
  applyPreloadedMetaToStores?.()
}

export function isSQLiteWorkerActive(): boolean {
  return workerRpc !== null
}

export async function migrateFromLocalStorage(): Promise<void> {
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
    } catch {
      // intentionally empty
    }
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

  localStorage.removeItem(STORAGE_KEY_KUBECTL_HISTORY)
}

export async function migrateIDBToSQLite(): Promise<void> {
  if (!workerRpc) return

  const idb = new IndexedDBStorage()

  try {
    const stats = await idb.getStats()
    if (stats.count === 0) {
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

    const metaEntries: Array<{ key: string; meta: WorkerCacheMeta }> = []
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (lsKey?.startsWith(META_PREFIX)) {
        try {
          const meta = JSON.parse(localStorage.getItem(lsKey)!) as CacheMeta
          metaEntries.push({ key: lsKey.replace(META_PREFIX, ''), meta })
        } catch {
          // intentionally empty
        }
      }
    }

    await workerRpc.migrate({ cacheEntries, metaEntries })

    await idb.clear()
    const metaKeysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(META_PREFIX)) {
        metaKeysToRemove.push(key)
      }
    }
    metaKeysToRemove.forEach(key => localStorage.removeItem(key))

    try {
      indexedDB.deleteDatabase(DB_NAME)
    } catch {
      // intentionally empty
    }
  } catch (e: unknown) {
    console.error('[Cache] IDB→SQLite migration failed:', e)
  }
}

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
      } catch {
        // intentionally empty
      }
    }
  }

  if (metaEntries.length > 0) {
    await workerRpc.migrate({ cacheEntries: [], metaEntries })
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}
