/**
 * SPIFFE Status Hook — Data fetching for the spiffe_status card.
 *
 * Mirrors the linkerd / envoy / contour pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real SPIRE server bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  SPIFFE_DEMO_DATA,
  type SpiffeFederatedDomain,
  type SpiffeRegistrationEntry,
  type SpiffeStats,
  type SpiffeStatusData,
  type SpiffeSummary,
} from '../components/cards/spiffe_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'spiffe-status'
const SPIFFE_STATUS_ENDPOINT = '/api/spiffe/status'
const DEFAULT_SERVER_VERSION = 'unknown'
const DEFAULT_TRUST_DOMAIN = ''

const EMPTY_STATS: SpiffeStats = {
  x509SvidCount: 0,
  jwtSvidCount: 0,
  registrationEntryCount: 0,
  agentCount: 0,
  serverVersion: DEFAULT_SERVER_VERSION,
}

const EMPTY_SUMMARY: SpiffeSummary = {
  trustDomain: DEFAULT_TRUST_DOMAIN,
  totalSvids: 0,
  totalFederatedDomains: 0,
  totalEntries: 0,
}

const INITIAL_DATA: SpiffeStatusData = {
  health: 'not-installed',
  entries: [],
  federatedDomains: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/spiffe/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface SpiffeStatusResponse {
  trustDomain?: string
  entries?: SpiffeRegistrationEntry[]
  federatedDomains?: SpiffeFederatedDomain[]
  stats?: Partial<SpiffeStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
  stats: SpiffeStats,
): SpiffeSummary {
  return {
    trustDomain,
    totalSvids: stats.x509SvidCount + stats.jwtSvidCount,
    totalFederatedDomains: federatedDomains.length,
    totalEntries: entries.length,
  }
}

function deriveHealth(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
): SpiffeStatusData['health'] {
  if (!trustDomain && entries.length === 0) {
    return 'not-installed'
  }
  const hasFailedFederation = federatedDomains.some(d => d.status === 'failed')
  return hasFailedFederation ? 'degraded' : 'healthy'
}

function buildSpiffeStatus(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
  stats: SpiffeStats,
): SpiffeStatusData {
  return {
    health: deriveHealth(trustDomain, entries, federatedDomains),
    entries,
    federatedDomains,
    stats,
    summary: summarize(trustDomain, entries, federatedDomains, stats),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors envoy/contour/linkerd pattern)
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

async function fetchSpiffeStatus(): Promise<SpiffeStatusData> {
  const result = await fetchJson<SpiffeStatusResponse>(
    SPIFFE_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch SPIFFE status')
  }

  const body = result.data
  const trustDomain = body?.trustDomain ?? DEFAULT_TRUST_DOMAIN
  const entries = Array.isArray(body?.entries) ? body.entries : []
  const federatedDomains = Array.isArray(body?.federatedDomains)
    ? body.federatedDomains
    : []
  const stats: SpiffeStats = {
    x509SvidCount: body?.stats?.x509SvidCount ?? 0,
    jwtSvidCount: body?.stats?.jwtSvidCount ?? 0,
    registrationEntryCount: body?.stats?.registrationEntryCount ?? entries.length,
    agentCount: body?.stats?.agentCount ?? 0,
    serverVersion: body?.stats?.serverVersion ?? DEFAULT_SERVER_VERSION,
  }

  return buildSpiffeStatus(trustDomain, entries, federatedDomains, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedSpiffeResult {
  data: SpiffeStatusData
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

export function useCachedSpiffe(): UseCachedSpiffeResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<SpiffeStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: SPIFFE_DEMO_DATA,
    persist: true,
    fetcher: fetchSpiffeStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when SPIRE isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : (data.entries ?? []).length > 0

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
  buildSpiffeStatus,
}
