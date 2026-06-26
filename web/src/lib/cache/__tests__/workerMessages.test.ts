import { describe, it, expect } from 'vitest'
import type {
  CacheEntry,
  CacheMeta,
  WorkerRequest,
  WorkerResponse,
  PreloadResult,
  MigrationPayload,
} from '../workerMessages'

describe('cache/workerMessages', () => {
  describe('CacheEntry', () => {
    it('can create a valid cache entry', () => {
      const entry: CacheEntry<string[]> = {
        data: ['pod-1', 'pod-2'],
        timestamp: Date.now(),
        version: 1,
      }
      expect(entry.data).toHaveLength(2)
      expect(entry.timestamp).toBeGreaterThan(0)
      expect(entry.version).toBe(1)
    })

    it('supports generic type parameter', () => {
      const entry: CacheEntry<{ count: number }> = {
        data: { count: 42 },
        timestamp: Date.now(),
        version: 2,
      }
      expect(entry.data.count).toBe(42)
    })

    it('defaults to unknown type', () => {
      const entry: CacheEntry = {
        data: 'anything',
        timestamp: 0,
        version: 1,
      }
      expect(entry.data).toBe('anything')
    })
  })

  describe('CacheMeta', () => {
    it('tracks consecutive failures', () => {
      const meta: CacheMeta = {
        consecutiveFailures: 3,
        lastError: 'timeout',
        lastSuccessfulRefresh: Date.now() - 60000,
      }
      expect(meta.consecutiveFailures).toBe(3)
      expect(meta.lastError).toBe('timeout')
    })

    it('supports zero failures (healthy state)', () => {
      const meta: CacheMeta = {
        consecutiveFailures: 0,
      }
      expect(meta.consecutiveFailures).toBe(0)
      expect(meta.lastError).toBeUndefined()
    })
  })

  describe('WorkerRequest types', () => {
    it('supports get request', () => {
      const req: WorkerRequest = { id: 1, type: 'get', key: 'pods:all' }
      expect(req.type).toBe('get')
    })

    it('supports set request with entry', () => {
      const req: WorkerRequest = {
        id: 2,
        type: 'set',
        key: 'pods:all',
        entry: { data: [], timestamp: Date.now(), version: 1 },
      }
      expect(req.type).toBe('set')
    })

    it('supports delete request', () => {
      const req: WorkerRequest = { id: 3, type: 'delete', key: 'old-key' }
      expect(req.type).toBe('delete')
    })

    it('supports clear request', () => {
      const req: WorkerRequest = { id: 4, type: 'clear' }
      expect(req.type).toBe('clear')
    })

    it('supports getStats request', () => {
      const req: WorkerRequest = { id: 5, type: 'getStats' }
      expect(req.type).toBe('getStats')
    })

    it('supports getMeta request', () => {
      const req: WorkerRequest = { id: 6, type: 'getMeta', key: 'pods:all' }
      expect(req.type).toBe('getMeta')
    })

    it('supports setMeta request', () => {
      const req: WorkerRequest = {
        id: 7,
        type: 'setMeta',
        key: 'pods:all',
        meta: { consecutiveFailures: 1, lastError: 'network error' },
      }
      expect(req.type).toBe('setMeta')
    })

    it('supports preloadAll request', () => {
      const req: WorkerRequest = { id: 8, type: 'preloadAll' }
      expect(req.type).toBe('preloadAll')
    })

    it('supports seedCache request', () => {
      const req: WorkerRequest = {
        id: 10,
        type: 'seedCache',
        entries: [{ key: 'test', entry: { data: null, timestamp: 0, version: 1 } }],
      }
      expect(req.type).toBe('seedCache')
    })
  })

  describe('WorkerResponse types', () => {
    it('supports result response', () => {
      const resp: WorkerResponse = { id: 1, type: 'result', value: { count: 5 } }
      expect(resp.type).toBe('result')
    })

    it('supports error response', () => {
      const resp: WorkerResponse = { id: 2, type: 'error', message: 'DB locked' }
      expect(resp.type).toBe('error')
    })

    it('supports ready signal with id -1', () => {
      const resp: WorkerResponse = { id: -1, type: 'ready' }
      expect(resp.id).toBe(-1)
      expect(resp.type).toBe('ready')
    })

    it('supports init-error signal with id -1', () => {
      const resp: WorkerResponse = { id: -1, type: 'init-error', message: 'WASM failed' }
      expect(resp.id).toBe(-1)
    })
  })

  describe('PreloadResult', () => {
    it('contains meta and cacheKeys', () => {
      const result: PreloadResult = {
        meta: {
          'pods:all': { consecutiveFailures: 0 },
        },
        cacheKeys: ['pods:all', 'events:all'],
      }
      expect(result.cacheKeys).toHaveLength(2)
      expect(result.meta['pods:all'].consecutiveFailures).toBe(0)
    })
  })

  describe('MigrationPayload', () => {
    it('contains both cache and meta entries', () => {
      const payload: MigrationPayload = {
        cacheEntries: [
          { key: 'pods', entry: { data: [], timestamp: Date.now(), version: 1 } },
        ],
        metaEntries: [
          { key: 'pods', meta: { consecutiveFailures: 0 } },
        ],
      }
      expect(payload.cacheEntries).toHaveLength(1)
      expect(payload.metaEntries).toHaveLength(1)
    })
  })
})
