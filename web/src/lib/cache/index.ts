/**
 * Unified Caching Layer for Dashboard Cards
 *
 * This barrel preserves the existing public API while splitting the
 * implementation into focused modules.
 */

export { useCache, useArrayCache, useObjectCache } from './cacheCore'
export type { UseCacheOptions, UseCacheResult, CachedHookResult } from './cacheCore'
export {
  REFRESH_RATES,
  initCacheWorker,
  initPreloadedMeta,
  isSQLiteWorkerActive,
  migrateFromLocalStorage,
  migrateIDBToSQLite,
} from './cacheStorage'
export type { RefreshCategory } from './cacheStorage'
export {
  isAutoRefreshPaused,
  setAutoRefreshPaused,
  subscribeAutoRefreshPaused,
} from './cacheCore'
export {
  clearAllCaches,
  getCacheStats,
  invalidateCache,
  resetFailuresForCluster,
  resetAllCacheFailures,
  prefetchCache,
  preloadCacheFromStorage,
} from './cacheStats'

export {
  useLocalPreference,
  useClusterFilterPreference,
  useSortPreference,
  useCollapsedPreference,
  useIndexedData,
  getStorageStats,
  clearAllStorage,
} from './hooks'

export { createCachedHook } from './createCachedHook'
export type { CreateCachedHookConfig } from './createCachedHook'

import { getEffectiveInterval } from './cacheCore'
import { isEquivalentToInitial } from './cacheFallback'
import {
  CACHE_VERSION,
  FAILURE_BACKOFF_MULTIPLIER,
  MAX_BACKOFF_INTERVAL,
  MAX_FAILURES,
  META_PREFIX,
  SS_PREFIX,
  _idbStorage,
  clearSessionSnapshots,
  ssFlush,
  ssRead,
  ssWrite,
} from './cacheStorage'

export const __testables = {
  ssWrite,
  ssFlush,
  ssRead,
  clearSessionSnapshots,
  isEquivalentToInitial,
  getEffectiveInterval,
  CACHE_VERSION,
  SS_PREFIX,
  META_PREFIX,
  MAX_FAILURES,
  FAILURE_BACKOFF_MULTIPLIER,
  MAX_BACKOFF_INTERVAL,
  _idbStorage,
}
