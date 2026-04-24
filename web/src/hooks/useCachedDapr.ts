/**
 * Dapr Status Hook — Data fetching for the dapr_status card.
 *
 * Mirrors the envoy_status / contour_status pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real Dapr control plane bridge
 *   lands, at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  DAPR_DEMO_DATA,
  type DaprAppSidecar,
  type DaprBuildingBlockCounts,
  type DaprComponent,
  type DaprControlPlanePod,
  type DaprStatusData,
  type DaprSummary,
} from '../components/cards/dapr_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'dapr-status'
const DAPR_STATUS_ENDPOINT = '/api/dapr/status'

const EMPTY_APPS: DaprAppSidecar = {
  total: 0,
  namespaces: 0,
}

const EMPTY_BUILDING_BLOCKS: DaprBuildingBlockCounts = {
  stateStores: 0,
  pubsubs: 0,
  bindings: 0,
}

const INITIAL_DATA: DaprStatusData = {
  health: 'not-installed',
  controlPlane: [],
  components: [],
  apps: EMPTY_APPS,
  buildingBlocks: EMPTY_BUILDING_BLOCKS,
  summary: {
    totalControlPlanePods: 0,
    runningControlPlanePods: 0,
    totalComponents: 0,
    totalDaprApps: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/dapr/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface DaprStatusResponse {
  controlPlane?: DaprControlPlanePod[]
  components?: DaprComponent[]
  apps?: Partial<DaprAppSidecar>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function countByType(
  components: DaprComponent[],
  type: DaprComponent['type'],
): number {
  return components.filter(c => c.type === type).length
}

function summarize(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprSummary {
  return {
    totalControlPlanePods: controlPlane.length,
    runningControlPlanePods: controlPlane.filter(p => p.status === 'running').length,
    totalComponents: components.length,
    totalDaprApps: apps.total,
  }
}

function buildBuildingBlocks(components: DaprComponent[]): DaprBuildingBlockCounts {
  return {
    stateStores: countByType(components, 'state-store'),
    pubsubs: countByType(components, 'pubsub'),
    bindings: countByType(components, 'binding'),
  }
}

function deriveHealth(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprStatusData['health'] {
  if (controlPlane.length === 0 && components.length === 0 && apps.total === 0) {
    return 'not-installed'
  }
  const hasDegradedControlPlane = controlPlane.some(
    p => p.status !== 'running' || p.replicasReady < p.replicasDesired,
  )
  if (hasDegradedControlPlane) {
    return 'degraded'
  }
  return 'healthy'
}

function buildDaprStatus(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprStatusData {
  return {
    health: deriveHealth(controlPlane, components, apps),
    controlPlane,
    components,
    apps,
    buildingBlocks: buildBuildingBlocks(components),
    summary: summarize(controlPlane, components, apps),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors contour/flux/envoy pattern)
// ---------------------------------------------------------------------------

/** HTTP statuses that indicate "endpoint not available" — treat as empty, not
 *  as a hard failure. 401/403 cover unauthenticated/demo visitors hitting
 *  the JWT-protected /api group; 404/501/503 cover Netlify SPA fallback and
 *  the MSW catch-all (#9933). */
const NOT_INSTALLED_STATUSES = new Set<number>([401, 403, 404, 501, 503])

async function fetchJson<T>(
  url: string,
): Promise<FetchResult<T | null>> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
      if (NOT_INSTALLED_STATUSES.has(resp.status)) {
        return { data: null, failed: false }
      }
      return { data: null, failed: true }
    }

    // Defensive JSON parse — Netlify SPA fallback may return text/html (#9933)
    let body: T
    try {
      body = (await resp.json()) as T
    } catch {
      return { data: null, failed: false }
    }
    return { data: body, failed: false }
  } catch {
    return { data: null, failed: true }
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchDaprStatus(): Promise<DaprStatusData> {
  const result = await fetchJson<DaprStatusResponse>(
    DAPR_STATUS_ENDPOINT,
  )

  if (result.failed) {
    throw new Error('Unable to fetch Dapr status')
  }

  const body = result.data
  const controlPlane = Array.isArray(body?.controlPlane) ? body.controlPlane : []
  const components = Array.isArray(body?.components) ? body.components : []
  const apps: DaprAppSidecar = {
    total: body?.apps?.total ?? 0,
    namespaces: body?.apps?.namespaces ?? 0,
  }

  return buildDaprStatus(controlPlane, components, apps)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedDaprResult {
  data: DaprStatusData
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

export function useCachedDapr(): UseCachedDaprResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<DaprStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: DAPR_DEMO_DATA,
    persist: true,
    fetcher: fetchDaprStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when Dapr isn't present.
  const hasAnyData =
    data.health === 'not-installed'
      ? true
      : data.controlPlane.length > 0 || data.components.length > 0

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
  buildDaprStatus,
  buildBuildingBlocks,
  countByType,
}
