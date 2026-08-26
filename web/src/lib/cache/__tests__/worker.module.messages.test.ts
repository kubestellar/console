import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockDb, processMessage, type MockDb } from './worker.module.shared'

/**
 * Message processing tests for worker.module.
 * Tests handling of all cache operations (get, set, delete, clear, stats, meta, preferences).
 */

describe('self.onmessage — post-init message processing', () => {
  let mockDbInstance: MockDb

  beforeEach(() => {
    mockDbInstance = createMockDb()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('handles get for missing key', () => {
    const posted: Array<Record<string, unknown>> = []
    processMessage(mockDbInstance, { id: 1, type: 'get', key: 'nonexistent' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 1, type: 'result', value: null })
  })

  it('handles set then get round-trip', () => {
    const posted: Array<Record<string, unknown>> = []
    const entry = { data: 'test', timestamp: 1000, version: 1 }

    processMessage(mockDbInstance, { id: 1, type: 'set', key: 'k1', entry }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 1, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 2, type: 'result', value: entry })
  })

  it('handles delete', () => {
    const posted: Array<Record<string, unknown>> = []
    const entry = { data: 'test', timestamp: 1000, version: 1 }

    processMessage(mockDbInstance, { id: 1, type: 'set', key: 'k1', entry }, (msg) => {
      posted.push(msg)
    })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'delete', key: 'k1' }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 2, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 3, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 3, type: 'result', value: null })
  })

  it('handles clear', () => {
    const posted: Array<Record<string, unknown>> = []
    const entry = { data: 'test', timestamp: 1000, version: 1 }

    processMessage(mockDbInstance, { id: 1, type: 'set', key: 'k1', entry }, (msg) => {
      posted.push(msg)
    })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'clear' }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 2, type: 'result', value: undefined })
  })

  it('handles getStats', () => {
    const posted: Array<Record<string, unknown>> = []
    const entry = { data: 'test', timestamp: 1000, version: 1 }

    processMessage(mockDbInstance, { id: 1, type: 'set', key: 'k1', entry }, (msg) => {
      posted.push(msg)
    })
    processMessage(mockDbInstance, { id: 2, type: 'set', key: 'k2', entry }, (msg) => {
      posted.push(msg)
    })

    posted.length = 0
    processMessage(mockDbInstance, { id: 3, type: 'getStats' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({
      id: 3,
      type: 'result',
      value: { keys: ['k1', 'k2'], count: 2 },
    })
  })

  it('handles getMeta for missing key', () => {
    const posted: Array<Record<string, unknown>> = []
    processMessage(mockDbInstance, { id: 1, type: 'getMeta', key: 'nonexistent' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 1, type: 'result', value: null })
  })

  it('handles setMeta', () => {
    const posted: Array<Record<string, unknown>> = []
    const meta = { consecutiveFailures: 2, lastError: 'network error' }

    processMessage(mockDbInstance, { id: 1, type: 'setMeta', key: 'k1', meta }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 1, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'getMeta', key: 'k1' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 2, type: 'result', value: meta })
  })

  it('handles preloadAll', () => {
    const posted: Array<Record<string, unknown>> = []
    const entry = { data: 'test', timestamp: 1000, version: 1 }
    const meta = { consecutiveFailures: 1 }

    processMessage(mockDbInstance, { id: 1, type: 'set', key: 'k1', entry }, (msg) => {
      posted.push(msg)
    })
    processMessage(mockDbInstance, { id: 2, type: 'setMeta', key: 'k1', meta }, (msg) => {
      posted.push(msg)
    })

    posted.length = 0
    processMessage(mockDbInstance, { id: 3, type: 'preloadAll' }, (msg) => {
      posted.push(msg)
    })

    const result = posted[0].value as Record<string, unknown>
    expect(result.cacheKeys).toEqual(['k1'])
    expect(result.meta).toBeDefined()
  })

  it('handles migrate', () => {
    const posted: Array<Record<string, unknown>> = []
    const cacheEntries = [{ key: 'k1', entry: { data: 'test', timestamp: 1000, version: 1 } }]

    processMessage(
      mockDbInstance,
      { id: 1, type: 'migrate', data: { cacheEntries, metaEntries: [] } },
      (msg) => {
        posted.push(msg)
      }
    )

    expect(posted).toContainEqual({ id: 1, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })
    expect(posted[0].value).toEqual({ data: 'test', timestamp: 1000, version: 1 })
  })

  it('handles seedCache', () => {
    const posted: Array<Record<string, unknown>> = []
    const entries = [{ key: 'k1', entry: { data: 'seed', timestamp: 2000, version: 1 } }]

    processMessage(mockDbInstance, { id: 1, type: 'seedCache', entries }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 1, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })
    expect(posted[0].value).toEqual({ data: 'seed', timestamp: 2000, version: 1 })
  })

  it('handles getPreference for missing key', () => {
    const posted: Array<Record<string, unknown>> = []
    processMessage(mockDbInstance, { id: 1, type: 'getPreference', key: 'nonexistent' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 1, type: 'result', value: null })
  })

  it('handles setPreference', () => {
    const posted: Array<Record<string, unknown>> = []

    processMessage(mockDbInstance, { id: 1, type: 'setPreference', key: 'theme', value: 'dark' }, (msg) => {
      posted.push(msg)
    })
    expect(posted).toContainEqual({ id: 1, type: 'result', value: undefined })

    posted.length = 0
    processMessage(mockDbInstance, { id: 2, type: 'getPreference', key: 'theme' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({ id: 2, type: 'result', value: 'dark' })
  })

  it('returns error for unknown message type', () => {
    const posted: Array<Record<string, unknown>> = []
    processMessage(
      mockDbInstance,
      { id: 1, type: 'unknown' } as unknown as Parameters<typeof processMessage>[1],
      (msg) => {
        posted.push(msg)
      }
    )

    expect(posted).toContainEqual({
      id: 1,
      type: 'error',
      message: 'Unknown message type: unknown',
    })
  })

  it('returns error when handler throws', () => {
    const posted: Array<Record<string, unknown>> = []
    const badDb = { ...mockDbInstance, exec: vi.fn(() => { throw new Error('exec failed') }) }

    processMessage(badDb as MockDb, { id: 1, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({
      id: 1,
      type: 'error',
      message: 'exec failed',
    })
  })

  it('converts non-Error thrown values to string', () => {
    const posted: Array<Record<string, unknown>> = []
    const badDb = { ...mockDbInstance, exec: vi.fn(() => { throw 'string error' }) }

    processMessage(badDb as MockDb, { id: 1, type: 'get', key: 'k1' }, (msg) => {
      posted.push(msg)
    })

    expect(posted).toContainEqual({
      id: 1,
      type: 'error',
      message: 'string error',
    })
  })
})
