/**
 * Data-fetching hook for the SLO Compliance Tracker card.
 *
 * Queries Prometheus metrics via the agent proxy to calculate SLO compliance
 * percentages and error budget burn rates. Falls back to demo data when
 * the backend is unavailable.
 */

import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  SLO_COMPLIANCE_DEMO_DATA,
  type SLOComplianceData,
  type SLOTarget,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'slo-compliance-status'

const INITIAL_DATA: SLOComplianceData = {
  targets: [],
  overallBudgetRemaining: 0,
  lastCheckTime: new Date().toISOString(),
}

const FULL_COMPLIANCE = 100

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface PrometheusResult {
  metric: Record<string, string>
  value: [number, string]
}

interface PrometheusQueryResponse {
  data?: {
    result?: PrometheusResult[]
  }
}

interface SLOConfigItem {
  name: string
  metric: string
  threshold: number
  unit: string
  window: string
  query: string
}

interface SLOConfigResponse {
  targets?: SLOConfigItem[]
}

// ---------------------------------------------------------------------------
// Safe accessor
// ---------------------------------------------------------------------------

function safeNumber(val: unknown, fallback = 0): number {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

// ---------------------------------------------------------------------------
// Live data fetcher
// ---------------------------------------------------------------------------

async function fetchSLOCompliance(): Promise<SLOComplianceData> {
  // Step 1: Get SLO target configuration from the backend
  const configResp = await authFetch('/api/mcp/slo-targets', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!configResp.ok) throw new Error('SLO targets not configured')

  const configBody: SLOConfigResponse = await configResp.json().catch(() => ({}))
  const sloConfigs = configBody.targets ?? []
  if (sloConfigs.length === 0) throw new Error('No SLO targets defined')

  // Step 2: Query Prometheus for each target's current compliance
  const targets: SLOTarget[] = await Promise.all(
    sloConfigs.map(async (cfg) => {
      try {
        const params = new URLSearchParams({ query: cfg.query })
        const resp = await authFetch(`/api/mcp/prometheus/query?${params}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (!resp.ok) {
          return {
            name: cfg.name,
            metric: cfg.metric,
            threshold: cfg.threshold,
            unit: cfg.unit,
            window: cfg.window,
            currentCompliance: 0,
          }
        }
        const body: PrometheusQueryResponse = await resp.json().catch(() => ({}))
        const results = body.data?.result ?? []
        const value = results.length > 0 ? safeNumber(results[0].value[1]) : 0

        return {
          name: cfg.name,
          metric: cfg.metric,
          threshold: cfg.threshold,
          unit: cfg.unit,
          window: cfg.window,
          currentCompliance: value,
        }
      } catch {
        return {
          name: cfg.name,
          metric: cfg.metric,
          threshold: cfg.threshold,
          unit: cfg.unit,
          window: cfg.window,
          currentCompliance: 0,
        }
      }
    }),
  )

  // Step 3: Calculate overall budget remaining
  const totalBudget = targets.length > 0
    ? targets.reduce((sum, t) => sum + (FULL_COMPLIANCE - t.currentCompliance), 0) / targets.length
    : 0
  const overallBudgetRemaining = Math.max(0, FULL_COMPLIANCE - totalBudget)

  return {
    targets,
    overallBudgetRemaining,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSLOCompliance() {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<SLOComplianceData>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: SLO_COMPLIANCE_DEMO_DATA,
    persist: true,
    fetcher: fetchSLOCompliance,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = (data.targets || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    showSkeleton,
    showEmptyState,
    error: isFailed && !hasAnyData,
  }
}
