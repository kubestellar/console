import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'kc-auth-token',
  }
})

vi.mock('../analytics', () => ({
  emitSseAuthFailure: vi.fn(),
}))

const mod = await import('../sseClient')
const {
  parseSSEChunk,
  SSE_TIMEOUT_MS,
  SSE_RECONNECT_BASE_MS,
  SSE_RECONNECT_MAX_MS,
  SSE_RECONNECT_BACKOFF_FACTOR,
  SSE_MAX_RECONNECT_ATTEMPTS,
  RESULT_CACHE_TTL_MS,
} = mod.__testables

beforeEach(() => {
  localStorage.clear()
})

describe('parseSSEChunk', () => {
  it('parses a complete cluster_data event', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'event: cluster_data\ndata: {"cluster":"c1","pods":[1,2]}\n\n'
    const remaining = parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('cluster_data')
    expect(JSON.parse(events[0].data).cluster).toBe('c1')
    expect(remaining).toBe('')
  })

  it('defaults event type to "message" when no event line', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'data: hello\n\n'
    parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('message')
    expect(events[0].data).toBe('hello')
  })

  it('returns incomplete data as remaining buffer', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'event: cluster_data\ndata: {"cluster":"c1"}\n\nevent: done\ndata: '
    const remaining = parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(1)
    expect(remaining).toBe('event: done\ndata: ')
  })

  it('parses multiple events in one chunk', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'event: cluster_data\ndata: {"a":1}\n\nevent: done\ndata: {"ok":true}\n\n'
    parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('cluster_data')
    expect(events[1].type).toBe('done')
  })

  it('skips empty parts between double newlines', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = '\n\ndata: test\n\n'
    parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(1)
  })

  it('skips events with no data line', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'event: heartbeat\n\n'
    parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(0)
  })

  it('handles empty buffer', () => {
    const events: Array<{ type: string; data: string }> = []
    const remaining = parseSSEChunk('', (type, data) => {
      events.push({ type, data })
    })
    expect(events).toHaveLength(0)
    expect(remaining).toBe('')
  })

  it('trims whitespace from event type and data', () => {
    const events: Array<{ type: string; data: string }> = []
    const buffer = 'event:  cluster_error  \ndata:  {"error":"fail"}  \n\n'
    parseSSEChunk(buffer, (type, data) => {
      events.push({ type, data })
    })
    expect(events[0].type).toBe('cluster_error')
    expect(JSON.parse(events[0].data).error).toBe('fail')
  })
})

describe('clearSSECache', () => {
  it('does not throw when called', () => {
    expect(() => mod.clearSSECache()).not.toThrow()
  })

  it('can be called multiple times', () => {
    mod.clearSSECache()
    mod.clearSSECache()
    expect(true).toBe(true)
  })
})

describe('constants', () => {
  it('SSE_TIMEOUT_MS is 60 seconds', () => {
    expect(SSE_TIMEOUT_MS).toBe(60_000)
  })

  it('SSE_RECONNECT_BASE_MS is 1 second', () => {
    expect(SSE_RECONNECT_BASE_MS).toBe(1_000)
  })

  it('SSE_RECONNECT_MAX_MS is 30 seconds', () => {
    expect(SSE_RECONNECT_MAX_MS).toBe(30_000)
  })

  it('SSE_RECONNECT_BACKOFF_FACTOR is 2', () => {
    expect(SSE_RECONNECT_BACKOFF_FACTOR).toBe(2)
  })

  it('SSE_MAX_RECONNECT_ATTEMPTS is 5', () => {
    expect(SSE_MAX_RECONNECT_ATTEMPTS).toBe(5)
  })

  it('RESULT_CACHE_TTL_MS is 10 seconds', () => {
    expect(RESULT_CACHE_TTL_MS).toBe(10_000)
  })

  it('reconnect max is greater than base', () => {
    expect(SSE_RECONNECT_MAX_MS).toBeGreaterThan(SSE_RECONNECT_BASE_MS)
  })

  it('timeout is greater than reconnect max', () => {
    expect(SSE_TIMEOUT_MS).toBeGreaterThan(SSE_RECONNECT_MAX_MS)
  })
})
