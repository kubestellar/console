/**
 * Contour Status Hook — Data fetching for the contour_status card.
 *
 * Mirrors useFluxStatus.ts line-for-line:
 * - useCache with fetcher pattern
 * - isDemoFallback for demo detection
 * - fetchJson private helper with treat404AsEmpty
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import {
  CONTOUR_DEMO_DATA,
  type ContourProxyStatus,
  type ContourEnvoyFleet,
  type ContourStatusData,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'contour-status'

const INITIAL_DATA: ContourStatusData = {
  health: 'not-installed',
  proxies: [],
  envoyFleet: { total: 0, ready: 0, notReady: 0 },
  summary: { totalProxies: 0, validProxies: 0, invalidProxies: 0 },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface CustomResourceItem {
  name: string
  namespace?: string
  cluster?: string
  status?: Record<string, unknown>
}

interface CustomResourceResponse {
  items?: CustomResourceItem[]
}

interface DaemonSetItem {
  name: string
  namespace?: string
  cluster?: string
  status?: {
    desiredNumberScheduled?: number
    numberReady?: number
  }
}

interface DaemonSetResponse {
  items?: DaemonSetItem[]
}

// ---------------------------------------------------------------------------
// Pure helpers (exported via __testables for unit testing)
// ---------------------------------------------------------------------------

function summarize(proxies: ContourProxyStatus[]) {
  const total = proxies.length
  const valid = proxies.filter(p => p.status === 'Valid').length
  return {
    totalProxies: total,
    validProxies: valid,
    invalidProxies: total - valid,
  }
}

function getReadyCondition(status?: Record<string, unknown>): { ready: boolean; reason?: string } {
  const conditions = Array.isArray(status?.conditions) ? status.conditions : []
  for (const condition of conditions) {
    const c = condition as Record<string, unknown>
    if (c.type !== 'Valid') continue
    const state = typeof c.status === 'string' ? c.status : ''
    return {
      ready: state === 'True',
      reason: typeof c.reason === 'string' ? c.reason : undefined,
    }
  }
  return { ready: false }
}

function isProxyValid(status: string | undefined): boolean {
  return (status || '').toLowerCase() === 'valid'
}

function buildContourStatus(
  proxies: ContourProxyStatus[],
  envoyFleet: ContourEnvoyFleet,
): ContourStatusData {
  const summary = summarize(proxies)

  let health: ContourStatusData['health'] = 'healthy'
  if (summary.totalProxies === 0) {
    health = 'not-installed'
  } else if (summary.invalidProxies > 0) {
    health = 'degraded'
  }

  return {
    health,
    proxies,
    envoyFleet,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors Flux lines 106–128)
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
// Fetch functions
// ---------------------------------------------------------------------------

async function fetchHTTPProxies(): Promise<FetchResult<ContourProxyStatus[]>> {
  const params = new URLSearchParams({
    group: 'projectcontour.io',
    version: 'v1',
    resource: 'httpproxies',
  })

  const result = await fetchJson<CustomResourceResponse>(
    `/api/mcp/custom-resources?${params.toString()}`,
    { treat404AsEmpty: true },
  )

  const items = result.data?.items || []
  return {
    failed: result.failed,
    data: items.map(item => {
      const condition = getReadyCondition(item.status)
      const fqdn = typeof item.status?.virtualhost === 'object'
        ? ((item.status.virtualhost as Record<string, unknown>)?.fqdn as string || '')
        : ''

      return {
        name: item.name,
        namespace: item.namespace || 'default',
        cluster: item.cluster || 'default',
        fqdn,
        status: condition.ready ? 'Valid' as const : 'Invalid' as const,
        conditions: condition.reason ? [condition.reason] : [],
      }
    }),
  }
}

async function fetchEnvoyDaemonSets(): Promise<FetchResult<ContourEnvoyFleet>> {
  const params = new URLSearchParams({
    group: 'apps',
    version: 'v1',
    resource: 'daemonsets',
  })

  const result = await fetchJson<DaemonSetResponse>(
    `/api/mcp/custom-resources?${params.toString()}`,
    { treat404AsEmpty: true },
  )

  const items = (result.data?.items || []).filter(item =>
    item.name.toLowerCase().includes('envoy'),
  )

  let total = 0
  let ready = 0
  for (const item of items) {
    const desired = item.status?.desiredNumberScheduled || 0
    const readyCount = item.status?.numberReady || 0
    total += desired
    ready += readyCount
  }

  return {
    failed: result.failed,
    data: { total, ready, notReady: total - ready },
  }
}

async function fetchContourStatus(): Promise<ContourStatusData> {
  const [proxyResult, envoyResult] = await Promise.all([
    fetchHTTPProxies(),
    fetchEnvoyDaemonSets(),
  ])

  // Only throw if ALL endpoints failed (mirrors Flux line 238 pattern)
  if (proxyResult.failed && envoyResult.failed) {
    throw new Error('Unable to fetch Contour status')
  }

  return buildContourStatus(proxyResult.data || [], envoyResult.data || { total: 0, ready: 0, notReady: 0 })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseContourStatusResult {
  data: ContourStatusData
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useContourStatus(): UseContourStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<ContourStatusData>({
      key: CACHE_KEY,
      category: 'services',
      initialData: INITIAL_DATA,
      demoData: CONTOUR_DEMO_DATA,
      persist: true,
      fetcher: fetchContourStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  // CRITICAL: 'not-installed' must be treated as hasAnyData=true
  // to prevent infinite skeleton when Contour is not installed
  const hasAnyData = data.health === 'not-installed' ? true : data.summary.totalProxies > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  getReadyCondition,
  isProxyValid,
  buildContourStatus,
}
