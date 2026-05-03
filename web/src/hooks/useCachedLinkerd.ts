/**
 * Linkerd Service Mesh Status Hook — Data fetching for the linkerd_status card.
 *
 * Mirrors the envoy_status / contour_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real Linkerd Viz bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  LINKERD_DEMO_DATA,
  type LinkerdMeshedDeployment,
  type LinkerdStats,
  type LinkerdStatusData,
} from '../components/cards/linkerd_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'linkerd-status'
const LINKERD_STATUS_ENDPOINT = '/api/linkerd/status'
const DEFAULT_CONTROL_PLANE_VERSION = 'unknown'
const FULLY_MESHED_SUCCESS_THRESHOLD_PCT = 99.0

const EMPTY_STATS: LinkerdStats = {
  totalRps: 0,
  avgSuccessRatePct: 0,
  avgP99LatencyMs: 0,
  controlPlaneVersion: DEFAULT_CONTROL_PLANE_VERSION,
}

const INITIAL_DATA: LinkerdStatusData = {
  health: 'not-installed',
  deployments: [],
  stats: EMPTY_STATS,
  summary: {
    totalDeployments: 0,
    fullyMeshedDeployments: 0,
    totalMeshedPods: 0,
    totalPods: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/linkerd/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface LinkerdStatusResponse {
  deployments?: LinkerdMeshedDeployment[]
  stats?: Partial<LinkerdStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(deployments: LinkerdMeshedDeployment[]) {
  const totalDeployments = deployments.length
  const fullyMeshedDeployments = deployments.filter(d => d.status === 'meshed').length
  const totalMeshedPods = deployments.reduce((sum, d) => sum + d.meshedPods, 0)
  const totalPods = deployments.reduce((sum, d) => sum + d.totalPods, 0)
  return { totalDeployments, fullyMeshedDeployments, totalMeshedPods, totalPods }
}

function deriveHealth(
  deployments: LinkerdMeshedDeployment[],
): LinkerdStatusData['health'] {
  if (deployments.length === 0) {
    return 'not-installed'
  }
  const hasUnhealthy = deployments.some(
    d =>
      d.status !== 'meshed' ||
      d.successRatePct < FULLY_MESHED_SUCCESS_THRESHOLD_PCT,
  )
  return hasUnhealthy ? 'degraded' : 'healthy'
}

function buildLinkerdStatus(
  deployments: LinkerdMeshedDeployment[],
  stats: LinkerdStats,
): LinkerdStatusData {
  return {
    health: deriveHealth(deployments),
    deployments,
    stats,
    summary: summarize(deployments),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors envoy/contour pattern)
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

async function fetchLinkerdStatus(): Promise<LinkerdStatusData> {
  const result = await fetchJson<LinkerdStatusResponse>(
    LINKERD_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch Linkerd status')
  }

  const body = result.data
  const deployments = Array.isArray(body?.deployments) ? body.deployments : []
  const stats: LinkerdStats = {
    totalRps: body?.stats?.totalRps ?? 0,
    avgSuccessRatePct: body?.stats?.avgSuccessRatePct ?? 0,
    avgP99LatencyMs: body?.stats?.avgP99LatencyMs ?? 0,
    controlPlaneVersion: body?.stats?.controlPlaneVersion ?? DEFAULT_CONTROL_PLANE_VERSION,
  }

  return buildLinkerdStatus(deployments, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedLinkerdResult {
  data: LinkerdStatusData
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

export function useCachedLinkerd(): UseCachedLinkerdResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<LinkerdStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: LINKERD_DEMO_DATA,
    persist: true,
    fetcher: fetchLinkerdStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when Linkerd isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.deployments.length > 0

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
  buildLinkerdStatus,
}
