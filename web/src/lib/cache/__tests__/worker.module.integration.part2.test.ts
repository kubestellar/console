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

// ── Integration Tests (continued) ──

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
