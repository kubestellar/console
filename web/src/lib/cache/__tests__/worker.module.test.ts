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

// ============================================================================
// Integration tests — actually import worker.ts with mocked SQLite WASM
// ============================================================================
//
// These tests import the real worker module (which calls initDatabase() at the
// top level and wires self.onmessage). We mock @sqlite.org/sqlite-wasm and
// self.postMessage to observe behavior.
// ============================================================================

describe('worker.ts module integration', () => {
  /** Captured postMessage calls */
  let posted: Array<Record<string, unknown>> = []
  let mockDbInstance: ReturnType<typeof createMockDb> | null = null

  /** Controls OPFS constructor availability */
  let integrationOpfsMode: 'SAHPool' | 'OpfsDb' | 'none' | 'throws' = 'SAHPool'
  /** Controls whether sqlite init rejects */
  let integrationInitFails = false
  /** Controls whether WAL pragma throws */
  let integrationWalFails = false

  function setupIntegrationSqliteMock() {
    vi.doMock('@sqlite.org/sqlite-wasm', () => ({
      default: vi.fn().mockImplementation(async () => {
        if (integrationInitFails) {
          throw new Error('SQLite WASM init failed')
        }

        mockDbInstance = createMockDb()

        const oo1: Record<string, unknown> = {}
        if (integrationOpfsMode === 'SAHPool') {
          oo1['OpfsSAHPoolDb'] = function MockSAHPool() { return mockDbInstance }
        } else if (integrationOpfsMode === 'OpfsDb') {
          oo1['OpfsDb'] = function MockOpfsDb() { return mockDbInstance }
        } else if (integrationOpfsMode === 'throws') {
          oo1['OpfsSAHPoolDb'] = function Throwing() { throw new Error('OPFS pool exhausted') }
        }
        // 'none' => no constructors at all

        return { oo1 }
      }),
    }))
  }

  async function importWorkerFresh(): Promise<void> {
    await import('../worker')
    // Let the init promise chain settle
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  function getOnmessage(): (e: MessageEvent) => void {
    return (self as unknown as { onmessage: (e: MessageEvent) => void }).onmessage
  }

  function sendMsg(msg: Record<string, unknown>) {
    getOnmessage()(new MessageEvent('message', { data: msg }))
  }

  beforeEach(() => {
    vi.resetModules()
    posted = []
    mockDbInstance = null
    integrationOpfsMode = 'SAHPool'
    integrationInitFails = false
    integrationWalFails = false

    // Stub self as a worker-like global with postMessage and onmessage
    const selfStub: Record<string, unknown> = {
      postMessage: vi.fn((...args: unknown[]) => {
        posted.push(args[0] as Record<string, unknown>)
      }),
      onmessage: null,
    }
    vi.stubGlobal('self', selfStub)
    // Also stub top-level postMessage for the respond/respondError helpers
    vi.stubGlobal('postMessage', selfStub.postMessage)

    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('initDatabase via module import', () => {
    it('posts ready when OpfsSAHPoolDb is available', async () => {
      setupIntegrationSqliteMock()
      await importWorkerFresh()

      const ready = posted.find(m => m.type === 'ready')
      expect(ready).toEqual({ id: -1, type: 'ready' })
    })

    it('posts ready when falling back to OpfsDb', async () => {
      integrationOpfsMode = 'OpfsDb'
      setupIntegrationSqliteMock()
      await importWorkerFresh()

      const ready = posted.find(m => m.type === 'ready')
      expect(ready).toEqual({ id: -1, type: 'ready' })
    })

    it('posts init-error when no OPFS support', async () => {
      integrationOpfsMode = 'none'
      setupIntegrationSqliteMock()
      await importWorkerFresh()

      const err = posted.find(m => m.type === 'init-error')
      expect(err).toBeDefined()
      expect(err!.message).toContain('OPFS')
    })

    it('posts init-error when OPFS constructor throws', async () => {
      integrationOpfsMode = 'throws'
      setupIntegrationSqliteMock()
      await importWorkerFresh()

      const err = posted.find(m => m.type === 'init-error')
      expect(err).toBeDefined()
    })

    it('posts init-error when sqlite3InitModule rejects', async () => {
      integrationInitFails = true
      setupIntegrationSqliteMock()
      await importWorkerFresh()

      const err = posted.find(m => m.type === 'init-error')
      expect(err).toBeDefined()
      expect(err!.message).toContain('SQLite WASM init failed')
    })

    it('succeeds even when WAL pragma fails', async () => {
      // Override the mock db to throw on WAL
      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(async () => {
          const dbInst = createMockDb()
          const origExec = dbInst.exec
          dbInst.exec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
            if (typeof sql === 'string' && sql.includes('PRAGMA journal_mode=WAL')) {
              throw new Error('WAL not supported')
            }
            return origExec(sql, opts as Parameters<typeof origExec>[1])
          }) as typeof dbInst.exec
          mockDbInstance = dbInst
          return {
            oo1: {
              OpfsSAHPoolDb: function MockSAHPool() { return dbInst },
            },
          }
        }),
      }))
      await importWorkerFresh()

      const ready = posted.find(m => m.type === 'ready')
      expect(ready).toEqual({ id: -1, type: 'ready' })
    })
  })

  describe('self.onmessage — post-init message processing', () => {
    beforeEach(async () => {
      setupIntegrationSqliteMock()
      await importWorkerFresh()
      posted = [] // clear the 'ready' message
    })

    it('handles get for missing key', () => {
      sendMsg({ id: 1, type: 'get', key: 'nope' })
      expect(posted).toContainEqual({ id: 1, type: 'result', value: null })
    })

    it('handles set then get round-trip', () => {
      sendMsg({
        id: 2,
        type: 'set',
        key: 'roundtrip',
        entry: { data: { items: [1] }, timestamp: 42, version: 3 },
      })
      expect(posted).toContainEqual({ id: 2, type: 'result', value: undefined })

      // Mock the query rows for the get
      mockDbInstance!.store.set('roundtrip', JSON.stringify({
        data: JSON.stringify({ items: [1] }),
        timestamp: 42,
        version: 3,
      }))

      sendMsg({ id: 3, type: 'get', key: 'roundtrip' })
      const getResp = posted.find(m => m.id === 3)
      expect(getResp).toBeDefined()
      expect(getResp!.type).toBe('result')
    })

    it('handles delete', () => {
      sendMsg({ id: 4, type: 'delete', key: 'del' })
      expect(posted).toContainEqual({ id: 4, type: 'result', value: undefined })
    })

    it('handles clear', () => {
      sendMsg({ id: 5, type: 'clear' })
      expect(posted).toContainEqual({ id: 5, type: 'result', value: undefined })
    })

    it('handles getStats', () => {
      sendMsg({ id: 6, type: 'getStats' })
      const resp = posted.find(m => m.id === 6)
      expect(resp).toBeDefined()
      expect(resp!.type).toBe('result')
      const stats = resp!.value as { keys: string[]; count: number }
      expect(stats.keys).toEqual([])
      expect(stats.count).toBe(0)
    })

    it('handles getMeta for missing key', () => {
      sendMsg({ id: 7, type: 'getMeta', key: 'nope' })
      expect(posted).toContainEqual({ id: 7, type: 'result', value: null })
    })

    it('handles setMeta', () => {
      sendMsg({
        id: 8,
        type: 'setMeta',
        key: 'mk',
        meta: { consecutiveFailures: 5, lastError: 'timeout' },
      })
      expect(posted).toContainEqual({ id: 8, type: 'result', value: undefined })
    })

    it('handles preloadAll', () => {
      sendMsg({ id: 9, type: 'preloadAll' })
      const resp = posted.find(m => m.id === 9)
      expect(resp!.type).toBe('result')
    })

    it('handles migrate', () => {
      sendMsg({
        id: 10,
        type: 'migrate',
        data: {
          cacheEntries: [{ key: 'c1', entry: { data: 'v', timestamp: 1, version: 1 } }],
          metaEntries: [{ key: 'm1', meta: { consecutiveFailures: 0 } }],
        },
      })
      expect(posted).toContainEqual({ id: 10, type: 'result', value: undefined })
    })

    it('handles seedCache', () => {
      sendMsg({
        id: 11,
        type: 'seedCache',
        entries: [{ key: 's1', entry: { data: 'seed', timestamp: 1, version: 1 } }],
      })
      expect(posted).toContainEqual({ id: 11, type: 'result', value: undefined })
    })

    it('handles getPreference for missing key', () => {
      sendMsg({ id: 12, type: 'getPreference', key: 'missing' })
      expect(posted).toContainEqual({ id: 12, type: 'result', value: null })
    })

    it('handles setPreference', () => {
      sendMsg({ id: 13, type: 'setPreference', key: 'theme', value: 'dark' })
      expect(posted).toContainEqual({ id: 13, type: 'result', value: undefined })
    })

    it('returns error for unknown message type', () => {
      sendMsg({ id: 99, type: 'bogusType' })
      const err = posted.find(m => m.id === 99)
      expect(err).toBeDefined()
      expect(err!.type).toBe('error')
      expect(err!.message).toContain('Unknown message type')
      expect(err!.message).toContain('bogusType')
    })

    it('returns error when handler throws', () => {
      // Force exec to throw on the next call
      mockDbInstance!.exec = vi.fn(() => { throw new Error('disk full') })
      sendMsg({ id: 100, type: 'get', key: 'err' })
      const err = posted.find(m => m.id === 100)
      expect(err!.type).toBe('error')
      expect(err!.message).toBe('disk full')
    })

    it('converts non-Error thrown values to string', () => {
      mockDbInstance!.exec = vi.fn(() => { throw 42 })
      sendMsg({ id: 101, type: 'clear' })
      const err = posted.find(m => m.id === 101)
      expect(err!.type).toBe('error')
      expect(err!.message).toBe('42')
    })
  })

  describe('self.onmessage — queuing before init', () => {
    it('queues messages and drains after init completes', async () => {
      let resolveInit: (() => void) | null = null
      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(() => new Promise<Record<string, unknown>>(resolve => {
          resolveInit = () => {
            mockDbInstance = createMockDb()
            resolve({
              oo1: { OpfsSAHPoolDb: function M() { return mockDbInstance } },
            })
          }
        })),
      }))

      // resetModules was already called in beforeEach; import the worker fresh
      vi.resetModules()
      await import('../worker')

      // Wait a tick for the dynamic import inside worker to fire
      await new Promise(resolve => setTimeout(resolve, 10))

      // Send messages during init (before resolution)
      sendMsg({ id: 1, type: 'getStats' })
      sendMsg({ id: 2, type: 'get', key: 'test' })

      // No results yet
      const resultsBefore = posted.filter(m => m.type === 'result')
      expect(resultsBefore).toHaveLength(0)

      // Resolve init
      expect(resolveInit).not.toBeNull()
      resolveInit!()
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should have ready + 2 results from drained queue
      const ready = posted.find(m => m.type === 'ready')
      expect(ready).toBeDefined()

      const results = posted.filter(m => m.type === 'result')
      expect(results.length).toBe(2)
    })

    it('rejects queued messages when init fails', async () => {
      integrationInitFails = true
      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(async () => {
          // Yield to let messages queue, then fail
          await new Promise(resolve => setTimeout(resolve, 10))
          throw new Error('init boom')
        }),
      }))

      await import('../worker')

      // Queue a message during init
      sendMsg({ id: 50, type: 'get', key: 'early' })

      await new Promise(resolve => setTimeout(resolve, 100))

      // The queued message should have been rejected
      const rejected = posted.find(
        m => m.type === 'error' && m.id === 50 && (m.message as string).includes('Worker init failed'),
      )
      expect(rejected).toBeDefined()

      // init-error should have been sent
      const initErr = posted.find(m => m.type === 'init-error')
      expect(initErr).toBeDefined()
    })

    it('drops messages when MAX_PENDING_MESSAGES is exceeded', async () => {
      const MAX_MESSAGES = 1000

      // Never-resolving init so queue stays bounded
      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
      }))

      await import('../worker')

      // Fill the queue
      for (let i = 0; i < MAX_MESSAGES; i++) {
        sendMsg({ id: i, type: 'getStats' })
      }

      // No errors yet (all queued)
      expect(posted.filter(m => m.type === 'error')).toHaveLength(0)

      // Overflow message
      sendMsg({ id: MAX_MESSAGES, type: 'get', key: 'overflow' })

      const overflow = posted.find(
        m => m.type === 'error' && m.id === MAX_MESSAGES,
      )
      expect(overflow).toBeDefined()
      expect(overflow!.message).toContain('queue is full')
    })

    it('processes messages directly once initComplete is set after failure', async () => {
      integrationInitFails = true
      setupIntegrationSqliteMock()
      await importWorkerFresh()
      posted = []

      // After init failure, initComplete = true but db = null
      // Messages should be processed directly (not queued)
      sendMsg({ id: 200, type: 'get', key: 'test' })
      expect(posted).toContainEqual({ id: 200, type: 'result', value: null })

      sendMsg({ id: 201, type: 'getStats' })
      expect(posted).toContainEqual({
        id: 201,
        type: 'result',
        value: { keys: [], count: 0 },
      })
    })
  })

  describe('migrate / seedCache rollback via real module', () => {
    beforeEach(async () => {
      setupIntegrationSqliteMock()
      await importWorkerFresh()
      posted = []
    })

    it('migrate responds with error and rolls back on insert failure', () => {
      // Make the db throw on INSERT INTO cache_data
      const origExec = mockDbInstance!.exec
      const mockExec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data')) {
          throw new Error('disk full')
        }
        return origExec(sql, opts as Parameters<typeof origExec>[1])
      })
      mockDbInstance!.exec = mockExec

      sendMsg({
        id: 300,
        type: 'migrate',
        data: {
          cacheEntries: [{ key: 'k', entry: { data: 1, timestamp: 1, version: 1 } }],
          metaEntries: [],
        },
      })

      const err = posted.find(m => m.id === 300)
      expect(err!.type).toBe('error')
      expect(err!.message).toBe('disk full')

      // Verify ROLLBACK was called
      const rollbackCall = mockExec.mock.calls.find(
        (c: unknown[]) => c[0] === 'ROLLBACK',
      )
      expect(rollbackCall).toBeDefined()
    })

    it('seedCache responds with error and rolls back on insert failure', () => {
      const origExec2 = mockDbInstance!.exec
      const mockExec2 = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data')) {
          throw new Error('io error')
        }
        return origExec2(sql, opts as Parameters<typeof origExec2>[1])
      })
      mockDbInstance!.exec = mockExec2

      sendMsg({
        id: 301,
        type: 'seedCache',
        entries: [{ key: 'k', entry: { data: 1, timestamp: 1, version: 1 } }],
      })

      const err = posted.find(m => m.id === 301)
      expect(err!.type).toBe('error')
      expect(err!.message).toBe('io error')

      const rollbackCall = mockExec2.mock.calls.find(
        (c: unknown[]) => c[0] === 'ROLLBACK',
      )
      expect(rollbackCall).toBeDefined()
    })
  })
})
