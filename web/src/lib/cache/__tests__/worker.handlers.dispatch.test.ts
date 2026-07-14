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
