import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb, MAX_PENDING_MESSAGES } from './worker.module.shared'

/**
 * Message queuing tests for worker.module.
 * Tests queuing behavior before database initialization completes.
 */

describe('self.onmessage — queuing before init', () => {
  let posted: Array<Record<string, unknown>> = []
  let mockDbInstance: ReturnType<typeof createMockDb> | null = null

  let integrationInitFails = false

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
    vi.doMock('@sqlite.org/sqlite-wasm', () => ({
      default: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
    }))

    await import('../worker')

    for (let i = 0; i < MAX_PENDING_MESSAGES; i++) {
      sendMsg({ id: i, type: 'getStats' })
    }

    expect(posted.filter(m => m.type === 'error')).toHaveLength(0)

    sendMsg({ id: MAX_PENDING_MESSAGES, type: 'get', key: 'overflow' })

    const overflow = posted.find(
      m => m.type === 'error' && m.id === MAX_PENDING_MESSAGES,
    )
    expect(overflow).toBeDefined()
    expect(overflow!.message).toContain('queue is full')
  })

  it('processes messages directly once initComplete is set after failure', async () => {
    integrationInitFails = true
    vi.doMock('@sqlite.org/sqlite-wasm', () => ({
      default: vi.fn().mockImplementation(async () => {
        throw new Error('SQLite WASM init failed')
      }),
    }))

    await import('../worker')
    await new Promise(resolve => setTimeout(resolve, 50))
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
