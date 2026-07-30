/**
 * Envoy Proxy Status Hook — Data fetching for the envoy_status card.
 *
 * Mirrors the contour_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real Envoy admin bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import {
  ENVOY_DEMO_DATA,
  type EnvoyListener,
  type EnvoyStats,
  type EnvoyStatusData,
  type EnvoyUpstreamCluster,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'envoy-status'
const ENVOY_STATUS_ENDPOINT = '/api/envoy/status'

const EMPTY_STATS: EnvoyStats = {
  requestsPerSecond: 0,
  activeConnections: 0,
  totalRequests: 0,
  http5xxRate: 0,
}

const INITIAL_DATA: EnvoyStatusData = {
  health: 'not-installed',
  listeners: [],
  clusters: [],
  stats: EMPTY_STATS,
  summary: {
    totalListeners: 0,
    activeListeners: 0,
    totalClusters: 0,
    healthyClusters: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/envoy/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface EnvoyStatusResponse {
  listeners?: EnvoyListener[]
  clusters?: EnvoyUpstreamCluster[]
  stats?: Partial<EnvoyStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  listeners: EnvoyListener[],
  clusters: EnvoyUpstreamCluster[],
) {
  const totalListeners = listeners.length
  const activeListeners = listeners.filter(l => l.status === 'active').length
  const totalClusters = clusters.length
  const healthyClusters = clusters.filter(
    c => c.endpointsTotal > 0 && c.endpointsHealthy === c.endpointsTotal,
  ).length

  return { totalListeners, activeListeners, totalClusters, healthyClusters }
}

function deriveHealth(
  listeners: EnvoyListener[],
  clusters: EnvoyUpstreamCluster[],
): EnvoyStatusData['health'] {
  if (listeners.length === 0 && clusters.length === 0) {
    return 'not-installed'
  }
  const hasUnhealthyCluster = clusters.some(
    c => c.endpointsTotal > 0 && c.endpointsHealthy < c.endpointsTotal,
  )
  const hasInactiveListener = listeners.some(l => l.status !== 'active')
  if (hasUnhealthyCluster || hasInactiveListener) {
    return 'degraded'
  }
  return 'healthy'
}

function buildEnvoyStatus(
  listeners: EnvoyListener[],
  clusters: EnvoyUpstreamCluster[],
  stats: EnvoyStats,
): EnvoyStatusData {
  return {
    health: deriveHealth(listeners, clusters),
    listeners,
    clusters,
    stats,
    summary: summarize(listeners, clusters),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors contour/flux pattern)
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
      if (options?.treat404AsEmpty && resp.status === 404) {
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

async function fetchEnvoyStatus(): Promise<EnvoyStatusData> {
  const result = await fetchJson<EnvoyStatusResponse>(
    ENVOY_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch Envoy status')
  }

  const body = result.data
  const listeners = Array.isArray(body?.listeners) ? body.listeners : []
  const clusters = Array.isArray(body?.clusters) ? body.clusters : []
  const stats: EnvoyStats = {
    requestsPerSecond: body?.stats?.requestsPerSecond ?? 0,
    activeConnections: body?.stats?.activeConnections ?? 0,
    totalRequests: body?.stats?.totalRequests ?? 0,
    http5xxRate: body?.stats?.http5xxRate ?? 0,
  }

  return buildEnvoyStatus(listeners, clusters, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedEnvoyResult {
  data: EnvoyStatusData
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

export function useCachedEnvoy(): UseCachedEnvoyResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<EnvoyStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: ENVOY_DEMO_DATA,
    persist: true,
    fetcher: fetchEnvoyStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when Envoy isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.listeners.length > 0 || data.clusters.length > 0

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
  buildEnvoyStatus,
}
