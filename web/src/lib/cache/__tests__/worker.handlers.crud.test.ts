import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests for the SQLite cache worker message handler logic.
 *
 * The worker runs in a Web Worker context with `self.onmessage`.
 * We test the pure handler functions by extracting the logic patterns
 * used in the worker (handleGet, handleSet, handleDelete, etc.)
 * and validating the message-routing, queuing, and response logic.
 *
 * Since the actual worker depends on SQLite WASM (dynamic import),
 * we test the message-routing, queuing, and response logic.
 */

// Replicate the core types locally so we don't import the actual worker module
// (which runs `initDatabase()` at import time and calls `self.postMessage`).
interface CacheEntry {
  data: unknown
  timestamp: number
  version: number
}

interface CacheMeta {
  consecutiveFailures: number
  lastError?: string
  lastSuccessfulRefresh?: number
}

interface WorkerResponse {
  id: number
  type: 'result' | 'error' | 'ready' | 'init-error'
  value?: unknown
  message?: string
}

type WorkerRequest =
  | { id: number; type: 'get'; key: string }
  | { id: number; type: 'set'; key: string; entry: CacheEntry }
  | { id: number; type: 'delete'; key: string }
  | { id: number; type: 'clear' }
  | { id: number; type: 'getStats' }
  | { id: number; type: 'getMeta'; key: string }
  | { id: number; type: 'setMeta'; key: string; meta: CacheMeta }
  | { id: number; type: 'preloadAll' }
  | { id: number; type: 'migrate'; data: { cacheEntries: Array<{ key: string; entry: CacheEntry }>; metaEntries: Array<{ key: string; meta: CacheMeta }> } }
  | { id: number; type: 'seedCache'; entries: Array<{ key: string; entry: CacheEntry }> }
  | { id: number; type: 'getPreference'; key: string }
  | { id: number; type: 'setPreference'; key: string; value: string }

// ---------------------------------------------------------------------------
// Simulate the handler functions extracted from worker.ts
// ---------------------------------------------------------------------------

/** Maximum number of messages to queue while waiting for database init. */
const MAX_PENDING_MESSAGES = 1000

function createMockDb() {
  const store = new Map<string, string>()
  const metaStore = new Map<string, string>()
  const prefStore = new Map<string, string>()

  return {
    store,
    metaStore,
    prefStore,
    exec: vi.fn((sql: string, opts?: { bind?: unknown[]; rowMode?: string; callback?: (row: Record<string, unknown>) => void }) => {
      // Simulate basic SQL operations for testing
      if (sql.startsWith('SELECT data, timestamp, version FROM cache_data WHERE key = ?')) {
        const key = opts?.bind?.[0] as string
        const raw = store.get(key)
        if (raw && opts?.callback) {
          const parsed = JSON.parse(raw)
          opts.callback({ data: parsed.data, timestamp: parsed.timestamp, version: parsed.version })
        }
      } else if (sql.startsWith('INSERT OR REPLACE INTO cache_data')) {
        const key = opts?.bind?.[0] as string
        const data = opts?.bind?.[1] as string
        const timestamp = opts?.bind?.[2] as number
        const version = opts?.bind?.[3] as number
        store.set(key, JSON.stringify({ data, timestamp, version }))
      } else if (sql === 'DELETE FROM cache_data WHERE key = ?') {
        const key = opts?.bind?.[0] as string
        store.delete(key)
      } else if (sql === 'DELETE FROM cache_data') {
        store.clear()
      } else if (sql === 'DELETE FROM cache_meta') {
        metaStore.clear()
      } else if (sql === 'SELECT key FROM cache_data') {
        for (const key of store.keys()) {
          opts?.callback?.({ key })
        }
      } else if (sql.startsWith('SELECT consecutive_failures, last_error, last_successful_refresh FROM cache_meta WHERE key = ?')) {
        const key = opts?.bind?.[0] as string
        const raw = metaStore.get(key)
        if (raw && opts?.callback) {
          opts.callback(JSON.parse(raw))
        }
      } else if (sql.startsWith('INSERT OR REPLACE INTO cache_meta')) {
        const key = opts?.bind?.[0] as string
        metaStore.set(key, JSON.stringify({
          consecutive_failures: opts?.bind?.[1],
          last_error: opts?.bind?.[2],
          last_successful_refresh: opts?.bind?.[3],
        }))
      } else if (sql.startsWith('SELECT key, consecutive_failures, last_error, last_successful_refresh FROM cache_meta')) {
        for (const [key, raw] of metaStore.entries()) {
          const parsed = JSON.parse(raw)
          opts?.callback?.({ key, ...parsed })
        }
      } else if (sql === 'SELECT value FROM preferences WHERE key = ?') {
        const key = opts?.bind?.[0] as string
        const value = prefStore.get(key)
        if (value && opts?.callback) {
          opts.callback({ value })
        }
      } else if (sql.startsWith('INSERT OR REPLACE INTO preferences')) {
        const key = opts?.bind?.[0] as string
        prefStore.set(key, opts?.bind?.[1] as string)
      }
      // BEGIN TRANSACTION, COMMIT, ROLLBACK are no-ops in our mock
    }),
    close: vi.fn(),
  }
}

type MockDb = ReturnType<typeof createMockDb>

// Replicate the handler functions from worker.ts for testability
function handleGet(db: MockDb | null, key: string): CacheEntry | null {
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

function handleSet(db: MockDb | null, key: string, entry: CacheEntry): void {
  if (!db) return
  const dataStr = JSON.stringify(entry.data)
  db.exec(
    'INSERT OR REPLACE INTO cache_data (key, data, timestamp, version, size_bytes) VALUES (?, ?, ?, ?, ?)',
    { bind: [key, dataStr, entry.timestamp, entry.version, dataStr.length] }
  )
}

function handleDelete(db: MockDb | null, key: string): void {
  if (!db) return
  db.exec('DELETE FROM cache_data WHERE key = ?', { bind: [key] })
}

function handleClear(db: MockDb | null): void {
  if (!db) return
  db.exec('DELETE FROM cache_data')
  db.exec('DELETE FROM cache_meta')
}

function handleGetStats(db: MockDb | null): { keys: string[]; count: number } {
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

function handleGetMeta(db: MockDb | null, key: string): CacheMeta | null {
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

function handleSetMeta(db: MockDb | null, key: string, meta: CacheMeta): void {
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

function handlePreloadAll(db: MockDb | null): { meta: Record<string, CacheMeta>; cacheKeys: string[] } {
  const meta: Record<string, CacheMeta> = {}
  const cacheKeys: string[] = []

  if (!db) return { meta, cacheKeys }

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

  db.exec('SELECT key FROM cache_data', {
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      cacheKeys.push(row['key'] as string)
    },
  })

  return { meta, cacheKeys }
}

function handleMigrate(
  db: MockDb | null,
  data: {
    cacheEntries: Array<{ key: string; entry: CacheEntry }>
    metaEntries: Array<{ key: string; meta: CacheMeta }>
  }
): void {
  if (!db) return

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
  } catch (e: unknown) {
    db.exec('ROLLBACK')
    throw e
  }
}

function handleSeedCache(db: MockDb | null, entries: Array<{ key: string; entry: CacheEntry }>): void {
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
  } catch (e: unknown) {
    db.exec('ROLLBACK')
    throw e
  }
}

function handleGetPreference(db: MockDb | null, key: string): string | null {
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

function handleSetPreference(db: MockDb | null, key: string, value: string): void {
  if (!db) return
  db.exec('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)', {
    bind: [key, value],
  })
}

function respond(id: number, value: unknown): WorkerResponse {
  return { id, type: 'result', value }
}

function respondError(id: number, message: string): WorkerResponse {
  return { id, type: 'error', message }
}

// Replicate processMessage for dispatch testing
function processMessage(
  db: MockDb | null,
  msg: WorkerRequest,
  postMessage: (resp: WorkerResponse) => void
): void {
  try {
    switch (msg.type) {
      case 'get':
        postMessage(respond(msg.id, handleGet(db, msg.key)))
        break
      case 'set':
        handleSet(db, msg.key, msg.entry)
        postMessage(respond(msg.id, undefined))
        break
      case 'delete':
        handleDelete(db, msg.key)
        postMessage(respond(msg.id, undefined))
        break
      case 'clear':
        handleClear(db)
        postMessage(respond(msg.id, undefined))
        break
      case 'getStats':
        postMessage(respond(msg.id, handleGetStats(db)))
        break
      case 'getMeta':
        postMessage(respond(msg.id, handleGetMeta(db, msg.key)))
        break
      case 'setMeta':
        handleSetMeta(db, msg.key, msg.meta)
        postMessage(respond(msg.id, undefined))
        break
      case 'preloadAll':
        postMessage(respond(msg.id, handlePreloadAll(db)))
        break
      case 'migrate':
        handleMigrate(db, msg.data)
        postMessage(respond(msg.id, undefined))
        break
      case 'seedCache':
        handleSeedCache(db, msg.entries)
        postMessage(respond(msg.id, undefined))
        break
      case 'getPreference':
        postMessage(respond(msg.id, handleGetPreference(db, msg.key)))
        break
      case 'setPreference':
        handleSetPreference(db, msg.key, msg.value)
        postMessage(respond(msg.id, undefined))
        break
      default: {
        const unknown = msg as { id: number; type: string }
        postMessage(respondError(unknown.id, `Unknown message type: ${unknown.type}`))
      }
    }
  } catch (e: unknown) {
    postMessage(respondError(msg.id, e instanceof Error ? e.message : String(e)))
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cache Worker handlers', () => {
  let db: ReturnType<typeof createMockDb>
  beforeEach(() => { db = createMockDb() })
  afterEach(() => { db.store.clear(); db.metaStore.clear(); db.prefStore.clear() })

  describe('handleGet', () => {
    it('returns null when db is null', () => {
      expect(handleGet(null, 'test-key')).toBeNull()
    })

    it('returns null when key does not exist', () => {
      expect(handleGet(db, 'missing-key')).toBeNull()
    })

    it('returns cached entry after handleSet', () => {
      const entry: CacheEntry = { data: { foo: 'bar' }, timestamp: 1000, version: 1 }
      handleSet(db, 'my-key', entry)
      const result = handleGet(db, 'my-key')
      expect(result).not.toBeNull()
      expect(result?.timestamp).toBe(1000)
      expect(result?.version).toBe(1)
    })

    it('correctly deserializes complex nested data', () => {
      const complexData = { arr: [1, 2, { nested: true }], str: 'hello', num: 42 }
      const entry: CacheEntry = { data: complexData, timestamp: 5000, version: 3 }
      handleSet(db, 'complex', entry)
      const result = handleGet(db, 'complex')
      expect(result?.data).toEqual(complexData)
    })
  })

  describe('handleSet', () => {
    it('does nothing when db is null', () => {
      // Should not throw
      handleSet(null, 'key', { data: 'val', timestamp: 0, version: 0 })
    })

    it('calls exec with correct SQL and bind parameters', () => {
      const entry: CacheEntry = { data: [1, 2, 3], timestamp: 999, version: 2 }
      handleSet(db, 'arr-key', entry)
      expect(db.exec).toHaveBeenCalled()
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_data')
      )
      expect(call).toBeDefined()
      expect(call?.[1]?.bind?.[0]).toBe('arr-key')
    })

    it('overwrites existing entry with same key', () => {
      handleSet(db, 'k', { data: 'v1', timestamp: 1, version: 1 })
      handleSet(db, 'k', { data: 'v2', timestamp: 2, version: 2 })
      const result = handleGet(db, 'k')
      expect(result?.version).toBe(2)
    })

    it('stores size_bytes as the length of stringified data', () => {
      const entry: CacheEntry = { data: { test: 'value' }, timestamp: 100, version: 1 }
      handleSet(db, 'size-test', entry)
      const dataStr = JSON.stringify(entry.data)
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_data')
      )
      // The 5th bind parameter is size_bytes = dataStr.length
      expect(call?.[1]?.bind?.[4]).toBe(dataStr.length)
    })
  })

  describe('handleDelete', () => {
    it('does nothing when db is null', () => {
      handleDelete(null, 'key')
    })

    it('removes a stored key', () => {
      handleSet(db, 'del-key', { data: 'x', timestamp: 1, version: 1 })
      expect(handleGet(db, 'del-key')).not.toBeNull()
      handleDelete(db, 'del-key')
      expect(handleGet(db, 'del-key')).toBeNull()
    })

    it('is a no-op when key does not exist', () => {
      // Should not throw
      handleDelete(db, 'nonexistent')
      expect(handleGet(db, 'nonexistent')).toBeNull()
    })
  })

  describe('handleClear', () => {
    it('does nothing when db is null', () => {
      handleClear(null)
    })

    it('removes all entries', () => {
      handleSet(db, 'a', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'b', { data: 2, timestamp: 2, version: 2 })
      handleClear(db)
      expect(handleGet(db, 'a')).toBeNull()
      expect(handleGet(db, 'b')).toBeNull()
    })

    it('also clears meta store', () => {
      handleSetMeta(db, 'metakey', { consecutiveFailures: 3, lastError: 'err' })
      handleClear(db)
      expect(handleGetMeta(db, 'metakey')).toBeNull()
    })

    it('calls DELETE on both cache_data and cache_meta', () => {
      handleClear(db)
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('DELETE FROM cache_data')
      expect(calls).toContain('DELETE FROM cache_meta')
    })
  })

  describe('handleGetStats', () => {
    it('returns empty stats when db is null', () => {
      const stats = handleGetStats(null)
      expect(stats).toEqual({ keys: [], count: 0 })
    })

    it('returns correct key count', () => {
      handleSet(db, 'x', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'y', { data: 2, timestamp: 2, version: 2 })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(2)
      expect(stats.keys).toContain('x')
      expect(stats.keys).toContain('y')
    })

    it('returns empty stats when no data stored', () => {
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
      expect(stats.keys).toEqual([])
    })

    it('count equals keys.length', () => {
      handleSet(db, 'a', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'b', { data: 2, timestamp: 2, version: 2 })
      handleSet(db, 'c', { data: 3, timestamp: 3, version: 3 })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(stats.keys.length)
    })
  })

  describe('handleGetMeta / handleSetMeta', () => {
    it('returns null for missing meta when db is null', () => {
      expect(handleGetMeta(null, 'any')).toBeNull()
    })

    it('does nothing when setting meta with null db', () => {
      handleSetMeta(null, 'k', { consecutiveFailures: 0 })
    })

    it('returns null for non-existent meta key', () => {
      expect(handleGetMeta(db, 'nonexistent')).toBeNull()
    })

    it('stores and retrieves meta data', () => {
      const meta: CacheMeta = {
        consecutiveFailures: 5,
        lastError: 'timeout',
        lastSuccessfulRefresh: 1700000000,
      }
      handleSetMeta(db, 'cluster-data', meta)
      const result = handleGetMeta(db, 'cluster-data')
      expect(result).not.toBeNull()
      expect(result!.consecutiveFailures).toBe(5)
      expect(result!.lastError).toBe('timeout')
      expect(result!.lastSuccessfulRefresh).toBe(1700000000)
    })

    it('handles meta with undefined optional fields', () => {
      const meta: CacheMeta = { consecutiveFailures: 0 }
      handleSetMeta(db, 'clean-key', meta)
      const result = handleGetMeta(db, 'clean-key')
      expect(result).not.toBeNull()
      expect(result!.consecutiveFailures).toBe(0)
      // lastError and lastSuccessfulRefresh should be undefined when stored as null
      expect(result!.lastError).toBeUndefined()
      expect(result!.lastSuccessfulRefresh).toBeUndefined()
    })

    it('overwrites existing meta', () => {
      handleSetMeta(db, 'k', { consecutiveFailures: 1, lastError: 'first' })
      handleSetMeta(db, 'k', { consecutiveFailures: 2, lastError: 'second' })
      const result = handleGetMeta(db, 'k')
      expect(result!.consecutiveFailures).toBe(2)
      expect(result!.lastError).toBe('second')
    })

    it('uses nullish coalescing for optional meta fields in bind params', () => {
      const meta: CacheMeta = { consecutiveFailures: 3 }
      handleSetMeta(db, 'test', meta)
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_meta')
      )
      // lastError ?? null => null, lastSuccessfulRefresh ?? null => null
      expect(call?.[1]?.bind?.[2]).toBeNull()
      expect(call?.[1]?.bind?.[3]).toBeNull()
    })
  })
})
