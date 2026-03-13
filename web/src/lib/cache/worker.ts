/**
 * SQLite Cache Web Worker
 *
 * Runs SQLite WASM in a dedicated worker thread. All cache I/O happens here,
 * keeping the main thread free from synchronous localStorage and IndexedDB calls.
 *
 * Storage: Uses OPFS (Origin Private File System) when available, falls back
 * to in-memory SQLite if OPFS is not supported.
 */

import type { WorkerRequest, WorkerResponse, CacheEntry, CacheMeta } from './workerMessages'
import { CREATE_TABLES_SQL } from './schema'

// We use a dynamic import for SQLite WASM to keep the worker bundle small
// and let Vite handle the WASM file resolution.
let db: DatabaseHandle | null = null

// Minimal interface for the Database object we use
interface DatabaseHandle {
  exec(sql: string | string[], opts?: { bind?: unknown[]; returnValue?: string; rowMode?: string; callback?: (row: Record<string, unknown>) => void }): unknown
  close(): void
}

/**
 * Initialize SQLite and open the database.
 */
async function initDatabase(): Promise<void> {
  try {
    // Dynamic import of the SQLite WASM module
    const sqlite3InitModule = (await import('@sqlite.org/sqlite-wasm')).default

    const sqlite3 = await sqlite3InitModule()

    // Try OPFS-backed database first (persistent, fast)
    // Fall back to in-memory if OPFS is not available
    // Note: OpfsSAHPoolDb may exist at runtime but isn't in the TS type defs
    const oo1 = sqlite3.oo1 as Record<string, unknown>
    try {
      if (oo1['OpfsSAHPoolDb']) {
        const Ctor = oo1['OpfsSAHPoolDb'] as new (name: string) => DatabaseHandle
        db = new Ctor('/kc-cache.sqlite3')
      } else if (oo1['OpfsDb']) {
        const Ctor = oo1['OpfsDb'] as new (name: string) => DatabaseHandle
        db = new Ctor('/kc-cache.sqlite3')
      } else {
        // No OPFS support — use in-memory database
        db = new sqlite3.oo1.DB(':memory:') as unknown as DatabaseHandle
      }
    } catch {
      // OPFS failed (e.g., not in secure context) — fall back to in-memory
      db = new sqlite3.oo1.DB(':memory:') as unknown as DatabaseHandle
    }

    // Create tables
    db.exec(CREATE_TABLES_SQL)

    // Enable WAL mode for better concurrent read performance
    try {
      db.exec('PRAGMA journal_mode=WAL')
    } catch {
      // WAL may not be supported on all VFS backends
    }
  } catch (e) {
    console.error('[CacheWorker] Failed to initialize SQLite:', e)
    throw e
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleGet(key: string): CacheEntry | null {
  if (!db) return null
  let result: CacheEntry | null = null
  db.exec('SELECT data, timestamp, version FROM cache_data WHERE key = ?', {
    bind: [key],
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      result = {
        data: JSON.parse(row['data'] as string),
        timestamp: row['timestamp'] as number,
        version: row['version'] as number,
      }
    },
  })
  return result
}

function handleSet(key: string, entry: CacheEntry): void {
  if (!db) return
  const dataStr = JSON.stringify(entry.data)
  db.exec(
    'INSERT OR REPLACE INTO cache_data (key, data, timestamp, version, size_bytes) VALUES (?, ?, ?, ?, ?)',
    { bind: [key, dataStr, entry.timestamp, entry.version, dataStr.length] }
  )
}

function handleDelete(key: string): void {
  if (!db) return
  db.exec('DELETE FROM cache_data WHERE key = ?', { bind: [key] })
}

function handleClear(): void {
  if (!db) return
  db.exec('DELETE FROM cache_data')
  db.exec('DELETE FROM cache_meta')
}

function handleGetStats(): { keys: string[]; count: number } {
  if (!db) return { keys: [], count: 0 }
  const keys: string[] = []
  db.exec('SELECT key FROM cache_data', {
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      keys.push(row['key'] as string)
    },
  })
  return { keys, count: keys.length }
}

function handleGetMeta(key: string): CacheMeta | null {
  if (!db) return null
  let result: CacheMeta | null = null
  db.exec(
    'SELECT consecutive_failures, last_error, last_successful_refresh FROM cache_meta WHERE key = ?',
    {
      bind: [key],
      rowMode: 'object',
      callback: (row: Record<string, unknown>) => {
        result = {
          consecutiveFailures: row['consecutive_failures'] as number,
          lastError: (row['last_error'] as string) || undefined,
          lastSuccessfulRefresh: (row['last_successful_refresh'] as number) || undefined,
        }
      },
    }
  )
  return result
}

function handleSetMeta(key: string, meta: CacheMeta): void {
  if (!db) return
  db.exec(
    'INSERT OR REPLACE INTO cache_meta (key, consecutive_failures, last_error, last_successful_refresh) VALUES (?, ?, ?, ?)',
    {
      bind: [
        key,
        meta.consecutiveFailures,
        meta.lastError ?? null,
        meta.lastSuccessfulRefresh ?? null,
      ],
    }
  )
}

function handlePreloadAll(): { meta: Record<string, CacheMeta>; cacheKeys: string[] } {
  const meta: Record<string, CacheMeta> = {}
  const cacheKeys: string[] = []

  if (!db) return { meta, cacheKeys }

  // Load all cache metadata
  db.exec('SELECT key, consecutive_failures, last_error, last_successful_refresh FROM cache_meta', {
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      meta[row['key'] as string] = {
        consecutiveFailures: row['consecutive_failures'] as number,
        lastError: (row['last_error'] as string) || undefined,
        lastSuccessfulRefresh: (row['last_successful_refresh'] as number) || undefined,
      }
    },
  })

  // Load cache key list (not the data — that's loaded on demand)
  db.exec('SELECT key FROM cache_data', {
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      cacheKeys.push(row['key'] as string)
    },
  })

  return { meta, cacheKeys }
}

function handleMigrate(data: {
  cacheEntries: Array<{ key: string; entry: CacheEntry }>
  metaEntries: Array<{ key: string; meta: CacheMeta }>
}): void {
  if (!db) return

  // Use a transaction for atomic bulk insert
  db.exec('BEGIN TRANSACTION')
  try {
    for (const { key, entry } of data.cacheEntries) {
      const dataStr = JSON.stringify(entry.data)
      db.exec(
        'INSERT OR REPLACE INTO cache_data (key, data, timestamp, version, size_bytes) VALUES (?, ?, ?, ?, ?)',
        { bind: [key, dataStr, entry.timestamp, entry.version, dataStr.length] }
      )
    }

    for (const { key, meta } of data.metaEntries) {
      db.exec(
        'INSERT OR REPLACE INTO cache_meta (key, consecutive_failures, last_error, last_successful_refresh) VALUES (?, ?, ?, ?)',
        {
          bind: [
            key,
            meta.consecutiveFailures,
            meta.lastError ?? null,
            meta.lastSuccessfulRefresh ?? null,
          ],
        }
      )
    }

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function handleSeedCache(entries: Array<{ key: string; entry: CacheEntry }>): void {
  if (!db) return

  db.exec('BEGIN TRANSACTION')
  try {
    for (const { key, entry } of entries) {
      const dataStr = JSON.stringify(entry.data)
      db.exec(
        'INSERT OR REPLACE INTO cache_data (key, data, timestamp, version, size_bytes) VALUES (?, ?, ?, ?, ?)',
        { bind: [key, dataStr, entry.timestamp, entry.version, dataStr.length] }
      )
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function handleGetPreference(key: string): string | null {
  if (!db) return null
  let result: string | null = null
  db.exec('SELECT value FROM preferences WHERE key = ?', {
    bind: [key],
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      result = row['value'] as string
    },
  })
  return result
}

function handleSetPreference(key: string, value: string): void {
  if (!db) return
  db.exec('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)', {
    bind: [key, value],
  })
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

function respond(id: number, value: unknown): void {
  const msg: WorkerResponse = { id, type: 'result', value }
  self.postMessage(msg)
}

function respondError(id: number, message: string): void {
  const msg: WorkerResponse = { id, type: 'error', message }
  self.postMessage(msg)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  try {
    switch (msg.type) {
      case 'get':
        respond(msg.id, handleGet(msg.key))
        break
      case 'set':
        handleSet(msg.key, msg.entry)
        respond(msg.id, undefined)
        break
      case 'delete':
        handleDelete(msg.key)
        respond(msg.id, undefined)
        break
      case 'clear':
        handleClear()
        respond(msg.id, undefined)
        break
      case 'getStats':
        respond(msg.id, handleGetStats())
        break
      case 'getMeta':
        respond(msg.id, handleGetMeta(msg.key))
        break
      case 'setMeta':
        handleSetMeta(msg.key, msg.meta)
        respond(msg.id, undefined)
        break
      case 'preloadAll':
        respond(msg.id, handlePreloadAll())
        break
      case 'migrate':
        handleMigrate(msg.data)
        respond(msg.id, undefined)
        break
      case 'seedCache':
        handleSeedCache(msg.entries)
        respond(msg.id, undefined)
        break
      case 'getPreference':
        respond(msg.id, handleGetPreference(msg.key))
        break
      case 'setPreference':
        handleSetPreference(msg.key, msg.value)
        respond(msg.id, undefined)
        break
      default: {
        const unknown = msg as { id: number; type: string }
        respondError(unknown.id, `Unknown message type: ${unknown.type}`)
      }
    }
  } catch (e) {
    respondError(msg.id, e instanceof Error ? e.message : String(e))
  }
}

// ---------------------------------------------------------------------------
// Initialize SQLite and signal readiness
// ---------------------------------------------------------------------------

initDatabase()
  .then(() => {
    const msg: WorkerResponse = { id: -1, type: 'ready' }
    self.postMessage(msg)
  })
  .catch((e) => {
    console.error('[CacheWorker] Init failed:', e)
    // Signal ready anyway — the main thread will fall back to IndexedDB
    const msg: WorkerResponse = { id: -1, type: 'ready' }
    self.postMessage(msg)
  })
