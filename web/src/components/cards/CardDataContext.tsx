/**
 * CardDataContext — allows card child components to report their cache/data
 * state (isFailed, consecutiveFailures) up to the parent CardWrapper, which
 * renders the appropriate status badges (failure, demo fallback, etc.).
 *
 * ## Demo Mode Architecture
 *
 * There are THREE ways a card can be marked as "demo":
 *
 * 1. **DEMO_DATA_CARDS set** (cardRegistry.ts) - Static list of cards that ALWAYS use demo data.
 *    These get `isDemoData={true}` passed as a prop, which OVERRIDES child reports.
 *    → When adding live data support, REMOVE the card from this set!
 *
 * 2. **Global demo mode** (useDemoMode) - User/system-wide toggle (forced on Netlify).
 *    Cards can opt-out by reporting `isDemoData: false` via useReportCardDataState.
 *
 * 3. **Child-reported state** - Cards call useReportCardDataState({ isDemoData: ... })
 *    to dynamically report based on actual data source availability.
 *
 * ## Usage Examples
 *
 * ### Card with cached data hook:
 * ```tsx
 * const { isFailed, consecutiveFailures } = useCachedPodIssues()
 * useReportCardDataState({ isFailed, consecutiveFailures })
 * ```
 *
 * ### Card with stack-dependent data (llm-d cards):
 * ```tsx
 * const { shouldUseDemoData } = useCardDemoState({ requires: 'stack' })
 * useReportCardDataState({ isDemoData: shouldUseDemoData, isFailed: false, consecutiveFailures: 0 })
 * // Then use shouldUseDemoData to decide data source
 * ```
 *
 * ### Card with agent-dependent data:
 * ```tsx
 * const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
 * useReportCardDataState({ isDemoData: shouldUseDemoData, isFailed: false, consecutiveFailures: 0 })
 * ```
 */

import { createContext, useContext, useLayoutEffect, useMemo } from 'react'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isAgentUnavailable } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
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
  /** Whether the card is displaying demo/mock data. Set to false to opt-out of demo indicator. */
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
    // Default to undefined (not false) so cards don't accidentally opt-out of demo indicator.
    // Only cards that explicitly set isDemoData: false will opt-out.
    isDemoData,
  } = options

  // Data is considered "real" (displayable) if there is any data at all.
  // Demo data should be shown immediately with the Demo badge — not hidden behind a skeleton.
  // When refreshing with cached data, show cached content + refresh animation.
  const hasRealData = hasAnyData
  const hasData = !isLoading || hasRealData

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
    /** Whether to show skeleton loading state (only when loading with no cached/real data) */
    showSkeleton: isLoading && !hasRealData,
    /** Whether to show empty state (loading finished but no data exists) */
    showEmptyState: !isLoading && !hasAnyData,
    /** Whether data is being refreshed (has cache, fetching update) */
    isRefreshing: isLoading && hasRealData,
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
  /**
   * Whether to show the demo badge/indicator in CardWrapper.
   * This is usually the same as shouldUseDemoData, but for stack-dependent cards
   * it's true when global demo mode is on (even if a stack is selected).
   */
  showDemoBadge: boolean
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
      return { shouldUseDemoData: true, reason: 'demo-only-card' as DemoReason, showDemoBadge: true }
    }

    // 2. Stack-dependent cards: use stack data if a stack is selected
    //    This works even in global demo mode (uses demo stack data)
    if (requires === 'stack') {
      // Check if we're in a StackProvider and have a selected stack
      // If a stack is selected (real or demo), use its data - not generic demo data
      if (stackContext?.selectedStack) {
        // Stack is selected - use its data (even if it's demo data)
        // But still show demo badge if global demo mode is on
        return { shouldUseDemoData: false, reason: null, showDemoBadge: isDemoMode }
      }
      // No stack selected - use demo data
      return { shouldUseDemoData: true, reason: 'stack-not-selected' as DemoReason, showDemoBadge: true }
    }

    // 3. Global demo mode is ON - use demo data for non-stack cards
    if (isDemoMode) {
      return { shouldUseDemoData: true, reason: 'global-demo-mode' as DemoReason, showDemoBadge: true }
    }

    // 4. Agent-dependent card but agent is offline AND backend is also unavailable
    //    When backend is connected (cluster mode), allow live data via backend API
    if (requires === 'agent' && isAgentUnavailable() && !isInClusterMode()) {
      return { shouldUseDemoData: true, reason: 'agent-offline' as DemoReason, showDemoBadge: true }
    }

    // 5. Specific endpoint returned 404/error
    if (!isLiveDataAvailable) {
      return { shouldUseDemoData: true, reason: 'endpoint-missing' as DemoReason, showDemoBadge: true }
    }

    // All checks passed - use live data
    return { shouldUseDemoData: false, reason: null, showDemoBadge: false }
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
