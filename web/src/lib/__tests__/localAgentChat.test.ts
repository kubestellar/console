import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { localAgentChat } from '../localAgentChat'

vi.mock('../constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://local-agent.test/ws',
}))

vi.mock('../utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn(async (url: string) => url),
}))

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  url: string
  sent: string[] = []
  closed = false

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.(new CloseEvent('close'))
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  emitMalformedMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  emitError() {
    this.onerror?.(new Event('error'))
  }
}

const instances: MockWebSocket[] = []

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('localAgentChat', () => {
  beforeEach(() => {
    instances.length = 0
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid') })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams chunks, then completes on done frame', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    void localAgentChat('hello', {
      agent: 'assistant',
      sessionId: 'session-1',
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    expect(ws.url).toBe('ws://local-agent.test/ws')

    ws.emitOpen()

    const sent = JSON.parse(ws.sent[0] ?? '{}')
    expect(sent.payload).toMatchObject({
      prompt: 'hello',
      sessionId: 'session-1',
      agent: 'assistant',
    })

    ws.emitMessage({
      type: 'stream',
      id: sent.id,
      payload: { content: 'part 1', done: false },
    })
    ws.emitMessage({
      type: 'stream',
      id: sent.id,
      payload: { content: 'part 2', done: true },
    })

    expect(onChunk).toHaveBeenNthCalledWith(1, 'part 1')
    expect(onChunk).toHaveBeenNthCalledWith(2, 'part 2')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(ws.closed).toBe(true)
  })

  it('emits final result when no stream content arrived', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    void localAgentChat('hello', {
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    ws.emitOpen()

    const sent = JSON.parse(ws.sent[0] ?? '{}')
    ws.emitMessage({
      type: 'result',
      id: sent.id,
      payload: { output: 'final answer' },
    })

    expect(onChunk).toHaveBeenCalledWith('final answer')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('emits final result from content payload when no stream content arrived', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    void localAgentChat('hello', {
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    ws.emitOpen()

    const sent = JSON.parse(ws.sent[0] ?? '{}')
    ws.emitMessage({
      type: 'result',
      id: sent.id,
      payload: { content: 'final content' },
    })

    expect(onChunk).toHaveBeenCalledWith('final content')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports connection failure when WebSocket cannot open', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    class ThrowingWebSocket {
      constructor() {
        throw new Error('boom')
      }
    }

    vi.stubGlobal('WebSocket', ThrowingWebSocket)

    await localAgentChat('hello', {
      onChunk,
      onDone,
      onError,
    })

    expect(onError).toHaveBeenCalledWith('Could not connect to local agent.')
    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes early when abort signal is already aborted', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    const controller = new AbortController()
    controller.abort()

    void localAgentChat('hello', {
      signal: controller.signal,
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    expect(ws.closed).toBe(true)
    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('aborts after open when signal fires', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    const controller = new AbortController()

    void localAgentChat('hello', {
      signal: controller.signal,
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    ws.emitOpen()
    controller.abort()

    expect(ws.closed).toBe(true)
    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores malformed frames and reports closed connection before open', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    void localAgentChat('hello', {
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    ws.emitMalformedMessage('not-json')
    ws.close()

    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Could not connect to local agent.')
  })

  it('reports websocket error after open', async () => {
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    void localAgentChat('hello', {
      onChunk,
      onDone,
      onError,
    })

    await flushMicrotasks()

    const ws = instances[0]
    ws.emitOpen()
    ws.emitError()

    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Lost connection to local agent.')
  })
})
