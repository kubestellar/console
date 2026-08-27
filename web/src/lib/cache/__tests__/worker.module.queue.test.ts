import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb } from './worker.module.shared'

/**
 * Integration tests for worker.ts — message queuing before init and rollback behavior.
 */

describe('worker.ts module integration', () => {
  let posted: Array<Record<string, unknown>> = []
  let mockDbInstance: ReturnType<typeof createMockDb> | null = null

  let integrationOpfsMode: 'SAHPool' | 'OpfsDb' | 'none' | 'throws' = 'SAHPool'
  let integrationInitFails = false

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

        return { oo1 }
      }),
    }))
  }

  async function importWorkerFresh(): Promise<void> {
    await import('../worker')
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

    const selfStub: Record<string, unknown> = {
      postMessage: vi.fn((...args: unknown[]) => {
        posted.push(args[0] as Record<string, unknown>)
      }),
      onmessage: null,
    }
    vi.stubGlobal('self', selfStub)
    vi.stubGlobal('postMessage', selfStub.postMessage)

    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

      vi.resetModules()
      await import('../worker')

      await new Promise(resolve => setTimeout(resolve, 10))

      sendMsg({ id: 1, type: 'getStats' })
      sendMsg({ id: 2, type: 'get', key: 'test' })

      const resultsBefore = posted.filter(m => m.type === 'result')
      expect(resultsBefore).toHaveLength(0)

      expect(resolveInit).not.toBeNull()
      resolveInit!()
      await new Promise(resolve => setTimeout(resolve, 50))

      const ready = posted.find(m => m.type === 'ready')
      expect(ready).toBeDefined()

      const results = posted.filter(m => m.type === 'result')
      expect(results.length).toBe(2)
    })

    it('rejects queued messages when init fails', async () => {
      integrationInitFails = true
      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          throw new Error('init boom')
        }),
      }))

      await import('../worker')

      sendMsg({ id: 50, type: 'get', key: 'early' })

      await new Promise(resolve => setTimeout(resolve, 100))

      const rejected = posted.find(
        m => m.type === 'error' && m.id === 50 && (m.message as string).includes('Worker init failed'),
      )
      expect(rejected).toBeDefined()

      const initErr = posted.find(m => m.type === 'init-error')
      expect(initErr).toBeDefined()
    })

    it('drops messages when MAX_PENDING_MESSAGES is exceeded', async () => {
      const MAX_MESSAGES = 1000

      vi.doMock('@sqlite.org/sqlite-wasm', () => ({
        default: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
      }))

      await import('../worker')

      for (let i = 0; i < MAX_MESSAGES; i++) {
        sendMsg({ id: i, type: 'getStats' })
      }

      expect(posted.filter(m => m.type === 'error')).toHaveLength(0)

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
