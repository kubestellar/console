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

// ── Integration Tests ──

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
