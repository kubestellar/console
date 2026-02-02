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
  /** Whether data is currently being fetched */
  isLoading?: boolean
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
  const { isFailed, consecutiveFailures, isLoading } = state
  const ctx = useContext(CardDataReportContext)
  useEffect(() => {
    ctx.report({ isFailed, consecutiveFailures, isLoading })
  }, [ctx, isFailed, consecutiveFailures, isLoading])
}
