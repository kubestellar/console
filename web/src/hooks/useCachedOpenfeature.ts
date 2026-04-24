/**
 * OpenFeature Status Hook — Data fetching for the openfeature_status card.
 *
 * Mirrors the spiffe / linkerd / envoy / contour pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (the `/api/openfeature/status`
 *   endpoint may not be wired up on every backend — a 404 is treated as
 *   "not installed" rather than a failure, which cleanly surfaces the demo
 *   fallback through useCache's demoData path)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  OPENFEATURE_DEMO_DATA,
  type OpenFeatureFlag,
  type OpenFeatureFlagStats,
  type OpenFeatureProvider,
  type OpenFeatureStatusData,
} from '../components/cards/openfeature_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'openfeature-status'
const OPENFEATURE_STATUS_ENDPOINT = '/api/openfeature/status'
const DEFAULT_ERROR_RATE_PCT = 0
const DEFAULT_TOTAL_EVALUATIONS = 0

const EMPTY_FLAG_STATS: OpenFeatureFlagStats = {
  total: 0,
  enabled: 0,
  disabled: 0,
  errorRate: DEFAULT_ERROR_RATE_PCT,
}

const INITIAL_DATA: OpenFeatureStatusData = {
  health: 'not-installed',
  providers: [],
  flags: [],
  featureFlags: EMPTY_FLAG_STATS,
  totalEvaluations: DEFAULT_TOTAL_EVALUATIONS,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/openfeature/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface OpenFeatureStatusResponse {
  providers?: OpenFeatureProvider[]
  flags?: OpenFeatureFlag[]
  featureFlags?: Partial<OpenFeatureFlagStats>
  totalEvaluations?: number
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function rollupFlagStats(flags: OpenFeatureFlag[]): OpenFeatureFlagStats {
  let enabled = 0
  let disabled = 0
  for (const flag of flags ?? []) {
    if (flag.enabled) {
      enabled++
    } else {
      disabled++
    }
  }
  return {
    total: (flags ?? []).length,
    enabled,
    disabled,
    errorRate: DEFAULT_ERROR_RATE_PCT,
  }
}

function sumProviderEvaluations(providers: OpenFeatureProvider[]): number {
  let total = 0
  for (const provider of providers ?? []) {
    total += provider.evaluations
  }
  return total
}

function deriveHealth(
  providers: OpenFeatureProvider[],
  flags: OpenFeatureFlag[],
): OpenFeatureStatusData['health'] {
  const providerList = providers ?? []
  const flagList = flags ?? []
  if (providerList.length === 0 && flagList.length === 0) {
    return 'not-installed'
  }
  const hasUnhealthy = providerList.some(
    p => p.status === 'unhealthy' || p.status === 'degraded',
  )
  return hasUnhealthy ? 'degraded' : 'healthy'
}

function buildOpenFeatureStatus(
  providers: OpenFeatureProvider[],
  flags: OpenFeatureFlag[],
  featureFlags: OpenFeatureFlagStats,
  totalEvaluations: number,
): OpenFeatureStatusData {
  return {
    health: deriveHealth(providers, flags),
    providers,
    flags,
    featureFlags,
    totalEvaluations,
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

async function fetchOpenFeatureStatus(): Promise<OpenFeatureStatusData> {
  const result = await fetchJson<OpenFeatureStatusResponse>(
    OPENFEATURE_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch OpenFeature status')
  }

  const body = result.data
  const providers = Array.isArray(body?.providers) ? body.providers : []
  const flags = Array.isArray(body?.flags) ? body.flags : []
  const rolled = rollupFlagStats(flags)
  const featureFlags: OpenFeatureFlagStats = {
    total: body?.featureFlags?.total ?? rolled.total,
    enabled: body?.featureFlags?.enabled ?? rolled.enabled,
    disabled: body?.featureFlags?.disabled ?? rolled.disabled,
    errorRate: body?.featureFlags?.errorRate ?? DEFAULT_ERROR_RATE_PCT,
  }
  const totalEvaluations =
    body?.totalEvaluations ?? sumProviderEvaluations(providers)

  return buildOpenFeatureStatus(providers, flags, featureFlags, totalEvaluations)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedOpenfeatureResult {
  data: OpenFeatureStatusData
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

export function useCachedOpenfeature(): UseCachedOpenfeatureResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<OpenFeatureStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: OPENFEATURE_DEMO_DATA,
    persist: true,
    fetcher: fetchOpenFeatureStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when OpenFeature isn't present.
  const hasAnyData =
    data.health === 'not-installed'
      ? true
      : (data.providers ?? []).length > 0 || (data.flags ?? []).length > 0

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
  rollupFlagStats,
  sumProviderEvaluations,
  deriveHealth,
  buildOpenFeatureStatus,
}
