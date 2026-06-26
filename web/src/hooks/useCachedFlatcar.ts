/**
 * Flatcar Container Linux Status Hook
 *
 * Mirrors the linkerd / envoy / spiffe pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (the dedicated /api/flatcar/status
 *   endpoint is scaffolding — until a real Flatcar update-operator bridge is
 *   wired up, fetches 404 and the cache layer surfaces demo data; once the
 *   endpoint exists, useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 *
 * The legacy local hook `components/cards/flatcar_status/useFlatcarStatus.ts`
 * is kept for the current FlatcarStatus component. This hook is the
 * standardized, reusable entry point — it shares the same cache key, so both
 * surfaces see identical data once wired up.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  FLATCAR_DEMO_DATA,
  type FlatcarChannel,
  type FlatcarNode,
  type FlatcarStats,
  type FlatcarStatusData,
  type FlatcarSummary,
} from '../lib/demo/flatcar'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'flatcar-status-v2'
const FLATCAR_STATUS_ENDPOINT = '/api/flatcar/status'
const DEFAULT_LATEST_VERSION = ''
const DEFAULT_TOTAL_CLUSTERS = 0

const EMPTY_STATS: FlatcarStats = {
  totalNodes: 0,
  upToDateNodes: 0,
  updateAvailableNodes: 0,
  rebootRequiredNodes: 0,
  channelsInUse: [],
}

const EMPTY_SUMMARY: FlatcarSummary = {
  latestStableVersion: DEFAULT_LATEST_VERSION,
  latestBetaVersion: DEFAULT_LATEST_VERSION,
  totalClusters: DEFAULT_TOTAL_CLUSTERS,
}

const INITIAL_DATA: FlatcarStatusData = {
  health: 'not-installed',
  nodes: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/flatcar/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface FlatcarStatusResponse {
  nodes?: FlatcarNode[]
  stats?: Partial<FlatcarStats>
  summary?: Partial<FlatcarSummary>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function dedupeChannels(channels: FlatcarChannel[]): FlatcarChannel[] {
  const seen = new Set<FlatcarChannel>()
  const out: FlatcarChannel[] = []
  for (const c of channels ?? []) {
    if (!seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

function computeStats(nodes: FlatcarNode[]): FlatcarStats {
  const safeNodes = nodes ?? []
  const upToDate = safeNodes.filter(n => n.state === 'up-to-date').length
  const updateAvailable = safeNodes.filter(
    n => n.state === 'update-available',
  ).length
  const rebootRequired = safeNodes.filter(n => n.rebootRequired).length
  const channels = dedupeChannels(safeNodes.map(n => n.channel))
  return {
    totalNodes: safeNodes.length,
    upToDateNodes: upToDate,
    updateAvailableNodes: updateAvailable,
    rebootRequiredNodes: rebootRequired,
    channelsInUse: channels,
  }
}

function deriveHealth(
  nodes: FlatcarNode[],
  stats: FlatcarStats,
): FlatcarStatusData['health'] {
  if ((nodes ?? []).length === 0) return 'not-installed'
  if (stats.rebootRequiredNodes > 0 || stats.updateAvailableNodes > 0) {
    return 'degraded'
  }
  return 'healthy'
}

function buildFlatcarStatus(
  nodes: FlatcarNode[],
  summary: FlatcarSummary,
): FlatcarStatusData {
  const safeNodes = nodes ?? []
  const stats = computeStats(safeNodes)
  return {
    health: deriveHealth(safeNodes, stats),
    nodes: safeNodes,
    stats,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors envoy/spiffe/linkerd pattern)
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

async function fetchFlatcarStatus(): Promise<FlatcarStatusData> {
  const result = await fetchJson<FlatcarStatusResponse>(
    FLATCAR_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  if (result.failed) {
    throw new Error('Unable to fetch Flatcar status')
  }

  const body = result.data
  const nodes = Array.isArray(body?.nodes) ? body.nodes : []
  const summary: FlatcarSummary = {
    latestStableVersion:
      body?.summary?.latestStableVersion ?? DEFAULT_LATEST_VERSION,
    latestBetaVersion:
      body?.summary?.latestBetaVersion ?? DEFAULT_LATEST_VERSION,
    totalClusters: body?.summary?.totalClusters ?? DEFAULT_TOTAL_CLUSTERS,
  }

  return buildFlatcarStatus(nodes, summary)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseCachedFlatcarResult = CardCachedHookResult<FlatcarStatusData>

export const useCachedFlatcar = createCardCachedHook<FlatcarStatusData>({
  key: CACHE_KEY,
  category: 'operators',
  initialData: INITIAL_DATA,
  demoData: FLATCAR_DEMO_DATA,
  persist: true,
  fetcher: fetchFlatcarStatus,
  hasAnyData: data => (data.health === 'not-installed' ? true : (data.nodes ?? []).length > 0),
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  computeStats,
  deriveHealth,
  buildFlatcarStatus,
  dedupeChannels,
}
