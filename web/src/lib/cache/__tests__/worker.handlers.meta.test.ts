import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  type CacheMeta,
  type MockDb,
  createMockDb,
  handleGet,
  handleGetMeta,
  handleGetPreference,
  handleGetStats,
  handleMigrate,
  handlePreloadAll,
  handleSeedCache,
  handleSet,
  handleSetMeta,
  handleSetPreference,
} from './worker.handlers.shared'

describe('Cache Worker handlers', () => {
  let db: MockDb

  beforeEach(() => {
    db = createMockDb()
  })

  describe('handleGetMeta / handleSetMeta', () => {
    it('returns null for missing meta when db is null', () => {
      expect(handleGetMeta(null, 'any')).toBeNull()
    })

    it('does nothing when setting meta with null db', () => {
      handleSetMeta(null, 'k', { consecutiveFailures: 0 })
    })

    it('returns null for non-existent meta key', () => {
      expect(handleGetMeta(db, 'nonexistent')).toBeNull()
    })

    it('stores and retrieves meta data', () => {
      const meta: CacheMeta = {
        consecutiveFailures: 5,
        lastError: 'timeout',
        lastSuccessfulRefresh: 1700000000,
      }
      handleSetMeta(db, 'cluster-data', meta)
      const result = handleGetMeta(db, 'cluster-data')
      expect(result).not.toBeNull()
      expect(result!.consecutiveFailures).toBe(5)
      expect(result!.lastError).toBe('timeout')
      expect(result!.lastSuccessfulRefresh).toBe(1700000000)
    })

    it('handles meta with undefined optional fields', () => {
      const meta: CacheMeta = { consecutiveFailures: 0 }
      handleSetMeta(db, 'clean-key', meta)
      const result = handleGetMeta(db, 'clean-key')
      expect(result).not.toBeNull()
      expect(result!.consecutiveFailures).toBe(0)
      // lastError and lastSuccessfulRefresh should be undefined when stored as null
      expect(result!.lastError).toBeUndefined()
      expect(result!.lastSuccessfulRefresh).toBeUndefined()
    })

    it('overwrites existing meta', () => {
      handleSetMeta(db, 'k', { consecutiveFailures: 1, lastError: 'first' })
      handleSetMeta(db, 'k', { consecutiveFailures: 2, lastError: 'second' })
      const result = handleGetMeta(db, 'k')
      expect(result!.consecutiveFailures).toBe(2)
      expect(result!.lastError).toBe('second')
    })

    it('uses nullish coalescing for optional meta fields in bind params', () => {
      const meta: CacheMeta = { consecutiveFailures: 3 }
      handleSetMeta(db, 'test', meta)
      const call = db.exec.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO cache_meta')
      )
      // lastError ?? null => null, lastSuccessfulRefresh ?? null => null
      expect(call?.[1]?.bind?.[2]).toBeNull()
      expect(call?.[1]?.bind?.[3]).toBeNull()
    })
  })

  describe('handlePreloadAll', () => {
    it('returns empty result when db is null', () => {
      const result = handlePreloadAll(null)
      expect(result).toEqual({ meta: {}, cacheKeys: [] })
    })

    it('returns empty result when no data stored', () => {
      const result = handlePreloadAll(db)
      expect(result.meta).toEqual({})
      expect(result.cacheKeys).toEqual([])
    })

    it('loads both meta and cache keys', () => {
      handleSet(db, 'key1', { data: 'data1', timestamp: 100, version: 1 })
      handleSet(db, 'key2', { data: 'data2', timestamp: 200, version: 2 })
      handleSetMeta(db, 'key1', { consecutiveFailures: 1, lastError: 'err1' })
      handleSetMeta(db, 'key2', { consecutiveFailures: 0, lastSuccessfulRefresh: 300 })

      const result = handlePreloadAll(db)
      expect(result.cacheKeys).toContain('key1')
      expect(result.cacheKeys).toContain('key2')
      expect(result.cacheKeys.length).toBe(2)
      expect(result.meta['key1'].consecutiveFailures).toBe(1)
      expect(result.meta['key1'].lastError).toBe('err1')
      expect(result.meta['key2'].consecutiveFailures).toBe(0)
      expect(result.meta['key2'].lastSuccessfulRefresh).toBe(300)
    })

    it('returns cache keys even when no meta exists', () => {
      handleSet(db, 'keyonly', { data: 'val', timestamp: 50, version: 1 })
      const result = handlePreloadAll(db)
      expect(result.cacheKeys).toContain('keyonly')
      expect(Object.keys(result.meta).length).toBe(0)
    })

    it('returns meta even when no cache data exists', () => {
      handleSetMeta(db, 'orphan', { consecutiveFailures: 7, lastError: 'lost' })
      const result = handlePreloadAll(db)
      expect(result.cacheKeys.length).toBe(0)
      expect(result.meta['orphan'].consecutiveFailures).toBe(7)
    })
  })

  describe('handleMigrate', () => {
    it('does nothing when db is null', () => {
      handleMigrate(null, { cacheEntries: [], metaEntries: [] })
    })

    it('migrates cache entries and meta entries atomically', () => {
      const data = {
        cacheEntries: [
          { key: 'mig1', entry: { data: 'v1', timestamp: 100, version: 1 } },
          { key: 'mig2', entry: { data: 'v2', timestamp: 200, version: 2 } },
        ],
        metaEntries: [
          { key: 'mig1', meta: { consecutiveFailures: 0 } as CacheMeta },
          { key: 'mig2', meta: { consecutiveFailures: 3, lastError: 'err' } as CacheMeta },
        ],
      }
      handleMigrate(db, data)

      const entry1 = handleGet(db, 'mig1')
      expect(entry1).not.toBeNull()
      expect(entry1!.timestamp).toBe(100)

      const entry2 = handleGet(db, 'mig2')
      expect(entry2).not.toBeNull()
      expect(entry2!.version).toBe(2)

      const meta2 = handleGetMeta(db, 'mig2')
      expect(meta2!.consecutiveFailures).toBe(3)
    })

    it('calls BEGIN TRANSACTION and COMMIT', () => {
      handleMigrate(db, {
        cacheEntries: [{ key: 'k', entry: { data: 'x', timestamp: 1, version: 1 } }],
        metaEntries: [],
      })
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('BEGIN TRANSACTION')
      expect(calls).toContain('COMMIT')
      expect(calls).not.toContain('ROLLBACK')
    })

    it('rolls back on error', () => {
      // Create a db where INSERT throws after BEGIN
      const brokenDb = createMockDb()
      const originalExec = brokenDb.exec
      let callCount = 0
      brokenDb.exec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        callCount++
        // Let BEGIN pass, then throw on INSERT
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data') && callCount > 1) {
          throw new Error('disk full')
        }
        return originalExec(sql, opts as Parameters<typeof originalExec>[1])
      }) as typeof brokenDb.exec

      expect(() => {
        handleMigrate(brokenDb, {
          cacheEntries: [{ key: 'k', entry: { data: 'x', timestamp: 1, version: 1 } }],
          metaEntries: [],
        })
      }).toThrow('disk full')

      const calls = brokenDb.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('ROLLBACK')
    })

    it('handles empty migration data', () => {
      handleMigrate(db, { cacheEntries: [], metaEntries: [] })
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
    })
  })

  describe('handleSeedCache', () => {
    it('does nothing when db is null', () => {
      handleSeedCache(null, [])
    })

    it('seeds multiple cache entries in a transaction', () => {
      const entries = [
        { key: 's1', entry: { data: 'seed1', timestamp: 10, version: 1 } },
        { key: 's2', entry: { data: 'seed2', timestamp: 20, version: 2 } },
        { key: 's3', entry: { data: 'seed3', timestamp: 30, version: 3 } },
      ]
      handleSeedCache(db, entries)

      expect(handleGet(db, 's1')?.data).toBe('seed1')
      expect(handleGet(db, 's2')?.data).toBe('seed2')
      expect(handleGet(db, 's3')?.data).toBe('seed3')
    })

    it('calls BEGIN TRANSACTION and COMMIT', () => {
      handleSeedCache(db, [
        { key: 'k', entry: { data: 'v', timestamp: 1, version: 1 } },
      ])
      const calls = db.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('BEGIN TRANSACTION')
      expect(calls).toContain('COMMIT')
    })

    it('rolls back on error', () => {
      const brokenDb = createMockDb()
      const originalExec = brokenDb.exec
      let callCount = 0
      brokenDb.exec = vi.fn((sql: string, opts?: Record<string, unknown>) => {
        callCount++
        if (typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO cache_data') && callCount > 1) {
          throw new Error('io error')
        }
        return originalExec(sql, opts as Parameters<typeof originalExec>[1])
      }) as typeof brokenDb.exec

      expect(() => {
        handleSeedCache(brokenDb, [
          { key: 'k', entry: { data: 'v', timestamp: 1, version: 1 } },
        ])
      }).toThrow('io error')

      const calls = brokenDb.exec.mock.calls.map(c => c[0])
      expect(calls).toContain('ROLLBACK')
    })

    it('handles empty entries array', () => {
      handleSeedCache(db, [])
      const stats = handleGetStats(db)
      expect(stats.count).toBe(0)
    })
  })

  describe('handleGetPreference / handleSetPreference', () => {
    it('returns null for missing preference when db is null', () => {
      expect(handleGetPreference(null, 'theme')).toBeNull()
    })

    it('returns null for non-existent preference', () => {
      expect(handleGetPreference(db, 'nonexistent')).toBeNull()
    })

    it('stores and retrieves a preference', () => {
      handleSetPreference(db, 'theme', 'dark')
      expect(handleGetPreference(db, 'theme')).toBe('dark')
    })

    it('overwrites an existing preference', () => {
      handleSetPreference(db, 'lang', 'en')
      handleSetPreference(db, 'lang', 'fr')
      expect(handleGetPreference(db, 'lang')).toBe('fr')
    })

    it('does nothing when setting preference with null db', () => {
      handleSetPreference(null, 'k', 'v')
    })

    it('stores multiple independent preferences', () => {
      handleSetPreference(db, 'theme', 'light')
      handleSetPreference(db, 'lang', 'de')
      handleSetPreference(db, 'font-size', '14')
      expect(handleGetPreference(db, 'theme')).toBe('light')
      expect(handleGetPreference(db, 'lang')).toBe('de')
      expect(handleGetPreference(db, 'font-size')).toBe('14')
    })
  })
})
