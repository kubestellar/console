import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CacheWorkerRpc } from '../workerRpc'

// Create a mock worker
function createMockWorker() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn(),
    // Simulate sending a message FROM the worker TO the main thread
    simulateMessage(data: unknown) {
      if (worker.onmessage) {
        worker.onmessage({ data } as MessageEvent)
      }
    },
    simulateError(message: string) {
      if (worker.onerror) {
        worker.onerror({ message } as ErrorEvent)
      }
    },
  }
  return worker
}

describe('CacheWorkerRpc', () => {
  let mockWorker: ReturnType<typeof createMockWorker>
  let rpc: CacheWorkerRpc

  beforeEach(() => {
    mockWorker = createMockWorker()
    rpc = new CacheWorkerRpc(mockWorker as unknown as Worker)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('waitForReady', () => {
    it('resolves when worker sends ready signal', async () => {
      const readyPromise = rpc.waitForReady()
      mockWorker.simulateMessage({ id: -1, type: 'ready' })
      await expect(readyPromise).resolves.toBeUndefined()
    })

    it('rejects when worker sends init-error', async () => {
      const readyPromise = rpc.waitForReady()
      mockWorker.simulateMessage({ id: -1, type: 'init-error', message: 'DB init failed' })
      await expect(readyPromise).rejects.toThrow('DB init failed')
    })
  })

  describe('get', () => {
    it('sends get request and resolves with value', async () => {
      const getPromise = rpc.get('test-key')

      // Worker should have received a postMessage
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'get', key: 'test-key' })
      )

      // Get the id from the sent message
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: { data: 'hello', timestamp: 123, version: 1 } })

      const result = await getPromise
      expect(result).toEqual({ data: 'hello', timestamp: 123, version: 1 })
    })

    it('resolves with null when key not found', async () => {
      const getPromise = rpc.get('missing-key')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: null })

      const result = await getPromise
      expect(result).toBeNull()
    })

    it('rejects when worker returns error', async () => {
      const getPromise = rpc.get('bad-key')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'error', message: 'Read failed' })

      await expect(getPromise).rejects.toThrow('Read failed')
    })
  })

  describe('set', () => {
    it('sends set request (fire-and-forget)', () => {
      const entry = { data: 'test', timestamp: Date.now(), version: 1 }
      rpc.set('my-key', entry)

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'set', key: 'my-key', entry })
      )
    })
  })

  describe('deleteKey', () => {
    it('sends delete request (fire-and-forget)', () => {
      rpc.deleteKey('old-key')

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delete', key: 'old-key' })
      )
    })
  })

  describe('clear', () => {
    it('sends clear request and resolves', async () => {
      const clearPromise = rpc.clear()
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: undefined })

      await expect(clearPromise).resolves.toBeUndefined()
    })
  })

  describe('getStats', () => {
    it('returns cache statistics', async () => {
      const statsPromise = rpc.getStats()
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      const TOTAL_KEYS = 3
      mockWorker.simulateMessage({
        id: sentMsg.id,
        type: 'result',
        value: { keys: ['a', 'b', 'c'], count: TOTAL_KEYS },
      })

      const result = await statsPromise
      expect(result.count).toBe(TOTAL_KEYS)
      expect(result.keys).toEqual(['a', 'b', 'c'])
    })
  })

  describe('getMeta', () => {
    it('returns cache metadata for a key', async () => {
      const metaPromise = rpc.getMeta('test-key')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({
        id: sentMsg.id,
        type: 'result',
        value: { consecutiveFailures: 0 },
      })

      const result = await metaPromise
      expect(result).toEqual({ consecutiveFailures: 0 })
    })

    it('returns null for missing key', async () => {
      const metaPromise = rpc.getMeta('missing')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: null })

      const result = await metaPromise
      expect(result).toBeNull()
    })
  })

  describe('setMeta', () => {
    it('sends setMeta request (fire-and-forget)', () => {
      const meta = { consecutiveFailures: 2, lastError: 'timeout' }
      rpc.setMeta('key', meta)

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'setMeta', key: 'key', meta })
      )
    })
  })

  describe('preloadAll', () => {
    it('returns preload result', async () => {
      const preloadPromise = rpc.preloadAll()
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({
        id: sentMsg.id,
        type: 'result',
        value: { meta: {}, cacheKeys: ['a', 'b'] },
      })

      const result = await preloadPromise
      expect(result.cacheKeys).toEqual(['a', 'b'])
    })
  })

  describe('migrate', () => {
    it('sends migration data and resolves', async () => {
      const data = { cacheEntries: [], metaEntries: [] }
      const migratePromise = rpc.migrate(data)
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: undefined })

      await expect(migratePromise).resolves.toBeUndefined()
    })
  })

  describe('seedCache', () => {
    it('sends seed entries and resolves', async () => {
      const entries = [{ key: 'k', entry: { data: 1, timestamp: 0, version: 1 } }]
      const seedPromise = rpc.seedCache(entries)
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: undefined })

      await expect(seedPromise).resolves.toBeUndefined()
    })
  })

  describe('getPreference', () => {
    it('returns preference value', async () => {
      const prefPromise = rpc.getPreference('theme')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: 'dark' })

      const result = await prefPromise
      expect(result).toBe('dark')
    })

    it('returns null for missing preference', async () => {
      const prefPromise = rpc.getPreference('missing')
      const sentMsg = mockWorker.postMessage.mock.calls[0][0]
      mockWorker.simulateMessage({ id: sentMsg.id, type: 'result', value: null })

      const result = await prefPromise
      expect(result).toBeNull()
    })
  })

  describe('setPreference', () => {
    it('sends setPreference request (fire-and-forget)', () => {
      rpc.setPreference('theme', 'dark')

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'setPreference', key: 'theme', value: 'dark' })
      )
    })
  })

  describe('terminate', () => {
    it('terminates the worker', () => {
      rpc.terminate()
      expect(mockWorker.terminate).toHaveBeenCalled()
    })

    it('rejects all pending calls on termination', async () => {
      const getPromise = rpc.get('key')
      rpc.terminate()

      await expect(getPromise).rejects.toThrow('Worker terminated')
    })

    it('rejects multiple pending calls', async () => {
      const promise1 = rpc.get('key1')
      const promise2 = rpc.getStats()
      const promise3 = rpc.clear()

      rpc.terminate()

      await expect(promise1).rejects.toThrow('Worker terminated')
      await expect(promise2).rejects.toThrow('Worker terminated')
      await expect(promise3).rejects.toThrow('Worker terminated')
    })
  })

  describe('worker error logging', () => {
    it('logs expected OPFS fallback worker errors at debug level', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockWorker.simulateError('missing SharedArrayBuffer/Atomics support')

      expect(debugSpy).toHaveBeenCalledWith(
        '[CacheWorkerRpc] Worker falling back to IndexedDB:',
        'missing SharedArrayBuffer/Atomics support'
      )
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('keeps unexpected worker errors at error level', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockWorker.simulateError('worker crashed')

      expect(errorSpy).toHaveBeenCalledWith('[CacheWorkerRpc] Worker error:', 'worker crashed')
      expect(debugSpy).not.toHaveBeenCalled()
    })
  })

  describe('message routing', () => {
    it('ignores messages with unknown ids', () => {
      // Should not throw
      mockWorker.simulateMessage({ id: 999, type: 'result', value: null })
    })

    it('assigns unique IDs to each request', () => {
      rpc.set('a', { data: 1, timestamp: 0, version: 1 })
      rpc.set('b', { data: 2, timestamp: 0, version: 1 })
      rpc.set('c', { data: 3, timestamp: 0, version: 1 })

      const ids = mockWorker.postMessage.mock.calls.map((c: unknown[]) => (c[0] as { id: number }).id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})
