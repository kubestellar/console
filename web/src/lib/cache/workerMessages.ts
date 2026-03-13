/**
 * Shared message types for the SQLite cache Web Worker.
 *
 * The main thread communicates with the worker via typed postMessage calls.
 * Each request carries a unique `id` so the RPC layer can match responses.
 */

// ---------------------------------------------------------------------------
// Cache entry shape (same as the old IndexedDB CacheEntry)
// ---------------------------------------------------------------------------

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  version: number
}

export interface CacheMeta {
  consecutiveFailures: number
  lastError?: string
  lastSuccessfulRefresh?: number
}

// ---------------------------------------------------------------------------
// Request messages (main thread → worker)
// ---------------------------------------------------------------------------

export type WorkerRequest =
  | { id: number; type: 'get'; key: string }
  | { id: number; type: 'set'; key: string; entry: CacheEntry }
  | { id: number; type: 'delete'; key: string }
  | { id: number; type: 'clear' }
  | { id: number; type: 'getStats' }
  | { id: number; type: 'getMeta'; key: string }
  | { id: number; type: 'setMeta'; key: string; meta: CacheMeta }
  | { id: number; type: 'preloadAll' }
  | { id: number; type: 'migrate'; data: MigrationPayload }
  | { id: number; type: 'getPreference'; key: string }
  | { id: number; type: 'setPreference'; key: string; value: string }
  | { id: number; type: 'seedCache'; entries: Array<{ key: string; entry: CacheEntry }> }

// ---------------------------------------------------------------------------
// Response messages (worker → main thread)
// ---------------------------------------------------------------------------

export type WorkerResponse =
  | { id: number; type: 'result'; value: unknown }
  | { id: number; type: 'error'; message: string }
  | { id: -1; type: 'ready' }

// ---------------------------------------------------------------------------
// Preload result (returned by 'preloadAll')
// ---------------------------------------------------------------------------

export interface PreloadResult {
  meta: Record<string, CacheMeta>
  cacheKeys: string[]
}

// ---------------------------------------------------------------------------
// Migration payload
// ---------------------------------------------------------------------------

export interface MigrationPayload {
  cacheEntries: Array<{ key: string; entry: CacheEntry }>
  metaEntries: Array<{ key: string; meta: CacheMeta }>
}
