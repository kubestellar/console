/**
 * createCachedHook — Factory for pure-passthrough useCached* hooks.
 *
 * Eliminates boilerplate when a hook is a simple wrapper around useCache()
 * with no post-processing. The factory returns a React hook that calls
 * useCache with the given configuration and strips clearAndRefetch from the
 * result (matching the CachedHookResult<T> contract).
 *
 * Usage:
 * ```ts
 * export const useCachedFoo = createCachedHook<FooData>({
 *   key: 'foo-status',
 *   initialData: INITIAL_FOO,
 *   demoData: FOO_DEMO_DATA,
 *   fetcher: fetchFooStatus,
 * })
 * ```
 *
 * For hooks that need parameters, post-processing, or extra return fields,
 * write the hook by hand instead.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from './index'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CreateCachedHookConfig<T> {
  /** Unique cache key */
  key: string
  /** Refresh category — determines background refresh interval */
  category?: RefreshCategory
  /** Data returned before any fetch completes */
  initialData: T
  /** Static demo data shown when demo mode is active */
  demoData?: T
  /** Factory for demo data that needs fresh values per render (e.g. timestamps) */
  getDemoData?: () => T
  /** Async function that fetches live data */
  fetcher: () => Promise<T>
  /** Whether to persist to SQLite/IndexedDB (default: true) */
  persist?: boolean
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCachedHook<T>(
  config: CreateCachedHookConfig<T>,
): () => CachedHookResult<T> {
  const {
    key,
    category = 'default' as RefreshCategory,
    initialData,
    demoData,
    getDemoData,
    fetcher,
    persist = true,
  } = config

  return function useCachedHook(): CachedHookResult<T> {
    const resolvedDemoData = getDemoData ? getDemoData() : demoData

    const result = useCache<T>({
      key,
      category,
      initialData,
      demoData: resolvedDemoData,
      persist,
      fetcher,
    })

    return {
      data: result.data,
      isLoading: result.isLoading,
      isRefreshing: result.isRefreshing,
      isDemoFallback: result.isDemoFallback && !result.isLoading,
      error: result.error,
      isFailed: result.isFailed,
      consecutiveFailures: result.consecutiveFailures,
      lastRefresh: result.lastRefresh,
      refetch: result.refetch,
      retryFetch: result.retryFetch,
    }
  }
}
