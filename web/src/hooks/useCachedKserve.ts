/**
 * KServe Status Hook — Data fetching for the kserve_status card.
 *
 * Mirrors the dapr_status / tuf_status / spiffe_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real KServe control-plane bridge
 *   lands at `/api/kserve/status`, at which point useCache will transparently
 *   switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 *
 * Source: kubestellar/console-marketplace#38
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  KSERVE_DEMO_DATA,
  type KServeControllerPods,
  type KServeHealth,
  type KServeService,
  type KServeServiceStatus,
  type KServeStatusData,
  type KServeSummary,
} from '../lib/demo/kserve'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kserve-status'
const KSERVE_STATUS_ENDPOINT = '/api/kserve/status'
const NOT_FOUND_STATUS = 404
const PERCENT_ROUND_MULTIPLIER = 10

const EMPTY_CONTROLLER_PODS: KServeControllerPods = {
  ready: 0,
  total: 0,
}

const EMPTY_SUMMARY: KServeSummary = {
  totalServices: 0,
  readyServices: 0,
  notReadyServices: 0,
  totalRequestsPerSecond: 0,
  avgP95LatencyMs: 0,
}

const INITIAL_DATA: KServeStatusData = {
  health: 'not-installed',
  controllerPods: EMPTY_CONTROLLER_PODS,
  services: [],
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/kserve/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface KServeStatusResponse {
  controllerPods?: Partial<KServeControllerPods>
  services?: KServeService[]
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function countByStatus(
  services: KServeService[],
  status: KServeServiceStatus,
): number {
  return (services ?? []).filter(s => s.status === status).length
}

function summarize(services: KServeService[]): KServeSummary {
  const safeServices = services ?? []
  const totalRps = safeServices.reduce(
    (sum, s) => sum + (Number.isFinite(s.requestsPerSecond) ? s.requestsPerSecond : 0),
    0,
  )
  const totalLatency = safeServices.reduce(
    (sum, s) => sum + (Number.isFinite(s.p95LatencyMs) ? s.p95LatencyMs : 0),
    0,
  )
  const avgLatency =
    safeServices.length > 0 ? Math.round(totalLatency / safeServices.length) : 0
  return {
    totalServices: safeServices.length,
    readyServices: countByStatus(safeServices, 'ready'),
    notReadyServices: countByStatus(safeServices, 'not-ready'),
    totalRequestsPerSecond:
      Math.round(totalRps * PERCENT_ROUND_MULTIPLIER) / PERCENT_ROUND_MULTIPLIER,
    avgP95LatencyMs: avgLatency,
  }
}

function deriveHealth(
  controllerPods: KServeControllerPods,
  services: KServeService[],
): KServeHealth {
  // Nothing discovered at all → KServe is not installed in the connected
  // clusters. The card shows the "KServe not detected" empty state.
  if (controllerPods.total === 0 && (services ?? []).length === 0) {
    return 'not-installed'
  }
  const controllerDegraded = controllerPods.ready < controllerPods.total
  const serviceDegraded = (services ?? []).some(s => s.status !== 'ready')
  if (controllerDegraded || serviceDegraded) {
    return 'degraded'
  }
  return 'healthy'
}

function buildKserveStatus(
  controllerPods: KServeControllerPods,
  services: KServeService[],
): KServeStatusData {
  const safeServices = services ?? []
  return {
    health: deriveHealth(controllerPods, safeServices),
    controllerPods,
    services: safeServices,
    summary: summarize(safeServices),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors dapr/spiffe pattern)
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

async function fetchKserveStatus(): Promise<KServeStatusData> {
  const result = await fetchJson<KServeStatusResponse>(
    KSERVE_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch KServe status')
  }

  const body = result.data
  const controllerPods: KServeControllerPods = {
    ready: body?.controllerPods?.ready ?? 0,
    total: body?.controllerPods?.total ?? 0,
  }
  const services = Array.isArray(body?.services) ? body.services : []

  return buildKserveStatus(controllerPods, services)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedKserveResult {
  data: KServeStatusData
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

export function useCachedKserve(): UseCachedKserveResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<KServeStatusData>({
    key: CACHE_KEY,
    category: 'ai-ml',
    initialData: INITIAL_DATA,
    demoData: KSERVE_DEMO_DATA,
    persist: true,
    fetcher: fetchKserveStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when KServe isn't present.
  const hasAnyData =
    data.health === 'not-installed'
      ? true
      : (data.services ?? []).length > 0 || data.controllerPods.total > 0

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
  countByStatus,
  summarize,
  deriveHealth,
  buildKserveStatus,
}
