/**
 * OpenFGA Status Hook — Data fetching for the openfga_status card.
 *
 * Mirrors the spiffe / linkerd / envoy / contour pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real OpenFGA server bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  OPENFGA_DEMO_DATA,
  type OpenfgaApiRps,
  type OpenfgaAuthorizationModel,
  type OpenfgaLatencyMs,
  type OpenfgaStats,
  type OpenfgaStatusData,
  type OpenfgaStore,
  type OpenfgaSummary,
} from '../components/cards/openfga_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'openfga-status'
const OPENFGA_STATUS_ENDPOINT = '/api/openfga/status'
const DEFAULT_SERVER_VERSION = 'unknown'
const DEFAULT_ENDPOINT = ''

const EMPTY_RPS: OpenfgaApiRps = {
  check: 0,
  expand: 0,
  listObjects: 0,
}

const EMPTY_LATENCY: OpenfgaLatencyMs = {
  p50: 0,
  p95: 0,
  p99: 0,
}

const EMPTY_STATS: OpenfgaStats = {
  totalTuples: 0,
  totalStores: 0,
  totalModels: 0,
  serverVersion: DEFAULT_SERVER_VERSION,
  rps: EMPTY_RPS,
  latency: EMPTY_LATENCY,
}

const EMPTY_SUMMARY: OpenfgaSummary = {
  endpoint: DEFAULT_ENDPOINT,
  totalTuples: 0,
  totalStores: 0,
  totalModels: 0,
}

const INITIAL_DATA: OpenfgaStatusData = {
  health: 'not-installed',
  stores: [],
  models: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/openfga/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface OpenfgaStatusResponse {
  endpoint?: string
  stores?: OpenfgaStore[]
  models?: OpenfgaAuthorizationModel[]
  stats?: Partial<Omit<OpenfgaStats, 'rps' | 'latency'>> & {
    rps?: Partial<OpenfgaApiRps>
    latency?: Partial<OpenfgaLatencyMs>
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sumTuples(stores: OpenfgaStore[]): number {
  return stores.reduce((acc, store) => acc + (store.tupleCount ?? 0), 0)
}

function summarize(
  endpoint: string,
  stores: OpenfgaStore[],
  models: OpenfgaAuthorizationModel[],
  stats: OpenfgaStats,
): OpenfgaSummary {
  return {
    endpoint,
    totalTuples: stats.totalTuples || sumTuples(stores),
    totalStores: stores.length,
    totalModels: models.length,
  }
}

function deriveHealth(
  endpoint: string,
  stores: OpenfgaStore[],
): OpenfgaStatusData['health'] {
  if (!endpoint && stores.length === 0) {
    return 'not-installed'
  }
  const hasDrainingStore = stores.some(s => s.status === 'draining')
  return hasDrainingStore ? 'degraded' : 'healthy'
}

function buildOpenfgaStatus(
  endpoint: string,
  stores: OpenfgaStore[],
  models: OpenfgaAuthorizationModel[],
  stats: OpenfgaStats,
): OpenfgaStatusData {
  return {
    health: deriveHealth(endpoint, stores),
    stores,
    models,
    stats,
    summary: summarize(endpoint, stores, models, stats),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors spiffe/envoy/contour/linkerd pattern)
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

async function fetchOpenfgaStatus(): Promise<OpenfgaStatusData> {
  const result = await fetchJson<OpenfgaStatusResponse>(
    OPENFGA_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch OpenFGA status')
  }

  const body = result.data
  const endpoint = body?.endpoint ?? DEFAULT_ENDPOINT
  const stores = Array.isArray(body?.stores) ? body.stores : []
  const models = Array.isArray(body?.models) ? body.models : []

  const rps: OpenfgaApiRps = {
    check: body?.stats?.rps?.check ?? 0,
    expand: body?.stats?.rps?.expand ?? 0,
    listObjects: body?.stats?.rps?.listObjects ?? 0,
  }

  const latency: OpenfgaLatencyMs = {
    p50: body?.stats?.latency?.p50 ?? 0,
    p95: body?.stats?.latency?.p95 ?? 0,
    p99: body?.stats?.latency?.p99 ?? 0,
  }

  const stats: OpenfgaStats = {
    totalTuples: body?.stats?.totalTuples ?? sumTuples(stores),
    totalStores: body?.stats?.totalStores ?? stores.length,
    totalModels: body?.stats?.totalModels ?? models.length,
    serverVersion: body?.stats?.serverVersion ?? DEFAULT_SERVER_VERSION,
    rps,
    latency,
  }

  return buildOpenfgaStatus(endpoint, stores, models, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedOpenfgaResult {
  data: OpenfgaStatusData
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

export function useCachedOpenfga(): UseCachedOpenfgaResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<OpenfgaStatusData>({
    key: CACHE_KEY,
    category: 'rbac',
    initialData: INITIAL_DATA,
    demoData: OPENFGA_DEMO_DATA,
    persist: true,
    fetcher: fetchOpenfgaStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when OpenFGA isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : (data.stores ?? []).length > 0

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
  sumTuples,
  summarize,
  deriveHealth,
  buildOpenfgaStatus,
}
