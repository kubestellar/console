import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb } from './worker.module.shared'

/**
 * Database initialization tests for worker.module.
 * Tests the SQLite WASM init flow, OPFS fallback logic, and error handling.
 */

describe('worker.ts module integration — initDatabase', () => {
  let posted: Array<Record<string, unknown>> = []
  let mockDbInstance: ReturnType<typeof createMockDb> | null = null

  let integrationOpfsMode: 'SAHPool' | 'OpfsDb' | 'none' | 'throws' = 'SAHPool'
  let integrationInitFails = false
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

  beforeEach(() => {
    vi.resetModules()
    posted = []
    mockDbInstance = null
    integrationOpfsMode = 'SAHPool'
    integrationInitFails = false
    integrationWalFails = false

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
})
