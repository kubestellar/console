import { describe, it, expect, beforeEach } from 'vitest'

import {
  type CacheEntry,
  type MockDb,
  createMockDb,
  handleClear,
  handleDelete,
  handleGet,
  handleGetMeta,
  handleGetStats,
  handleSet,
  handleSetMeta,
} from './worker.handlers.shared'

describe('Cache Worker handlers', () => {
  let db: MockDb

  beforeEach(() => {
    db = createMockDb()
  })

  describe('handleGet', () => {
    it('returns null when db is null', () => {
      expect(handleGet(null, 'test-key')).toBeNull()
    })

    it('returns null when key does not exist', () => {
      expect(handleGet(db, 'missing-key')).toBeNull()
    })

    it('returns cached entry after handleSet', () => {
      const entry: CacheEntry = { data: { foo: 'bar' }, timestamp: 1000, version: 1 }
      handleSet(db, 'my-key', entry)
      const result = handleGet(db, 'my-key')
      expect(result).not.toBeNull()
      expect(result?.timestamp).toBe(1000)
      expect(result?.version).toBe(1)
    })

    it('correctly deserializes complex nested data', () => {
      const complexData = { arr: [1, 2, { nested: true }], str: 'hello', num: 42 }
      const entry: CacheEntry = { data: complexData, timestamp: 5000, version: 3 }
      handleSet(db, 'complex', entry)
      const result = handleGet(db, 'complex')
      expect(result?.data).toEqual(complexData)
    })
  })

  describe('handleSet', () => {
    it('does nothing when db is null', () => {
      // Should not throw
      handleSet(null, 'key', { data: 'val', timestamp: 0, version: 0 })
    })

    it('calls exec with correct SQL and bind parameters', () => {
      const entry: CacheEntry = { data: [1, 2, 3], timestamp: 999, version: 2 }
      handleSet(db, 'arr-key', entry)
      expect(db.exec).toHaveBeenCalled()
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_data')
      )
      expect(call).toBeDefined()
      expect(call?.[1]?.bind?.[0]).toBe('arr-key')
    })

    it('overwrites existing entry with same key', () => {
      handleSet(db, 'k', { data: 'v1', timestamp: 1, version: 1 })
      handleSet(db, 'k', { data: 'v2', timestamp: 2, version: 2 })
      const result = handleGet(db, 'k')
      expect(result?.version).toBe(2)
    })

    it('stores size_bytes as the length of stringified data', () => {
      const entry: CacheEntry = { data: { test: 'value' }, timestamp: 100, version: 1 }
      handleSet(db, 'size-test', entry)
      const dataStr = JSON.stringify(entry.data)
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_data')
      )
      // The 5th bind parameter is size_bytes = dataStr.length
      expect(call?.[1]?.bind?.[4]).toBe(dataStr.length)
    })
  })

  describe('handleDelete', () => {
    it('does nothing when db is null', () => {
      handleDelete(null, 'key')
    })

    it('removes a stored key', () => {
      handleSet(db, 'del-key', { data: 'x', timestamp: 1, version: 1 })
      expect(handleGet(db, 'del-key')).not.toBeNull()
      handleDelete(db, 'del-key')
      expect(handleGet(db, 'del-key')).toBeNull()
    })

    it('is a no-op when key does not exist', () => {
      // Should not throw
      handleDelete(db, 'nonexistent')
      expect(handleGet(db, 'nonexistent')).toBeNull()
    })
  })

  describe('handleClear', () => {
    it('does nothing when db is null', () => {
      handleClear(null)
    })

    it('removes all entries', () => {
      handleSet(db, 'a', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'b', { data: 2, timestamp: 2, version: 2 })
      handleClear(db)
      expect(handleGet(db, 'a')).toBeNull()
      expect(handleGet(db, 'b')).toBeNull()
    })

    it('also clears meta store', () => {
      handleSetMeta(db, 'metakey', { consecutiveFailures: 3, lastError: 'err' })
      handleClear(db)
      expect(handleGetMeta(db, 'metakey')).toBeNull()
    })

    it('calls DELETE on both cache_data and cache_meta', () => {
      handleClear(db)
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('DELETE FROM cache_data')
      expect(calls).toContain('DELETE FROM cache_meta')
    })
  })

  describe('handleGetStats', () => {
    it('returns empty stats when db is null', () => {
      const stats = handleGetStats(null)
      expect(stats).toEqual({ keys: [], count: 0 })
    })

    it('returns correct key count', () => {
      handleSet(db, 'x', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'y', { data: 2, timestamp: 2, version: 2 })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(2)
      expect(stats.keys).toContain('x')
      expect(stats.keys).toContain('y')
    })

    it('returns empty stats when no data stored', () => {
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
      expect(stats.keys).toEqual([])
    })

    it('count equals keys.length', () => {
      handleSet(db, 'a', { data: 1, timestamp: 1, version: 1 })
      handleSet(db, 'b', { data: 2, timestamp: 2, version: 2 })
      handleSet(db, 'c', { data: 3, timestamp: 3, version: 3 })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(stats.keys.length)
    })
  })
})
