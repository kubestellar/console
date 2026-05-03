/**
 * Cortex Status Hook — Data fetching for the cortex_status card.
 *
 * Mirrors the dapr_status / tuf_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real Cortex bridge lands, at
 *   which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 *
 * Source: kubestellar/console-marketplace#35
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  CORTEX_DEMO_DATA,
  type CortexComponentPod,
  type CortexIngestionMetrics,
  type CortexStatusData,
  type CortexSummary,
} from '../lib/demo/cortex'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cortex-status'
const CORTEX_STATUS_ENDPOINT = '/api/cortex/status'
const DEFAULT_VERSION = 'unknown'
const NOT_FOUND_STATUS = 404

const EMPTY_METRICS: CortexIngestionMetrics = {
  activeSeries: 0,
  ingestionRatePerSec: 0,
  queryRatePerSec: 0,
  tenantCount: 0,
}

const INITIAL_DATA: CortexStatusData = {
  health: 'not-installed',
  version: DEFAULT_VERSION,
  components: [],
  metrics: EMPTY_METRICS,
  summary: {
    totalPods: 0,
    runningPods: 0,
    totalComponents: 0,
    runningComponents: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/cortex/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface CortexStatusResponse {
  version?: string
  components?: CortexComponentPod[]
  metrics?: Partial<CortexIngestionMetrics>
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function summarize(components: CortexComponentPod[]): CortexSummary {
  const totalPods = (components ?? []).reduce((sum, c) => sum + c.replicasDesired, 0)
  const runningPods = (components ?? []).reduce((sum, c) => sum + c.replicasReady, 0)
  const runningComponents = (components ?? []).filter(
    c => c.status === 'running' && c.replicasReady === c.replicasDesired,
  ).length
  return {
    totalPods,
    runningPods,
    totalComponents: (components ?? []).length,
    runningComponents,
  }
}

function deriveHealth(components: CortexComponentPod[]): CortexStatusData['health'] {
  if ((components ?? []).length === 0) return 'not-installed'
  const hasDegraded = (components ?? []).some(
    p => p.status !== 'running' || p.replicasReady < p.replicasDesired,
  )
  if (hasDegraded) return 'degraded'
  return 'healthy'
}

function buildCortexStatus(
  components: CortexComponentPod[],
  metrics: CortexIngestionMetrics,
  version: string,
): CortexStatusData {
  return {
    health: deriveHealth(components),
    version,
    components,
    metrics,
    summary: summarize(components),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors contour/dapr/flux/envoy pattern)
// ---------------------------------------------------------------------------

async function fetchJson<T>(
  url: string,
  options?: { treat404AsEmpty?: boolean },
): Promise<FetchResult<T | null>> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
      if (options?.treat404AsEmpty && resp.status === NOT_FOUND_STATUS) {
        return { data: null, failed: false }
      }
      return { data: null, failed: true }
    }

    const body = (await resp.json()) as T
    return { data: body, failed: false }
  } catch {
    return { data: null, failed: true }
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchCortexStatus(): Promise<CortexStatusData> {
  const result = await fetchJson<CortexStatusResponse>(
    CORTEX_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  if (result.failed) {
    throw new Error('Unable to fetch Cortex status')
  }

  const body = result.data
  const components = Array.isArray(body?.components) ? body.components : []
  const metrics: CortexIngestionMetrics = {
    activeSeries: body?.metrics?.activeSeries ?? 0,
    ingestionRatePerSec: body?.metrics?.ingestionRatePerSec ?? 0,
    queryRatePerSec: body?.metrics?.queryRatePerSec ?? 0,
    tenantCount: body?.metrics?.tenantCount ?? 0,
  }
  const version = body?.version ?? DEFAULT_VERSION

  return buildCortexStatus(components, metrics, version)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedCortexResult {
  data: CortexStatusData
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

export function useCachedCortex(): UseCachedCortexResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<CortexStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: CORTEX_DEMO_DATA,
    persist: true,
    fetcher: fetchCortexStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when Cortex isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.components.length > 0

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

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildCortexStatus,
}
