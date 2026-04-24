/**
 * CNI Status Hook — Data fetching for the cni_status card.
 *
 * Mirrors the spiffe / linkerd / envoy pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real CNI inspection bridge lands,
 *   at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  CNI_DEMO_DATA,
  type CniHealth,
  type CniNodeStatus,
  type CniPlugin,
  type CniStats,
  type CniStatusData,
  type CniSummary,
} from '../lib/demo/cni'

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cni-status'
const CNI_STATUS_ENDPOINT = '/api/cni/status'

const DEFAULT_PLUGIN: CniPlugin = 'unknown'
const DEFAULT_PLUGIN_VERSION = 'unknown'
const DEFAULT_POD_CIDR = ''
const DEFAULT_SERVICE_CIDR = ''
const DEFAULT_COUNT = 0

const EMPTY_STATS: CniStats = {
  activePlugin: DEFAULT_PLUGIN,
  pluginVersion: DEFAULT_PLUGIN_VERSION,
  podNetworkCidr: DEFAULT_POD_CIDR,
  serviceNetworkCidr: DEFAULT_SERVICE_CIDR,
  nodeCount: DEFAULT_COUNT,
  nodesCniReady: DEFAULT_COUNT,
  networkPolicyCount: DEFAULT_COUNT,
  servicesWithNetworkPolicy: DEFAULT_COUNT,
  totalServices: DEFAULT_COUNT,
  podsWithIp: DEFAULT_COUNT,
  totalPods: DEFAULT_COUNT,
}

const EMPTY_SUMMARY: CniSummary = {
  activePlugin: DEFAULT_PLUGIN,
  pluginVersion: DEFAULT_PLUGIN_VERSION,
  podNetworkCidr: DEFAULT_POD_CIDR,
  nodesCniReady: DEFAULT_COUNT,
  nodeCount: DEFAULT_COUNT,
  networkPolicyCount: DEFAULT_COUNT,
  servicesWithNetworkPolicy: DEFAULT_COUNT,
}

const INITIAL_DATA: CniStatusData = {
  health: 'not-installed',
  nodes: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/cni/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface CniStatusResponse {
  activePlugin?: CniPlugin
  pluginVersion?: string
  podNetworkCidr?: string
  serviceNetworkCidr?: string
  nodes?: CniNodeStatus[]
  stats?: Partial<CniStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  stats: CniStats,
): CniSummary {
  return {
    activePlugin: stats.activePlugin,
    pluginVersion: stats.pluginVersion,
    podNetworkCidr: stats.podNetworkCidr,
    nodesCniReady: stats.nodesCniReady,
    nodeCount: stats.nodeCount,
    networkPolicyCount: stats.networkPolicyCount,
    servicesWithNetworkPolicy: stats.servicesWithNetworkPolicy,
  }
}

function deriveHealth(
  stats: CniStats,
  nodes: CniNodeStatus[],
): CniHealth {
  if (stats.activePlugin === 'unknown' && nodes.length === 0) {
    return 'not-installed'
  }
  const hasUnreadyNode = nodes.some(n => n.state !== 'ready')
  if (hasUnreadyNode) return 'degraded'
  if (stats.nodeCount > 0 && stats.nodesCniReady < stats.nodeCount) {
    return 'degraded'
  }
  return 'healthy'
}

function buildCniStatus(
  stats: CniStats,
  nodes: CniNodeStatus[],
): CniStatusData {
  return {
    health: deriveHealth(stats, nodes),
    nodes,
    stats,
    summary: summarize(stats),
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

async function fetchCniStatus(): Promise<CniStatusData> {
  const result = await fetchJson<CniStatusResponse>(
    CNI_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch CNI status')
  }

  const body = result.data
  const nodes = Array.isArray(body?.nodes) ? body.nodes : []
  const stats: CniStats = {
    activePlugin: body?.stats?.activePlugin ?? body?.activePlugin ?? DEFAULT_PLUGIN,
    pluginVersion:
      body?.stats?.pluginVersion ?? body?.pluginVersion ?? DEFAULT_PLUGIN_VERSION,
    podNetworkCidr:
      body?.stats?.podNetworkCidr ?? body?.podNetworkCidr ?? DEFAULT_POD_CIDR,
    serviceNetworkCidr:
      body?.stats?.serviceNetworkCidr
      ?? body?.serviceNetworkCidr
      ?? DEFAULT_SERVICE_CIDR,
    nodeCount: body?.stats?.nodeCount ?? nodes.length,
    nodesCniReady:
      body?.stats?.nodesCniReady
      ?? nodes.filter(n => n.state === 'ready').length,
    networkPolicyCount: body?.stats?.networkPolicyCount ?? DEFAULT_COUNT,
    servicesWithNetworkPolicy:
      body?.stats?.servicesWithNetworkPolicy ?? DEFAULT_COUNT,
    totalServices: body?.stats?.totalServices ?? DEFAULT_COUNT,
    podsWithIp: body?.stats?.podsWithIp ?? DEFAULT_COUNT,
    totalPods: body?.stats?.totalPods ?? DEFAULT_COUNT,
  }

  return buildCniStatus(stats, nodes)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedCniResult {
  data: CniStatusData
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

export function useCachedCni(): UseCachedCniResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<CniStatusData>({
    key: CACHE_KEY,
    category: 'services',
    initialData: INITIAL_DATA,
    demoData: CNI_DEMO_DATA,
    persist: true,
    fetcher: fetchCniStatus,
  })

  // Prevent demo flash while loading — only surface the Demo badge once
  // we've actually fallen back to demo data post-load.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "data" so the card shows the empty state
  // rather than an infinite skeleton when CNI metadata isn't available.
  const hasAnyData =
    data.health === 'not-installed' ? true : (data.nodes ?? []).length > 0

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
  buildCniStatus,
}
