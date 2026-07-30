import { META_PREFIX, cacheStorage, clearSessionSnapshots, preloadedMetaMap } from './cacheStorage'
import { CacheStore, cacheRegistry, getOrCreateCache } from './cacheCore'

export async function clearAllCaches(): Promise<void> {
  await cacheStorage.clear()
  preloadedMetaMap.clear()
  clearSessionSnapshots()

  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(META_PREFIX)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
  cacheRegistry.clear()
}

export async function getCacheStats(): Promise<{ keys: string[]; count: number; entries: number }> {
  const stats = await cacheStorage.getStats()
  return { ...stats, entries: cacheRegistry.size }
}

export async function invalidateCache(key: string): Promise<void> {
  const store = cacheRegistry.get(key)
  if (store) {
    await (store as CacheStore<unknown>).clear()
  }
  await cacheStorage.delete(key)
  preloadedMetaMap.delete(key)
}

export function resetFailuresForCluster(clusterName: string): number {
  let resetCount = 0
  for (const [key, store] of cacheRegistry.entries()) {
    if (key.includes(clusterName) || key.includes(':all:')) {
      (store as CacheStore<unknown>).resetFailures()
      resetCount++
    }
  }
  return resetCount
}

export function resetAllCacheFailures(): void {
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).resetFailures()
  }
}

export async function prefetchCache<T>(key: string, fetcher: () => Promise<T>, initialData: T): Promise<void> {
  const store = getOrCreateCache(key, initialData, true)
  await store.fetch(fetcher)
}

export async function preloadCacheFromStorage(): Promise<void> {
  const stats = await cacheStorage.getStats()
  if (stats.count === 0) return

  await Promise.all(stats.keys.map(async (key) => {
    try {
      const entry = await cacheStorage.get<unknown>(key)
      if (entry) {
        const store = getOrCreateCache(key, entry.data, true)
        store.hydrateFromEntry(entry)
      }
    } catch {
      // Ignore individual load failures
    }
  }))
}
