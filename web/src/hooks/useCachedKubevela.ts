/**
 * KubeVela Status Hook — Data fetching for the kubevela_status card.
 *
 * Mirrors the spiffe / dapr / envoy / linkerd pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real KubeVela bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 *
 * Source: kubestellar/console-marketplace#43
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  KUBEVELA_DEMO_DATA,
  type KubeVelaApplication,
  type KubeVelaAppStatus,
  type KubeVelaControllerPod,
  type KubeVelaStats,
  type KubeVelaStatusData,
  type KubeVelaSummary,
} from '../components/cards/kubevela_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kubevela-status'
const KUBEVELA_STATUS_ENDPOINT = '/api/kubevela/status'
const DEFAULT_CONTROLLER_VERSION = 'unknown'

const EMPTY_STATS: KubeVelaStats = {
  totalApplications: 0,
  runningApplications: 0,
  failedApplications: 0,
  totalComponents: 0,
  totalTraits: 0,
  controllerVersion: DEFAULT_CONTROLLER_VERSION,
}

const EMPTY_SUMMARY: KubeVelaSummary = {
  totalApplications: 0,
  runningApplications: 0,
  failedApplications: 0,
  totalControllerPods: 0,
  runningControllerPods: 0,
}

const INITIAL_DATA: KubeVelaStatusData = {
  health: 'not-installed',
  applications: [],
  controllerPods: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/kubevela/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface KubeVelaStatusResponse {
  applications?: KubeVelaApplication[]
  controllerPods?: KubeVelaControllerPod[]
  stats?: Partial<KubeVelaStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const FAILED_STATUSES: readonly KubeVelaAppStatus[] = [
  'workflowFailed',
  'unhealthy',
]

function countApps(
  applications: KubeVelaApplication[],
  predicate: (app: KubeVelaApplication) => boolean,
): number {
  return applications.filter(predicate).length
}

function countPods(
  pods: KubeVelaControllerPod[],
  predicate: (pod: KubeVelaControllerPod) => boolean,
): number {
  return pods.filter(predicate).length
}

function summarize(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
): KubeVelaSummary {
  return {
    totalApplications: applications.length,
    runningApplications: countApps(applications, a => a.status === 'running'),
    failedApplications: countApps(applications, a =>
      FAILED_STATUSES.includes(a.status),
    ),
    totalControllerPods: controllerPods.length,
    runningControllerPods: countPods(controllerPods, p => p.status === 'running'),
  }
}

function deriveHealth(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
): KubeVelaStatusData['health'] {
  if (applications.length === 0 && controllerPods.length === 0) {
    return 'not-installed'
  }
  const hasDegradedController = controllerPods.some(
    p => p.status !== 'running' || p.replicasReady < p.replicasDesired,
  )
  const hasFailedApp = applications.some(a =>
    FAILED_STATUSES.includes(a.status),
  )
  if (hasDegradedController || hasFailedApp) {
    return 'degraded'
  }
  return 'healthy'
}

function buildStats(
  applications: KubeVelaApplication[],
  controllerVersion: string,
): KubeVelaStats {
  return {
    totalApplications: applications.length,
    runningApplications: countApps(applications, a => a.status === 'running'),
    failedApplications: countApps(applications, a =>
      FAILED_STATUSES.includes(a.status),
    ),
    totalComponents: applications.reduce((sum, a) => sum + a.componentCount, 0),
    totalTraits: applications.reduce((sum, a) => sum + a.traitCount, 0),
    controllerVersion,
  }
}

function buildKubeVelaStatus(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
  controllerVersion: string,
): KubeVelaStatusData {
  return {
    health: deriveHealth(applications, controllerPods),
    applications,
    controllerPods,
    stats: buildStats(applications, controllerVersion),
    summary: summarize(applications, controllerPods),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors spiffe/dapr/envoy/contour pattern)
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

async function fetchKubeVelaStatus(): Promise<KubeVelaStatusData> {
  const result = await fetchJson<KubeVelaStatusResponse>(
    KUBEVELA_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch KubeVela status')
  }

  const body = result.data
  const applications = Array.isArray(body?.applications) ? body.applications : []
  const controllerPods = Array.isArray(body?.controllerPods)
    ? body.controllerPods
    : []
  const controllerVersion =
    body?.stats?.controllerVersion ?? DEFAULT_CONTROLLER_VERSION

  return buildKubeVelaStatus(applications, controllerPods, controllerVersion)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedKubevelaResult {
  data: KubeVelaStatusData
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

export function useCachedKubevela(): UseCachedKubevelaResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<KubeVelaStatusData>({
    key: CACHE_KEY,
    // KubeVela Application CRs are deployment-like — refresh at the same
    // cadence as Deployments/Services (60s). `workloads` is the UI category
    // on the card itself; `deployments` is the RefreshCategory for caching.
    category: 'deployments',
    initialData: INITIAL_DATA,
    demoData: KUBEVELA_DEMO_DATA,
    persist: true,
    fetcher: fetchKubeVelaStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when KubeVela isn't present.
  const hasAnyData =
    data.health === 'not-installed'
      ? true
      : (data.applications ?? []).length > 0 ||
        (data.controllerPods ?? []).length > 0

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
  countApps,
  countPods,
  summarize,
  deriveHealth,
  buildStats,
  buildKubeVelaStatus,
  FAILED_STATUSES,
}
