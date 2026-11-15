import { initCacheWorker, initPreloadedMeta, migrateFromLocalStorage, migrateIDBToSQLite } from './cacheStorage'
import { logOpfsFallback } from './opfsFallback'
import { STORAGE_KEY_SQLITE_MIGRATED } from '../constants'

/** Initialize the cache even when browser storage prevents legacy migration. */
export async function initializeCache(): Promise<void> {
  try {
    const rpc = await initCacheWorker()

    try {
      if (!localStorage.getItem(STORAGE_KEY_SQLITE_MIGRATED)) {
        await migrateFromLocalStorage()
        await migrateIDBToSQLite()
        localStorage.setItem(STORAGE_KEY_SQLITE_MIGRATED, '2')
      }
    } catch (error: unknown) {
      // Retry migration next time; the worker can still serve and preload cache data.
      console.warn('[Cache] Legacy storage migration failed:', error)
    }

    const seed = (window as Window & { __CACHE_SEED__?: Array<{ key: string; entry: { data: unknown; timestamp: number; version: number } }> }).__CACHE_SEED__
    if (seed) {
      await rpc.seedCache(seed)
    }

    const { meta } = await rpc.preloadAll()
    initPreloadedMeta(meta)
  } catch (error: unknown) {
    logOpfsFallback('[Cache] SQLite worker init: using IndexedDB fallback:', error)
    try { await migrateFromLocalStorage() } catch (migrateError: unknown) { console.error('[Cache] failed to migrate from localStorage:', migrateError) }
  }
}
