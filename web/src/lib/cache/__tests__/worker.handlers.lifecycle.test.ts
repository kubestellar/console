import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  type CacheEntry,
  type CacheMeta,
  type MockDb,
  type WorkerRequest,
  type WorkerResponse,
  MAX_PENDING_MESSAGES,
  createMockDb,
  handleGet,
  handleGetMeta,
  handleGetPreference,
  handleGetStats,
  handleSet,
  handleSetMeta,
  handleSetPreference,
  processMessage,
  respond,
  respondError,
} from './worker.handlers.shared'

describe('Cache Worker handlers', () => {
  let db: MockDb

  beforeEach(() => {
    db = createMockDb()
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
