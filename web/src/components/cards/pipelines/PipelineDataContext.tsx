/**
 * PipelineDataContext — unified data provider for the CI/CD dashboard.
 *
 * Fetches all four pipeline views (pulse, matrix, failures, flow) with a
 * single `view=all` request instead of four separate requests. Cards that
 * live inside this provider read shared data via `usePipelineData()`.
 *
 * Cards rendered outside the CI/CD dashboard (e.g. on other dashboards or
 * in embed mode) get `null` from `usePipelineData()` and fall back to
 * their own individual fetches — no behavior change for standalone usage.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  useUnifiedPipelineData,
  DEMO_PULSE,
  DEMO_MATRIX,
  DEMO_FLOW,
  DEMO_FAILURES,
  type UnifiedPipelineData,
  type PulsePayload,
  type MatrixPayload,
  type FlowPayload,
  type FailuresPayload,
} from '../../../hooks/useGitHubPipelines'

/** Default matrix days for the unified fetch */
const DEFAULT_MATRIX_DAYS = 14

const PipelineDataCtx = createContext<UnifiedPipelineData | null>(null)

export interface PipelineDataProviderProps {
  children: ReactNode
  /** Optional repo filter — passed through to the unified fetch */
  repo?: string | null
  /** Matrix days — defaults to 14 */
  days?: number
}

/**
 * Wraps the CI/CD dashboard and provides shared pipeline data to all cards.
 * Must be rendered inside or alongside PipelineFilterProvider.
 */
export function PipelineDataProvider({
  children,
  repo = null,
  days = DEFAULT_MATRIX_DAYS,
}: PipelineDataProviderProps) {
  const {
    data,
    isLoading,
    isRefreshing,
    error,
    isFailed,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useUnifiedPipelineData(repo, days)

  const value = useMemo<UnifiedPipelineData>(
    () => ({
      pulse: (data?.pulse ?? DEMO_PULSE) as PulsePayload,
      matrix: (data?.matrix ?? DEMO_MATRIX) as MatrixPayload,
      failures: (data?.failures ?? DEMO_FAILURES) as FailuresPayload,
      flow: (data?.flow ?? DEMO_FLOW) as FlowPayload,
      isLoading,
      isRefreshing,
      error,
      isFailed,
      isDemoFallback: isDemoFallback && !isLoading,
      lastRefresh,
      refetch,
    }),
    [data, isLoading, isRefreshing, error, isFailed, isDemoFallback, lastRefresh, refetch],
  )

  return (
    <PipelineDataCtx.Provider value={value}>
      {children}
    </PipelineDataCtx.Provider>
  )
}

/**
 * Returns the shared pipeline data if inside a PipelineDataProvider,
 * or null if the card is rendered standalone (outside the CI/CD dashboard).
 */
export function usePipelineData(): UnifiedPipelineData | null {
  return useContext(PipelineDataCtx)
}
