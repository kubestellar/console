/**
 * CardDataContext — allows card child components to report their cache/data
 * state (isFailed, consecutiveFailures) up to the parent CardWrapper, which
 * renders the appropriate status badges (failure, demo fallback, etc.).
 *
 * Usage inside a card component:
 *
 *   const { isFailed, consecutiveFailures } = useCachedPodIssues()
 *   useReportCardDataState({ isFailed, consecutiveFailures })
 *
 * For cards that need to determine whether to use demo data:
 *
 *   const { shouldUseDemoData, reason } = useCardDemoState({
 *     requires: 'agent',           // 'agent' | 'backend' | 'stack' | 'none'
 *     isLiveDataAvailable: true,   // Set to false if endpoint returned 404/error
 *   })
 *   if (shouldUseDemoData) {
 *     // Use local demo data
 *   }
 */

import { createContext, useContext, useLayoutEffect, useMemo } from 'react'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isAgentUnavailable } from '../../hooks/useLocalAgent'
import { useOptionalStack } from '../../contexts/StackContext'

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
  /** Whether the card is displaying demo/mock data instead of real data */
  isDemoData?: boolean
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
  const { isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData, isDemoData } = state
  const ctx = useContext(CardDataReportContext)
  // useLayoutEffect runs synchronously before paint, ensuring cached data
  // is reported before CardWrapper decides to show skeleton
  useLayoutEffect(() => {
    ctx.report({ isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData, isDemoData })
  }, [ctx, isFailed, consecutiveFailures, errorMessage, isLoading, isRefreshing, hasData, isDemoData])
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
  /** Whether the card is displaying demo/mock data instead of real data (default: false) */
  isDemoData?: boolean
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
    isDemoData = false,
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
    isDemoData,
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

// =============================================================================
// useCardDemoState — Centralized demo mode decision logic
// =============================================================================

/** What the card requires to display live data */
export type CardRequirement = 'agent' | 'backend' | 'stack' | 'none'

/** Why the card is using demo data */
export type DemoReason =
  | 'global-demo-mode'      // User has demo mode enabled
  | 'agent-offline'         // Agent is not connected
  | 'endpoint-missing'      // Specific endpoint returned 404/error
  | 'stack-not-selected'    // Card requires a stack but none selected
  | 'demo-only-card'        // Card is demo-only (requires: 'none')
  | null                    // Not using demo data

export interface CardDemoStateOptions {
  /**
   * What the card requires to display live data:
   * - 'agent': Requires kc-agent to be connected (most cards)
   * - 'backend': Requires backend API (auth, user data)
   * - 'stack': Requires a stack to be selected (llm-d visualization cards)
   * - 'none': Demo-only card, always uses demo data
   */
  requires?: CardRequirement

  /**
   * Whether live data is actually available (e.g., endpoint returned data).
   * Set to false if the endpoint returned 404/error.
   * When undefined, assumed true (agent/backend handles the error).
   */
  isLiveDataAvailable?: boolean
}

export interface CardDemoStateResult {
  /** Whether the card should display demo data */
  shouldUseDemoData: boolean
  /** Why the card is using demo data (null if not using demo) */
  reason: DemoReason
}

/**
 * Hook for cards to determine whether to use demo data.
 *
 * This centralizes ALL demo mode decision logic so cards don't need to
 * individually check demo mode, agent status, stack selection, etc.
 *
 * @example
 * ```tsx
 * // Card that requires agent to be connected
 * const { shouldUseDemoData, reason } = useCardDemoState({ requires: 'agent' })
 *
 * // Card that requires a stack to be selected
 * const { shouldUseDemoData, reason } = useCardDemoState({ requires: 'stack' })
 *
 * // Card that checked an endpoint and it returned 404
 * const { shouldUseDemoData, reason } = useCardDemoState({
 *   requires: 'agent',
 *   isLiveDataAvailable: endpointWorked,
 * })
 *
 * // Demo-only card
 * const { shouldUseDemoData, reason } = useCardDemoState({ requires: 'none' })
 *
 * if (shouldUseDemoData) {
 *   return <DemoView data={DEMO_DATA} />
 * }
 * ```
 */
export function useCardDemoState(options: CardDemoStateOptions = {}): CardDemoStateResult {
  const { requires = 'agent', isLiveDataAvailable = true } = options
  const { isDemoMode } = useDemoMode()
  const stackContext = useOptionalStack()

  // Memoize the result to prevent unnecessary re-renders
  return useMemo(() => {
    // Priority order for demo reasons:

    // 1. Demo-only card (requires: 'none')
    if (requires === 'none') {
      return { shouldUseDemoData: true, reason: 'demo-only-card' as DemoReason }
    }

    // 2. Stack-dependent cards: use stack data if a stack is selected
    //    This works even in global demo mode (uses demo stack data)
    if (requires === 'stack') {
      // Check if we're in a StackProvider and have a selected stack
      // If a stack is selected (real or demo), use its data - not generic demo data
      if (stackContext?.selectedStack) {
        return { shouldUseDemoData: false, reason: null }
      }
      // No stack selected - use demo data
      return { shouldUseDemoData: true, reason: 'stack-not-selected' as DemoReason }
    }

    // 3. Global demo mode is ON - use demo data for non-stack cards
    if (isDemoMode) {
      return { shouldUseDemoData: true, reason: 'global-demo-mode' as DemoReason }
    }

    // 4. Agent-dependent card but agent is offline
    if (requires === 'agent' && isAgentUnavailable()) {
      return { shouldUseDemoData: true, reason: 'agent-offline' as DemoReason }
    }

    // 5. Specific endpoint returned 404/error
    if (!isLiveDataAvailable) {
      return { shouldUseDemoData: true, reason: 'endpoint-missing' as DemoReason }
    }

    // All checks passed - use live data
    return { shouldUseDemoData: false, reason: null }
  }, [isDemoMode, requires, isLiveDataAvailable, stackContext?.selectedStack])
}

/**
 * Combined hook for cards that need both demo state and loading state reporting.
 *
 * This is a convenience wrapper that combines useCardDemoState and useCardLoadingState.
 *
 * @example
 * ```tsx
 * const { alerts, isLoading, endpointWorked } = useAlerts()
 *
 * const { shouldUseDemoData, showSkeleton, showEmptyState } = useCardDemoAndLoadingState({
 *   requires: 'agent',
 *   isLiveDataAvailable: endpointWorked,
 *   isLoading,
 *   hasAnyData: alerts.length > 0,
 * })
 *
 * if (shouldUseDemoData) {
 *   return <DemoAlerts data={DEMO_ALERTS} />
 * }
 *
 * if (showSkeleton) {
 *   return <Skeleton />
 * }
 * ```
 */
export function useCardDemoAndLoadingState(
  options: CardDemoStateOptions & CardLoadingStateOptions
): CardDemoStateResult & ReturnType<typeof useCardLoadingState> {
  const { requires, isLiveDataAvailable, ...loadingOptions } = options

  const demoState = useCardDemoState({ requires, isLiveDataAvailable })
  const loadingState = useCardLoadingState({
    ...loadingOptions,
    isDemoData: demoState.shouldUseDemoData,
  })

  return {
    ...demoState,
    ...loadingState,
  }
}
