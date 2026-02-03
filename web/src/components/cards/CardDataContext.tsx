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

import { createContext, useContext, useEffect } from 'react'

export interface CardDataState {
  /** Whether 3+ consecutive fetch failures have occurred */
  isFailed: boolean
  /** Number of consecutive fetch failures */
  consecutiveFailures: number
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
  const { isFailed, consecutiveFailures, isLoading, isRefreshing, hasData } = state
  const ctx = useContext(CardDataReportContext)
  useEffect(() => {
    ctx.report({ isFailed, consecutiveFailures, isLoading, isRefreshing, hasData })
  }, [ctx, isFailed, consecutiveFailures, isLoading, isRefreshing, hasData])
}
