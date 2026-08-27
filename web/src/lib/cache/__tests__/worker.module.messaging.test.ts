import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb } from './worker.module.helpers'

describe('worker.ts module integration — post-init messaging', () => {
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
})
