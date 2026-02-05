/**
 * CardDataContext — allows card child components to report their cache/data
 * state (isFailed, consecutiveFailures) up to the parent CardWrapper, which
 * renders the appropriate status badges (failure, demo fallback, etc.).
 *
 * Usage inside a card component:
 *
 *   const { isFailed, consecutiveFailures } = useCachedPodIssues()
 *   useReportCardDataState({ isFailed, consecutiveFailures })
 */

import { createContext, useContext, useLayoutEffect } from 'react'

export interface CardDataState {
  /** Whether 3+ consecutive fetch failures have occurred */
  isFailed: boolean
  /** Number of consecutive fetch failures */
  consecutiveFailures: number
  /** Error message from the last failed fetch (optional) */
  errorMessage?: string
  /** Whether data is currently being fetched (initial load, no cache) */
  isLoading?: boolean
  /** Whether data is being refreshed (has cache, fetching update) */
  isRefreshing?: boolean
  /** Whether the card has cached data to display */
  hasData?: boolean
}

interface CardDataReportContextValue {
  report: (state: CardDataState) => void
}

const NOOP_REPORT: CardDataReportContextValue = { report: () => {} }

export const CardDataReportContext = createContext<CardDataReportContextValue>(NOOP_REPORT)

/**
 * Hook for card components to report their data/cache state to the parent
 * CardWrapper. Call this with the isFailed/consecutiveFailures values from
 * your cached data hook (e.g. useCachedPodIssues, useCachedDeployments).
 */
export function useReportCardDataState(state: CardDataState) {
  const { isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData } = state
  const ctx = useContext(CardDataReportContext)
  // useLayoutEffect runs synchronously before paint, ensuring cached data
  // is reported before CardWrapper decides to show skeleton
  useLayoutEffect(() => {
    ctx.report({ isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData })
  }, [ctx, isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData])
}

/**
 * Options for useCardLoadingState hook
 */
export interface CardLoadingStateOptions {
  /** Whether data is currently being fetched from the source */
  isLoading: boolean
  /** Whether the card has any data to display (e.g., data.length > 0) */
  hasAnyData: boolean
  /** Whether 3+ consecutive fetch failures have occurred (default: false) */
  isFailed?: boolean
  /** Number of consecutive fetch failures (default: 0) */
  consecutiveFailures?: number
  /** Error message from the last failed fetch (optional) */
  errorMessage?: string
}

/**
 * Simplified hook for cards to report loading state with correct stale-while-revalidate behavior.
 *
 * This hook handles the common pattern where:
 * - `hasData` should be true once loading completes (even with empty data)
 * - `hasData` should be true if we have cached data (even while refreshing)
 * - Skeleton should only show when loading AND no cached data exists
 * - Empty state should show when loading finishes but no data exists
 *
 * @example
 * ```tsx
 * const { clusters, isLoading } = useClusters()
 * const { showSkeleton, showEmptyState } = useCardLoadingState({
 *   isLoading,
 *   hasAnyData: clusters.length > 0,
 * })
 *
 * if (showSkeleton) {
 *   return <CardSkeleton type="list" rows={3} />
 * }
 *
 * if (showEmptyState) {
 *   return <CardEmptyState message="No clusters found" />
 * }
 * ```
 */
export function useCardLoadingState(options: CardLoadingStateOptions) {
  const {
    isLoading,
    hasAnyData,
    isFailed = false,
    consecutiveFailures = 0,
    errorMessage,
  } = options

  // hasData is true once loading completes (even with empty data) OR if we have cached data
  // This prevents flickering when data array is momentarily empty during refresh
  const hasData = !isLoading || hasAnyData

  // Report state to CardWrapper for refresh animation and status badges
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    errorMessage,
    isLoading: isLoading && !hasData,
    isRefreshing: isLoading && hasData,
    hasData,
  })

  return {
    /** Whether the card has data to display (true once loading completes or has cached data) */
    hasData,
    /** Whether to show skeleton loading state (only when loading with no cached data) */
    showSkeleton: isLoading && !hasAnyData,
    /** Whether to show empty state (loading finished but no data exists) */
    showEmptyState: !isLoading && !hasAnyData,
    /** Whether data is being refreshed (has cache, fetching update) */
    isRefreshing: isLoading && hasData,
  }
}
