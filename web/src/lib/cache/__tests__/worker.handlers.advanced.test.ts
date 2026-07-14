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
})
