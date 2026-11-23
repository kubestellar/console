import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { initializeCache } from '../initializeCache'
import { initCacheWorker, initPreloadedMeta, migrateFromLocalStorage, migrateIDBToSQLite } from '../cacheStorage'
import { STORAGE_KEY_SQLITE_MIGRATED } from '../../constants'

vi.mock('../cacheStorage', () => ({
  initCacheWorker: vi.fn(),
  initPreloadedMeta: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
  migrateIDBToSQLite: vi.fn(),
}))
vi.mock('../opfsFallback', () => ({ logOpfsFallback: vi.fn() }))

describe('initializeCache', () => {
  const seedCache = vi.fn()
  const preloadAll = vi.fn()
  const meta = { example: { consecutiveFailures: 0, lastError: null, lastSuccessfulRefresh: null } }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    preloadAll.mockResolvedValue({ meta })
    vi.mocked(initCacheWorker).mockResolvedValue({ seedCache, preloadAll } as never)
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(undefined)
    vi.mocked(migrateIDBToSQLite).mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (window as Window & { __CACHE_SEED__?: unknown }).__CACHE_SEED__
    vi.restoreAllMocks()
  })

  it('still seeds and preloads the worker when localStorage is unavailable', async () => {
    const seed = [{ key: 'example', entry: { data: 'cached', timestamp: 1, version: 1 } }]
    ;(window as Window & { __CACHE_SEED__?: typeof seed }).__CACHE_SEED__ = seed
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })

    await initializeCache()

    expect(seedCache).toHaveBeenCalledWith(seed)
    expect(preloadAll).toHaveBeenCalledOnce()
    expect(initPreloadedMeta).toHaveBeenCalledWith(meta)
    expect(migrateFromLocalStorage).not.toHaveBeenCalled()
  })

  it('does not mark a failed migration complete and still preloads', async () => {
    vi.mocked(migrateFromLocalStorage).mockRejectedValue(new Error('storage unavailable'))

    await initializeCache()

    expect(localStorage.getItem(STORAGE_KEY_SQLITE_MIGRATED)).toBeNull()
    expect(preloadAll).toHaveBeenCalledOnce()
    expect(initPreloadedMeta).toHaveBeenCalledWith(meta)
  })
})
