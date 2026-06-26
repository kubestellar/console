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
  let db: MockDb

  beforeEach(() => {
    db = createMockDb()
  })

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

  describe('handlePreloadAll', () => {
    it('returns empty result when db is null', () => {
      const result = handlePreloadAll(null)
      expect(result).toEqual({ meta: {}, cacheKeys: [] })
    })

    it('returns empty result when no data stored', () => {
      const result = handlePreloadAll(db)
      expect(result.meta).toEqual({})
      expect(result.cacheKeys).toEqual([])
    })

    it('loads both meta and cache keys', () => {
      handleSet(db, 'key1', { data: 'data1', timestamp: 100, version: 1 })
      handleSet(db, 'key2', { data: 'data2', timestamp: 200, version: 2 })
      handleSetMeta(db, 'key1', { consecutiveFailures: 1, lastError: 'err1' })
      handleSetMeta(db, 'key2', { consecutiveFailures: 0, lastSuccessfulRefresh: 300 })

      const result = handlePreloadAll(db)
      expect(result.cacheKeys).toContain('key1')
      expect(result.cacheKeys).toContain('key2')
      expect(result.cacheKeys.length).toBe(2)
      expect(result.meta['key1'].consecutiveFailures).toBe(1)
      expect(result.meta['key1'].lastError).toBe('err1')
      expect(result.meta['key2'].consecutiveFailures).toBe(0)
      expect(result.meta['key2'].lastSuccessfulRefresh).toBe(300)
    })

    it('returns cache keys even when no meta exists', () => {
      handleSet(db, 'keyonly', { data: 'val', timestamp: 50, version: 1 })
      const result = handlePreloadAll(db)
      expect(result.cacheKeys).toContain('keyonly')
      expect(Object.keys(result.meta).length).toBe(0)
    })

    it('returns meta even when no cache data exists', () => {
      handleSetMeta(db, 'orphan', { consecutiveFailures: 7, lastError: 'lost' })
      const result = handlePreloadAll(db)
      expect(result.cacheKeys.length).toBe(0)
      expect(result.meta['orphan'].consecutiveFailures).toBe(7)
    })
  })

  describe('handleMigrate', () => {
    it('does nothing when db is null', () => {
      handleMigrate(null, { cacheEntries: [], metaEntries: [] })
    })

    it('migrates cache entries and meta entries atomically', () => {
      const data = {
        cacheEntries: [
          { key: 'mig1', entry: { data: 'v1', timestamp: 100, version: 1 } },
          { key: 'mig2', entry: { data: 'v2', timestamp: 200, version: 2 } },
        ],
        metaEntries: [
          { key: 'mig1', meta: { consecutiveFailures: 0 } as CacheMeta },
          { key: 'mig2', meta: { consecutiveFailures: 3, lastError: 'err' } as CacheMeta },
        ],
      }
      handleMigrate(db, data)

      const entry1 = handleGet(db, 'mig1')
      expect(entry1).not.toBeNull()
      expect(entry1!.timestamp).toBe(100)

      const entry2 = handleGet(db, 'mig2')
      expect(entry2).not.toBeNull()
      expect(entry2!.version).toBe(2)

      const meta2 = handleGetMeta(db, 'mig2')
      expect(meta2!.consecutiveFailures).toBe(3)
    })

    it('calls BEGIN TRANSACTION and COMMIT', () => {
      handleMigrate(db, {
        cacheEntries: [{ key: 'k', entry: { data: 'x', timestamp: 1, version: 1 } }],
        metaEntries: [],
      })
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('BEGIN TRANSACTION')
      expect(calls).toContain('COMMIT')
      expect(calls).not.toContain('ROLLBACK')
    })

    it('rolls back on error', () => {
      // Create a db where INSERT throws after BEGIN
      const brokenDb = createMockDb()
      const originalExec = brokenDb.exec
      let callCount = 0
      brokenDb.exec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        callCount++
        // Let BEGIN pass, then throw on INSERT
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data') && callCount > 1) {
          throw new Error('disk full')
        }
        return originalExec(sql, opts as Parameters<typeof originalExec>[1])
      }) as typeof brokenDb.exec

      expect(() => {
        handleMigrate(brokenDb, {
          cacheEntries: [{ key: 'k', entry: { data: 'x', timestamp: 1, version: 1 } }],
          metaEntries: [],
        })
      }).toThrow('disk full')

      const calls = brokenDb.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('ROLLBACK')
    })

    it('handles empty migration data', () => {
      handleMigrate(db, { cacheEntries: [], metaEntries: [] })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
    })
  })

  describe('handleSeedCache', () => {
    it('does nothing when db is null', () => {
      handleSeedCache(null, [])
    })

    it('seeds multiple cache entries in a transaction', () => {
      const entries = [
        { key: 's1', entry: { data: 'seed1', timestamp: 10, version: 1 } },
        { key: 's2', entry: { data: 'seed2', timestamp: 20, version: 2 } },
        { key: 's3', entry: { data: 'seed3', timestamp: 30, version: 3 } },
      ]
      handleSeedCache(db, entries)

      expect(handleGet(db, 's1')?.data).toBe('seed1')
      expect(handleGet(db, 's2')?.data).toBe('seed2')
      expect(handleGet(db, 's3')?.data).toBe('seed3')
    })

    it('calls BEGIN TRANSACTION and COMMIT', () => {
      handleSeedCache(db, [
        { key: 'k', entry: { data: 'v', timestamp: 1, version: 1 } },
      ])
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('BEGIN TRANSACTION')
      expect(calls).toContain('COMMIT')
    })

    it('rolls back on error', () => {
      const brokenDb = createMockDb()
      const originalExec = brokenDb.exec
      let callCount = 0
      brokenDb.exec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        callCount++
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data') && callCount > 1) {
          throw new Error('io error')
        }
        return originalExec(sql, opts as Parameters<typeof originalExec>[1])
      }) as typeof brokenDb.exec

      expect(() => {
        handleSeedCache(brokenDb, [
          { key: 'k', entry: { data: 'v', timestamp: 1, version: 1 } },
        ])
      }).toThrow('io error')

      const calls = brokenDb.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('ROLLBACK')
    })

    it('handles empty entries array', () => {
      handleSeedCache(db, [])
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
    })
  })

  describe('handleGetPreference / handleSetPreference', () => {
    it('returns null for missing preference when db is null', () => {
      expect(handleGetPreference(null, 'theme')).toBeNull()
    })

    it('returns null for non-existent preference', () => {
      expect(handleGetPreference(db, 'nonexistent')).toBeNull()
    })

    it('stores and retrieves a preference', () => {
      handleSetPreference(db, 'theme', 'dark')
      expect(handleGetPreference(db, 'theme')).toBe('dark')
    })

    it('overwrites an existing preference', () => {
      handleSetPreference(db, 'lang', 'en')
      handleSetPreference(db, 'lang', 'fr')
      expect(handleGetPreference(db, 'lang')).toBe('fr')
    })

    it('does nothing when setting preference with null db', () => {
      handleSetPreference(null, 'k', 'v')
    })

    it('stores multiple independent preferences', () => {
      handleSetPreference(db, 'theme', 'light')
      handleSetPreference(db, 'lang', 'de')
      handleSetPreference(db, 'font-size', '14')
      expect(handleGetPreference(db, 'theme')).toBe('light')
      expect(handleGetPreference(db, 'lang')).toBe('de')
      expect(handleGetPreference(db, 'font-size')).toBe('14')
    })
  })

  describe('respond / respondError', () => {
    it('creates a result response', () => {
      const resp = respond(42, { hello: 'world' })
      expect(resp.id).toBe(42)
      expect(resp.type).toBe('result')
      expect(resp.value).toEqual({ hello: 'world' })
    })

    it('creates an error response', () => {
      const resp = respondError(99, 'something broke')
      expect(resp.id).toBe(99)
      expect(resp.type).toBe('error')
      expect(resp.message).toBe('something broke')
    })

    it('respond handles null value', () => {
      const resp = respond(1, null)
      expect(resp.value).toBeNull()
    })

    it('respond handles undefined value', () => {
      const resp = respond(2, undefined)
      expect(resp.value).toBeUndefined()
    })

    it('respondError with empty string message', () => {
      const resp = respondError(3, '')
      expect(resp.message).toBe('')
      expect(resp.type).toBe('error')
    })
  })

  describe('processMessage dispatch', () => {
    it('dispatches get message', () => {
      const postMessage = vi.fn()
      handleSet(db, 'dispatch-key', { data: 'val', timestamp: 1, version: 1 })
      processMessage(db, { id: 1, type: 'get', key: 'dispatch-key' }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.id).toBe(1)
      expect(resp.type).toBe('result')
      expect(resp.value).not.toBeNull()
    })

    it('dispatches set message', () => {
      const postMessage = vi.fn()
      const entry: CacheEntry = { data: 'test', timestamp: 100, version: 1 }
      processMessage(db, { id: 2, type: 'set', key: 'set-key', entry }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(postMessage.mock.calls[0][0].type).toBe('result')
      expect(handleGet(db, 'set-key')).not.toBeNull()
    })

    it('dispatches delete message', () => {
      const postMessage = vi.fn()
      handleSet(db, 'del-key', { data: 'v', timestamp: 1, version: 1 })
      processMessage(db, { id: 3, type: 'delete', key: 'del-key' }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGet(db, 'del-key')).toBeNull()
    })

    it('dispatches clear message', () => {
      const postMessage = vi.fn()
      handleSet(db, 'a', { data: 1, timestamp: 1, version: 1 })
      processMessage(db, { id: 4, type: 'clear' }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGetStats(db).count).toBe(0)
    })

    it('dispatches getStats message', () => {
      const postMessage = vi.fn()
      handleSet(db, 'x', { data: 1, timestamp: 1, version: 1 })
      processMessage(db, { id: 5, type: 'getStats' }, postMessage)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.type).toBe('result')
      const stats = resp.value as { keys: string[]; count: number }
      expect(stats.count).toBe(1)
    })

    it('dispatches getMeta message', () => {
      const postMessage = vi.fn()
      handleSetMeta(db, 'mk', { consecutiveFailures: 2, lastError: 'err' })
      processMessage(db, { id: 6, type: 'getMeta', key: 'mk' }, postMessage)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      const meta = resp.value as CacheMeta
      expect(meta.consecutiveFailures).toBe(2)
    })

    it('dispatches setMeta message', () => {
      const postMessage = vi.fn()
      const meta: CacheMeta = { consecutiveFailures: 1 }
      processMessage(db, { id: 7, type: 'setMeta', key: 'sm', meta }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGetMeta(db, 'sm')!.consecutiveFailures).toBe(1)
    })

    it('dispatches preloadAll message', () => {
      const postMessage = vi.fn()
      handleSet(db, 'p1', { data: 'v', timestamp: 1, version: 1 })
      handleSetMeta(db, 'p1', { consecutiveFailures: 0 })
      processMessage(db, { id: 8, type: 'preloadAll' }, postMessage)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      const result = resp.value as { meta: Record<string, CacheMeta>; cacheKeys: string[] }
      expect(result.cacheKeys).toContain('p1')
      expect(result.meta['p1']).toBeDefined()
    })

    it('dispatches migrate message', () => {
      const postMessage = vi.fn()
      const data = {
        cacheEntries: [{ key: 'mk', entry: { data: 'mval', timestamp: 1, version: 1 } }],
        metaEntries: [{ key: 'mk', meta: { consecutiveFailures: 0 } as CacheMeta }],
      }
      processMessage(db, { id: 9, type: 'migrate', data }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGet(db, 'mk')).not.toBeNull()
    })

    it('dispatches seedCache message', () => {
      const postMessage = vi.fn()
      const entries = [
        { key: 'sc1', entry: { data: 'seed', timestamp: 1, version: 1 } },
      ]
      processMessage(db, { id: 10, type: 'seedCache', entries }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGet(db, 'sc1')).not.toBeNull()
    })

    it('dispatches getPreference message', () => {
      const postMessage = vi.fn()
      handleSetPreference(db, 'pref-key', 'pref-val')
      processMessage(db, { id: 11, type: 'getPreference', key: 'pref-key' }, postMessage)
      expect(postMessage.mock.calls[0][0].value).toBe('pref-val')
    })

    it('dispatches setPreference message', () => {
      const postMessage = vi.fn()
      processMessage(db, { id: 12, type: 'setPreference', key: 'sp', value: 'sv' }, postMessage)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(handleGetPreference(db, 'sp')).toBe('sv')
    })

    it('returns error for unknown message type', () => {
      const postMessage = vi.fn()
      const unknownMsg = { id: 99, type: 'unknownType' } as unknown as WorkerRequest
      processMessage(db, unknownMsg, postMessage)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.type).toBe('error')
      expect(resp.message).toContain('Unknown message type')
      expect(resp.message).toContain('unknownType')
    })

    it('catches handler errors and responds with error message', () => {
      const postMessage = vi.fn()
      // Create a db whose exec throws on any INSERT
      const errorDb = createMockDb()
      errorDb.exec = vi.fn(() => { throw new Error('simulated failure') })
      processMessage(
        errorDb,
        { id: 50, type: 'set', key: 'err', entry: { data: 1, timestamp: 1, version: 1 } },
        postMessage
      )
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.type).toBe('error')
      expect(resp.id).toBe(50)
      expect(resp.message).toBe('simulated failure')
    })

    it('converts non-Error throws to string in error response', () => {
      const postMessage = vi.fn()
      const errorDb = createMockDb()
      errorDb.exec = vi.fn(() => { throw 'string error' })   
      processMessage(
        errorDb,
        { id: 51, type: 'clear' },
        postMessage
      )
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.type).toBe('error')
      expect(resp.message).toBe('string error')
    })

    it('handlers with null db return gracefully via processMessage', () => {
      const postMessage = vi.fn()
      processMessage(null, { id: 100, type: 'get', key: 'noop' }, postMessage)
      expect(postMessage.mock.calls[0][0].value).toBeNull()

      processMessage(null, { id: 101, type: 'getStats' }, postMessage)
      const stats = postMessage.mock.calls[1][0].value as { keys: string[]; count: number }
      expect(stats.count).toBe(0)

      processMessage(null, { id: 102, type: 'getMeta', key: 'x' }, postMessage)
      expect(postMessage.mock.calls[2][0].value).toBeNull()

      processMessage(null, { id: 103, type: 'preloadAll' }, postMessage)
      const preload = postMessage.mock.calls[3][0].value as { meta: Record<string, CacheMeta>; cacheKeys: string[] }
      expect(preload.cacheKeys).toEqual([])

      processMessage(null, { id: 104, type: 'getPreference', key: 'x' }, postMessage)
      expect(postMessage.mock.calls[4][0].value).toBeNull()
    })
  })

  describe('message queuing', () => {
    it('MAX_PENDING_MESSAGES is 1000', () => {
      expect(MAX_PENDING_MESSAGES).toBe(1000)
    })

    it('pending queue is bounded', () => {
      const queue: unknown[] = []
      const OVERFLOW_AMOUNT = 10
      for (let i = 0; i < MAX_PENDING_MESSAGES + OVERFLOW_AMOUNT; i++) {
        if (queue.length < MAX_PENDING_MESSAGES) {
          queue.push({ id: i, type: 'get', key: `k${i}` })
        }
      }
      expect(queue.length).toBe(MAX_PENDING_MESSAGES)
    })

    it('simulates onmessage queueing before initComplete', () => {
      let initComplete = false
      const pendingMessages: WorkerRequest[] = []
      const postMessage = vi.fn()
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Simulate onmessage handler
      function onmessage(eventData: WorkerRequest) {
        if (!initComplete) {
          if (pendingMessages.length >= MAX_PENDING_MESSAGES) {
            postMessage(respondError(eventData.id, 'Worker initializing and message queue is full'))
            return
          }
          pendingMessages.push(eventData)
          return
        }
        processMessage(db, eventData, postMessage)
      }

      // Queue a few messages before init
      onmessage({ id: 1, type: 'get', key: 'test' })
      onmessage({ id: 2, type: 'getStats' })
      expect(pendingMessages.length).toBe(2)
      expect(postMessage).not.toHaveBeenCalled()

      // Simulate init complete - drain pending
      initComplete = true
      for (const queued of pendingMessages) {
        processMessage(db, queued, postMessage)
      }
      pendingMessages.length = 0

      expect(postMessage).toHaveBeenCalledTimes(2)
      expect(pendingMessages.length).toBe(0)

      consoleWarn.mockRestore()
    })

    it('drops messages when queue is full', () => {
      const pendingMessages: WorkerRequest[] = []
      const postMessage = vi.fn()

      // Fill the queue to capacity
      for (let i = 0; i < MAX_PENDING_MESSAGES; i++) {
        pendingMessages.push({ id: i, type: 'get', key: `k${i}` })
      }

      // Now try to add one more (should be rejected)
      const overflow: WorkerRequest = { id: 9999, type: 'get', key: 'overflow' }
      if (pendingMessages.length >= MAX_PENDING_MESSAGES) {
        postMessage(respondError(overflow.id, 'Worker initializing and message queue is full'))
      }

      expect(postMessage).toHaveBeenCalledTimes(1)
      const resp = postMessage.mock.calls[0][0] as WorkerResponse
      expect(resp.type).toBe('error')
      expect(resp.id).toBe(9999)
      expect(resp.message).toContain('queue is full')
    })

    it('processes messages directly after initComplete is true', () => {
      const initComplete = true
      const postMessage = vi.fn()

      if (initComplete) {
        processMessage(db, { id: 1, type: 'getStats' }, postMessage)
      }

      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(postMessage.mock.calls[0][0].type).toBe('result')
    })
  })

  describe('init lifecycle simulation', () => {
    it('posts ready message after successful init', () => {
      const postMessage = vi.fn()
      // Simulate successful init
      const pendingMessages: WorkerRequest[] = [
        { id: 1, type: 'get', key: 'early' },
      ]
      let _initComplete = false

      // Simulate initDatabase().then()
      _initComplete = true
      for (const queued of pendingMessages) {
        processMessage(db, queued, postMessage)
      }
      pendingMessages.length = 0
      const readyMsg: WorkerResponse = { id: -1, type: 'ready' }
      postMessage(readyMsg)

      // Should have processed the pending message + sent ready
      expect(postMessage).toHaveBeenCalledTimes(2)
      const lastCall = postMessage.mock.calls[1][0] as WorkerResponse
      expect(lastCall.type).toBe('ready')
      expect(lastCall.id).toBe(-1)
    })

    it('posts init-error and rejects queued messages on failure', () => {
      const postMessage = vi.fn()
      const pendingMessages: WorkerRequest[] = [
        { id: 10, type: 'get', key: 'queued1' },
        { id: 11, type: 'getStats' },
      ]

      // Simulate initDatabase().catch()
      const reason = 'OPFS not available'
      for (const queued of pendingMessages) {
        postMessage(respondError(queued.id, `Worker init failed: ${reason}`))
      }
      pendingMessages.length = 0
      const initErrorMsg: WorkerResponse = { id: -1, type: 'init-error', message: reason }
      postMessage(initErrorMsg)

      // 2 rejected messages + 1 init-error
      expect(postMessage).toHaveBeenCalledTimes(3)

      // Verify rejected messages
      const rej1 = postMessage.mock.calls[0][0] as WorkerResponse
      expect(rej1.type).toBe('error')
      expect(rej1.id).toBe(10)
      expect(rej1.message).toContain('Worker init failed')

      const rej2 = postMessage.mock.calls[1][0] as WorkerResponse
      expect(rej2.type).toBe('error')
      expect(rej2.id).toBe(11)

      // Verify init-error
      const initErr = postMessage.mock.calls[2][0] as WorkerResponse
      expect(initErr.type).toBe('init-error')
      expect(initErr.message).toBe(reason)
    })

    it('future messages with null db return graceful defaults after init failure', () => {
      const postMessage = vi.fn()
      // After init failure, db stays null but initComplete = true
      // so future messages go through processMessage with null db
      processMessage(null, { id: 20, type: 'get', key: 'test' }, postMessage)
      expect(postMessage.mock.calls[0][0].value).toBeNull()

      processMessage(null, { id: 21, type: 'set', key: 'x', entry: { data: 1, timestamp: 1, version: 1 } }, postMessage)
      expect(postMessage.mock.calls[1][0].type).toBe('result')

      processMessage(null, { id: 22, type: 'delete', key: 'x' }, postMessage)
      expect(postMessage.mock.calls[2][0].type).toBe('result')

      processMessage(null, { id: 23, type: 'clear' }, postMessage)
      expect(postMessage.mock.calls[3][0].type).toBe('result')

      processMessage(null, { id: 24, type: 'setMeta', key: 'x', meta: { consecutiveFailures: 0 } }, postMessage)
      expect(postMessage.mock.calls[4][0].type).toBe('result')

      processMessage(null, { id: 25, type: 'migrate', data: { cacheEntries: [], metaEntries: [] } }, postMessage)
      expect(postMessage.mock.calls[5][0].type).toBe('result')

      processMessage(null, { id: 26, type: 'seedCache', entries: [] }, postMessage)
      expect(postMessage.mock.calls[6][0].type).toBe('result')

      processMessage(null, { id: 27, type: 'setPreference', key: 'k', value: 'v' }, postMessage)
      expect(postMessage.mock.calls[7][0].type).toBe('result')
    })
  })
})

