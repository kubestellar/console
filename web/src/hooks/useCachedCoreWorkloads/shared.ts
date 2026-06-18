import type { CachedHookResult } from '../../lib/cache'

export function withAlias<T, K extends string>(result: CachedHookResult<T>, alias: K): CachedHookResult<T> & Record<K, T> {
  return {
    [alias]: result.data,
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
  } as CachedHookResult<T> & Record<K, T>
}
