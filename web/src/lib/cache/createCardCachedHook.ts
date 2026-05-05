/**
 * createCardCachedHook — Factory for card-level useCached* hooks.
 *
 * Extends createCachedHook by also wiring useCardLoadingState, eliminating
 * the repetitive boilerplate tail that every card hook duplicates:
 *   - effectiveIsDemoData = isDemoFallback && !isLoading
 *   - hasAnyData predicate
 *   - useCardLoadingState() call
 *   - Standard return shape with showSkeleton / showEmptyState / error
 *
 * Usage:
 * ```ts
 * export const useCachedDapr = createCardCachedHook<DaprStatusData>({
 *   key: 'dapr-status',
 *   category: 'services',
 *   initialData: INITIAL_DATA,
 *   demoData: DAPR_DEMO_DATA,
 *   fetcher: fetchDaprStatus,
 *   hasAnyData: (data) => data.health === 'not-installed' || data.controlPlane.length > 0,
 * })
 * ```
 *
 * For hooks that need parameters, extra return fields, or post-processing
 * beyond what the factory provides, write the hook by hand instead.
 */

import { useCache, type RefreshCategory } from './index'
import { useCardLoadingState } from '../../components/cards/CardDataContext'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CreateCardCachedHookConfig<T> {
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
  /**
   * Predicate to determine if the data contains any displayable content.
   * Used to decide between showing skeleton vs empty state.
   * Default: always true (assumes fetcher returns meaningful data on success).
   */
  hasAnyData?: (data: T) => boolean
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CardCachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  showSkeleton: boolean
  showEmptyState: boolean
  error: boolean
  refetch: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCardCachedHook<T>(
  config: CreateCardCachedHookConfig<T>,
): () => CardCachedHookResult<T> {
  const {
    key,
    category = 'default' as RefreshCategory,
    initialData,
    demoData,
    getDemoData,
    fetcher,
    persist = true,
    hasAnyData: hasAnyDataFn = () => true,
  } = config

  return function useCardCachedHook(): CardCachedHookResult<T> {
    const resolvedDemoData = getDemoData ? getDemoData() : demoData

    const {
      data,
      isLoading,
      isRefreshing,
      isFailed,
      consecutiveFailures,
      isDemoFallback,
      lastRefresh,
      refetch,
    } = useCache<T>({
      key,
      category,
      initialData,
      demoData: resolvedDemoData,
      persist,
      fetcher,
    })

    // Prevent demo flash while loading — only surface the Demo badge once
    // we've actually fallen back to demo data post-load.
    const effectiveIsDemoData = isDemoFallback && !isLoading

    const hasAnyData = hasAnyDataFn(data)

    const { showSkeleton, showEmptyState } = useCardLoadingState({
      isLoading: isLoading && !hasAnyData,
      isRefreshing,
      hasAnyData,
      isFailed,
      consecutiveFailures,
      isDemoData: effectiveIsDemoData,
      lastRefresh,
    })

    return {
      data,
      isLoading,
      isRefreshing,
      isDemoData: effectiveIsDemoData,
      isFailed,
      consecutiveFailures,
      lastRefresh,
      showSkeleton,
      showEmptyState,
      error: isFailed && !hasAnyData,
      refetch,
    }
  }
}
