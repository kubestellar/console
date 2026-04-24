/**
 * gRPC Service Status Hook — Data fetching for the grpc_status card.
 *
 * Mirrors the envoy_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real gRPC Reflection / Channelz
 *   bridge lands, at which point useCache will transparently switch to
 *   live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  GRPC_DEMO_DATA,
  type GrpcService,
  type GrpcStats,
  type GrpcStatusData,
} from '../components/cards/grpc_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'grpc-status'
const GRPC_STATUS_ENDPOINT = '/api/grpc/status'

const EMPTY_STATS: GrpcStats = {
  totalRps: 0,
  avgLatencyP99Ms: 0,
  avgErrorRatePct: 0,
  reflectionEnabled: 0,
}

const INITIAL_DATA: GrpcStatusData = {
  health: 'not-installed',
  services: [],
  stats: EMPTY_STATS,
  summary: {
    totalServices: 0,
    servingServices: 0,
    totalEndpoints: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/grpc/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface GrpcStatusResponse {
  services?: GrpcService[]
  stats?: Partial<GrpcStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(services: GrpcService[]): GrpcStatusData['summary'] {
  const totalServices = services.length
  const servingServices = services.filter(s => s.status === 'serving').length
  const totalEndpoints = services.reduce((sum, s) => sum + s.endpoints, 0)
  return { totalServices, servingServices, totalEndpoints }
}

function deriveHealth(services: GrpcService[]): GrpcStatusData['health'] {
  if (services.length === 0) {
    return 'not-installed'
  }
  const hasNotServing = services.some(s => s.status !== 'serving')
  if (hasNotServing) {
    return 'degraded'
  }
  return 'healthy'
}

function buildGrpcStatus(
  services: GrpcService[],
  stats: GrpcStats,
): GrpcStatusData {
  return {
    health: deriveHealth(services),
    services,
    stats,
    summary: summarize(services),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors envoy/contour/flux pattern)
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

async function fetchGrpcStatus(): Promise<GrpcStatusData> {
  const result = await fetchJson<GrpcStatusResponse>(
    GRPC_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch gRPC status')
  }

  const body = result.data
  const services = Array.isArray(body?.services) ? body.services : []
  const stats: GrpcStats = {
    totalRps: body?.stats?.totalRps ?? 0,
    avgLatencyP99Ms: body?.stats?.avgLatencyP99Ms ?? 0,
    avgErrorRatePct: body?.stats?.avgErrorRatePct ?? 0,
    reflectionEnabled: body?.stats?.reflectionEnabled ?? 0,
  }

  return buildGrpcStatus(services, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedGrpcResult {
  data: GrpcStatusData
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

export function useCachedGrpc(): UseCachedGrpcResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<GrpcStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: GRPC_DEMO_DATA,
    persist: true,
    fetcher: fetchGrpcStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when gRPC services aren't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.services.length > 0

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
  buildGrpcStatus,
}
