/**
 * wasmCloud Status Hook — Data fetching for the wasmcloud_status card.
 *
 * Mirrors the spiffe / linkerd / envoy / contour pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real wasmCloud control bridge
 *   lands, at which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  WASMCLOUD_DEMO_DATA,
  type WasmcloudActor,
  type WasmcloudHost,
  type WasmcloudLink,
  type WasmcloudProvider,
  type WasmcloudStats,
  type WasmcloudStatusData,
  type WasmcloudSummary,
} from '../components/cards/wasmcloud_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'wasmcloud-status'
// The spec calls for a 'workloads' cache category; the canonical
// RefreshCategory closest to workload-style refresh cadence is 'deployments'
// (60s). Cast keeps this in sync if/when a 'workloads' key is added.
const WASMCLOUD_CACHE_CATEGORY = 'deployments'
const WASMCLOUD_STATUS_ENDPOINT = '/api/wasmcloud/status'
const DEFAULT_LATTICE_VERSION = 'unknown'
const DEFAULT_LATTICE_ID = ''

const EMPTY_STATS: WasmcloudStats = {
  hostCount: 0,
  actorCount: 0,
  providerCount: 0,
  linkCount: 0,
  latticeVersion: DEFAULT_LATTICE_VERSION,
}

const EMPTY_SUMMARY: WasmcloudSummary = {
  latticeId: DEFAULT_LATTICE_ID,
  totalHosts: 0,
  totalActors: 0,
  totalProviders: 0,
  totalLinks: 0,
}

const INITIAL_DATA: WasmcloudStatusData = {
  health: 'not-installed',
  hosts: [],
  actors: [],
  providers: [],
  links: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/wasmcloud/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface WasmcloudStatusResponse {
  latticeId?: string
  hosts?: WasmcloudHost[]
  actors?: WasmcloudActor[]
  providers?: WasmcloudProvider[]
  links?: WasmcloudLink[]
  stats?: Partial<WasmcloudStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  latticeId: string,
  hosts: WasmcloudHost[],
  actors: WasmcloudActor[],
  providers: WasmcloudProvider[],
  links: WasmcloudLink[],
): WasmcloudSummary {
  return {
    latticeId,
    totalHosts: hosts.length,
    totalActors: actors.length,
    totalProviders: providers.length,
    totalLinks: links.length,
  }
}

function deriveHealth(
  latticeId: string,
  hosts: WasmcloudHost[],
  providers: WasmcloudProvider[],
  links: WasmcloudLink[],
): WasmcloudStatusData['health'] {
  if (!latticeId && hosts.length === 0) {
    return 'not-installed'
  }
  const hasUnreachableHost = hosts.some(h => h.status === 'unreachable')
  const hasFailedProvider = providers.some(p => p.status === 'failed')
  const hasFailedLink = links.some(l => l.status === 'failed')
  return hasUnreachableHost || hasFailedProvider || hasFailedLink ? 'degraded' : 'healthy'
}

function buildWasmcloudStatus(
  latticeId: string,
  hosts: WasmcloudHost[],
  actors: WasmcloudActor[],
  providers: WasmcloudProvider[],
  links: WasmcloudLink[],
  stats: WasmcloudStats,
): WasmcloudStatusData {
  return {
    health: deriveHealth(latticeId, hosts, providers, links),
    hosts,
    actors,
    providers,
    links,
    stats,
    summary: summarize(latticeId, hosts, actors, providers, links),
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

async function fetchWasmcloudStatus(): Promise<WasmcloudStatusData> {
  const result = await fetchJson<WasmcloudStatusResponse>(
    WASMCLOUD_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch wasmCloud status')
  }

  const body = result.data
  const latticeId = body?.latticeId ?? DEFAULT_LATTICE_ID
  const hosts = Array.isArray(body?.hosts) ? body.hosts : []
  const actors = Array.isArray(body?.actors) ? body.actors : []
  const providers = Array.isArray(body?.providers) ? body.providers : []
  const links = Array.isArray(body?.links) ? body.links : []
  const stats: WasmcloudStats = {
    hostCount: body?.stats?.hostCount ?? hosts.length,
    actorCount: body?.stats?.actorCount ?? actors.length,
    providerCount: body?.stats?.providerCount ?? providers.length,
    linkCount: body?.stats?.linkCount ?? links.length,
    latticeVersion: body?.stats?.latticeVersion ?? DEFAULT_LATTICE_VERSION,
  }

  return buildWasmcloudStatus(latticeId, hosts, actors, providers, links, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseCachedWasmcloudResult = CardCachedHookResult<WasmcloudStatusData>

export const useCachedWasmcloud = createCardCachedHook<WasmcloudStatusData>({
  key: CACHE_KEY,
  category: WASMCLOUD_CACHE_CATEGORY,
  initialData: INITIAL_DATA,
  demoData: WASMCLOUD_DEMO_DATA,
  persist: true,
  fetcher: fetchWasmcloudStatus,
  hasAnyData: data => (data.health === 'not-installed' ? true : (data.hosts ?? []).length > 0),
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildWasmcloudStatus,
}
