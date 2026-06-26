/**
 * Unit tests for lib/cache/cacheStats.ts
 *
 * Covers:
 * - clearAllCaches: clears storage, preloadedMeta, sessionSnapshots, localStorage meta keys, registry
 * - getCacheStats: aggregates from cacheStorage.getStats + cacheRegistry.size
 * - invalidateCache: clears store (if registered) + storage + preloadedMeta
 * - resetFailuresForCluster: resets stores by cluster name or :all: key
 * - resetAllCacheFailures: resets all registered stores
 * - prefetchCache: creates/retrieves cache and fetches
 * - preloadCacheFromStorage: skips when count=0, hydrates stores from entries
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────

const mockPreloadedMetaMap = new Map<string, unknown>()
const mockClearSessionSnapshots = vi.fn()
const mockCacheStorageClear = vi.fn().mockResolvedValue(undefined)
const mockCacheStorageDelete = vi.fn().mockResolvedValue(undefined)
let mockCacheStorageStats: { keys: string[]; count: number } = { keys: [], count: 0 }
const mockCacheStorageGet = vi.fn().mockResolvedValue(null)

vi.mock('../cacheStorage', () => ({
  META_PREFIX: 'kc_meta:',
  preloadedMetaMap: mockPreloadedMetaMap,
  clearSessionSnapshots: mockClearSessionSnapshots,
  cacheStorage: {
    clear: () => mockCacheStorageClear(),
    delete: (key: string) => mockCacheStorageDelete(key),
    getStats: () => Promise.resolve(mockCacheStorageStats),
    get: (key: string) => mockCacheStorageGet(key),
  },
}))

// Track individual store mock state
interface MockStore {
  clearCalled: boolean
  resetFailuresCalled: boolean
  hydrateFromEntryCalled: boolean
  hydrateFromEntryArg: unknown
}

const mockStores = new Map<string, MockStore & { key: string }>()

function createMockStore(key: string) {
  const store: MockStore & { key: string } = {
    key,
    clearCalled: false,
    resetFailuresCalled: false,
    hydrateFromEntryCalled: false,
    hydrateFromEntryArg: undefined,
    clear: vi.fn(async () => { store.clearCalled = true }),
    resetFailures: vi.fn(() => { store.resetFailuresCalled = true }),
    hydrateFromEntry: vi.fn((entry: unknown) => {
      store.hydrateFromEntryCalled = true
      store.hydrateFromEntryArg = entry
    }),
    fetch: vi.fn(async (fetcher: () => unknown) => { await fetcher() }),
  }
  return store
}

const mockCacheRegistry = new Map<string, ReturnType<typeof createMockStore>>()
const mockGetOrCreateCache = vi.fn((key: string) => {
  if (!mockCacheRegistry.has(key)) {
    mockCacheRegistry.set(key, createMockStore(key))
  }
  return mockCacheRegistry.get(key)!
})

vi.mock('../cacheCore', () => ({
  CacheStore: class {},
  cacheRegistry: mockCacheRegistry,
  getOrCreateCache: (key: string, initialData: unknown, persist: boolean) =>
    mockGetOrCreateCache(key, initialData, persist),
}))

// ── Setup ──────────────────────────────────────────────────────────

type StatsModule = typeof import('../cacheStats')

async function freshImport(): Promise<StatsModule> {
  vi.resetModules()
  return import('../cacheStats') as Promise<StatsModule>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPreloadedMetaMap.clear()
  mockCacheRegistry.clear()
  mockStores.clear()
  mockCacheStorageStats = { keys: [], count: 0 }
  localStorage.clear()
})

// ============================================================================
// clearAllCaches
// ============================================================================

describe('clearAllCaches', () => {
  it('calls cacheStorage.clear()', async () => {
    const { clearAllCaches } = await freshImport()
    await clearAllCaches()
    expect(mockCacheStorageClear).toHaveBeenCalledOnce()
  })

  it('clears preloadedMetaMap', async () => {
    mockPreloadedMetaMap.set('test-key', { age: 0 })
    const { clearAllCaches } = await freshImport()
    await clearAllCaches()
    expect(mockPreloadedMetaMap.size).toBe(0)
  })

  it('calls clearSessionSnapshots', async () => {
    const { clearAllCaches } = await freshImport()
    await clearAllCaches()
    expect(mockClearSessionSnapshots).toHaveBeenCalledOnce()
  })

  it('removes localStorage keys with META_PREFIX', async () => {
    localStorage.setItem('kc_meta:pods', 'meta-data')
    localStorage.setItem('kc_meta:nodes', 'meta-data-2')
    localStorage.setItem('other-key', 'should-stay')
    const { clearAllCaches } = await freshImport()
    await clearAllCaches()
    expect(localStorage.getItem('kc_meta:pods')).toBeNull()
    expect(localStorage.getItem('kc_meta:nodes')).toBeNull()
    expect(localStorage.getItem('other-key')).toBe('should-stay')
  })

  it('clears cacheRegistry', async () => {
    mockCacheRegistry.set('my-cache', createMockStore('my-cache'))
    const { clearAllCaches } = await freshImport()
    await clearAllCaches()
    expect(mockCacheRegistry.size).toBe(0)
  })
})

// ============================================================================
// getCacheStats
// ============================================================================

describe('getCacheStats', () => {
  it('returns stats from cacheStorage plus registry entry count', async () => {
    mockCacheStorageStats = { keys: ['key1', 'key2'], count: 2 }
    mockCacheRegistry.set('key1', createMockStore('key1'))
    mockCacheRegistry.set('key2', createMockStore('key2'))
    mockCacheRegistry.set('key3', createMockStore('key3'))
    const { getCacheStats } = await freshImport()
    const stats = await getCacheStats()
    expect(stats.keys).toEqual(['key1', 'key2'])
    expect(stats.count).toBe(2)
    expect(stats.entries).toBe(3) // cacheRegistry.size
  })

  it('returns zeros when empty', async () => {
    const { getCacheStats } = await freshImport()
    const stats = await getCacheStats()
    expect(stats.count).toBe(0)
    expect(stats.entries).toBe(0)
    expect(stats.keys).toEqual([])
  })
})

// ============================================================================
// invalidateCache
// ============================================================================

describe('invalidateCache', () => {
  it('calls store.clear() when key is registered', async () => {
    const store = createMockStore('my-key')
    mockCacheRegistry.set('my-key', store)
    const { invalidateCache } = await freshImport()
    await invalidateCache('my-key')
    expect(store.clearCalled).toBe(true)
  })

  it('does not throw when key is not registered', async () => {
    const { invalidateCache } = await freshImport()
    await expect(invalidateCache('unregistered-key')).resolves.toBeUndefined()
  })

  it('calls cacheStorage.delete with key', async () => {
    const { invalidateCache } = await freshImport()
    await invalidateCache('some-key')
    expect(mockCacheStorageDelete).toHaveBeenCalledWith('some-key')
  })

  it('removes key from preloadedMetaMap', async () => {
    mockPreloadedMetaMap.set('stale-key', { age: 0 })
    const { invalidateCache } = await freshImport()
    await invalidateCache('stale-key')
    expect(mockPreloadedMetaMap.has('stale-key')).toBe(false)
  })
})

// ============================================================================
// resetFailuresForCluster
// ============================================================================

describe('resetFailuresForCluster', () => {
  it('resets stores whose key includes the cluster name', async () => {
    const store1 = createMockStore('nodes:cluster-a:v1')
    const store2 = createMockStore('pods:cluster-b:v1')
    mockCacheRegistry.set('nodes:cluster-a:v1', store1)
    mockCacheRegistry.set('pods:cluster-b:v1', store2)
    const { resetFailuresForCluster } = await freshImport()
    const count = resetFailuresForCluster('cluster-a')
    expect(store1.resetFailuresCalled).toBe(true)
    expect(store2.resetFailuresCalled).toBe(false)
    expect(count).toBe(1)
  })

  it('resets stores with :all: key pattern', async () => {
    const storeAll = createMockStore('nodes:all:v1')
    const storeOther = createMockStore('pods:cluster-c:v1')
    mockCacheRegistry.set('nodes:all:v1', storeAll)
    mockCacheRegistry.set('pods:cluster-c:v1', storeOther)
    const { resetFailuresForCluster } = await freshImport()
    const count = resetFailuresForCluster('cluster-x')
    expect(storeAll.resetFailuresCalled).toBe(true)  // matches :all:
    expect(storeOther.resetFailuresCalled).toBe(false)
    expect(count).toBe(1)
  })

  it('returns 0 when no matching stores', async () => {
    mockCacheRegistry.set('nodes:cluster-z:v1', createMockStore('nodes:cluster-z:v1'))
    const { resetFailuresForCluster } = await freshImport()
    const count = resetFailuresForCluster('cluster-no-match')
    expect(count).toBe(0)
  })

  it('returns 0 when registry is empty', async () => {
    const { resetFailuresForCluster } = await freshImport()
    expect(resetFailuresForCluster('any-cluster')).toBe(0)
  })
})

// ============================================================================
// resetAllCacheFailures
// ============================================================================

describe('resetAllCacheFailures', () => {
  it('calls resetFailures on every registered store', async () => {
    const s1 = createMockStore('k1')
    const s2 = createMockStore('k2')
    const s3 = createMockStore('k3')
    mockCacheRegistry.set('k1', s1)
    mockCacheRegistry.set('k2', s2)
    mockCacheRegistry.set('k3', s3)
    const { resetAllCacheFailures } = await freshImport()
    resetAllCacheFailures()
    expect(s1.resetFailuresCalled).toBe(true)
    expect(s2.resetFailuresCalled).toBe(true)
    expect(s3.resetFailuresCalled).toBe(true)
  })

  it('is a no-op when registry is empty', async () => {
    const { resetAllCacheFailures } = await freshImport()
    expect(() => resetAllCacheFailures()).not.toThrow()
  })
})

// ============================================================================
// prefetchCache
// ============================================================================

describe('prefetchCache', () => {
  it('calls getOrCreateCache then store.fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ name: 'pod-1' }])
    const { prefetchCache } = await freshImport()
    await prefetchCache('prefetch-test', fetcher, [])
    expect(mockGetOrCreateCache).toHaveBeenCalledWith('prefetch-test', [], true)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})

// ============================================================================
// preloadCacheFromStorage
// ============================================================================

describe('preloadCacheFromStorage', () => {
  it('returns early when storage count is 0', async () => {
    mockCacheStorageStats = { keys: [], count: 0 }
    const { preloadCacheFromStorage } = await freshImport()
    await preloadCacheFromStorage()
    expect(mockCacheStorageGet).not.toHaveBeenCalled()
  })

  it('hydrates store for each entry found in storage', async () => {
    mockCacheStorageStats = { keys: ['nodes', 'pods'], count: 2 }
    const fakeEntry = { data: [{ name: 'node-1' }], timestamp: Date.now() }
    mockCacheStorageGet.mockResolvedValue(fakeEntry)
    const { preloadCacheFromStorage } = await freshImport()
    await preloadCacheFromStorage()
    expect(mockGetOrCreateCache).toHaveBeenCalledWith('nodes', fakeEntry.data, true)
    expect(mockGetOrCreateCache).toHaveBeenCalledWith('pods', fakeEntry.data, true)
    const nodeStore = mockCacheRegistry.get('nodes')!
    expect(nodeStore.hydrateFromEntryCalled).toBe(true)
  })

  it('skips entries where storage returns null', async () => {
    mockCacheStorageStats = { keys: ['missing-key'], count: 1 }
    mockCacheStorageGet.mockResolvedValue(null)
    const { preloadCacheFromStorage } = await freshImport()
    await preloadCacheFromStorage()
    expect(mockGetOrCreateCache).not.toHaveBeenCalled()
  })

  it('swallows individual errors and continues processing remaining keys', async () => {
    mockCacheStorageStats = { keys: ['bad-key', 'good-key'], count: 2 }
    const goodEntry = { data: ['item'], timestamp: Date.now() }
    mockCacheStorageGet.mockImplementation((key: string) => {
      if (key === 'bad-key') return Promise.reject(new Error('IDB failure'))
      return Promise.resolve(goodEntry)
    })
    const { preloadCacheFromStorage } = await freshImport()
    await expect(preloadCacheFromStorage()).resolves.toBeUndefined()
    expect(mockCacheRegistry.has('good-key')).toBe(true)
  })
})
