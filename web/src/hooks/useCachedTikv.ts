/**
 * useCachedTikv — Cached hook for TiKV store status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * Fetches TiKV Pod resources via the MCP bridge and derives per-store
 * health from container readiness. When PD (Placement Driver) statistics
 * are exposed via a metrics endpoint they can be layered in later; for
 * now region/leader counts and capacity come from annotations when
 * present, otherwise fall back to zero (no synthetic live values).
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import { TIKV_DEMO_DATA, type TikvStatusData, type TikvStore, type TikvStoreState } from '../lib/demo/tikv'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_TIKV = 'tikv-status'

const INITIAL_DATA: TikvStatusData = {
  health: 'not-installed',
  stores: [],
  summary: { totalStores: 0, upStores: 0, downStores: 0, totalRegions: 0, totalLeaders: 0 },
  lastCheckTime: new Date().toISOString(),
}

// TiKV/PD annotation keys commonly set by operator-managed deployments.
// When absent we default the value to zero rather than fabricating data.
const ANNOT_REGION_COUNT = 'tikv.kubestellar.io/region-count'
const ANNOT_LEADER_COUNT = 'tikv.kubestellar.io/leader-count'
const ANNOT_CAPACITY_BYTES = 'tikv.kubestellar.io/capacity-bytes'
const ANNOT_AVAILABLE_BYTES = 'tikv.kubestellar.io/available-bytes'
const ANNOT_STORE_ID = 'tikv.kubestellar.io/store-id'

const TIKV_DEFAULT_PORT = 20160

// ---------------------------------------------------------------------------
// Internal types (shape of MCP custom-resource response)
// ---------------------------------------------------------------------------

interface PodItem {
  name: string
  namespace?: string
  cluster?: string
  status?: {
    phase?: string
    podIP?: string
    containerStatuses?: Array<{ name?: string; ready?: boolean; image?: string }>
  }
  metadata?: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
}

interface PodListResponse {
  items?: PodItem[]
}

// ---------------------------------------------------------------------------
// Helpers (pure, unit-testable)
// ---------------------------------------------------------------------------

function isTikvPod(pod: PodItem): boolean {
  const name = pod.name?.toLowerCase() || ''
  const labels = pod.metadata?.labels || {}
  if (labels['app.kubernetes.io/component'] === 'tikv') return true
  if (labels['app.kubernetes.io/name'] === 'tikv') return true
  if (labels['app'] === 'tikv') return true
  return name.startsWith('tikv-') || name.includes('-tikv-')
}

function parseIntOrZero(value: string | undefined): number {
  if (!value) return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function deriveStoreState(pod: PodItem): TikvStoreState {
  const phase = pod.status?.phase
  if (phase === 'Running') {
    const containers = pod.status?.containerStatuses || []
    const allReady = containers.length > 0 && containers.every(c => c.ready === true)
    return allReady ? 'Up' : 'Down'
  }
  if (phase === 'Pending') return 'Offline'
  if (phase === 'Failed') return 'Down'
  return 'Down'
}

function parseVersion(pod: PodItem): string {
  const containers = pod.status?.containerStatuses || []
  const tikvContainer = containers.find(c => (c.name || '').toLowerCase().includes('tikv'))
  const image = tikvContainer?.image || containers[0]?.image || ''
  if (!image) return ''
  const withoutDigest = image.split('@')[0]
  const colonIdx = withoutDigest.lastIndexOf(':')
  if (colonIdx < 0) return ''
  return withoutDigest.substring(colonIdx + 1)
}

function podToStore(pod: PodItem, fallbackStoreId: number): TikvStore {
  const annotations = pod.metadata?.annotations || {}
  const ip = pod.status?.podIP || ''
  const address = ip ? `${ip}:${TIKV_DEFAULT_PORT}` : pod.name
  const storeId = parseIntOrZero(annotations[ANNOT_STORE_ID]) || fallbackStoreId
  return {
    storeId,
    address,
    state: deriveStoreState(pod),
    version: parseVersion(pod),
    regionCount: parseIntOrZero(annotations[ANNOT_REGION_COUNT]),
    leaderCount: parseIntOrZero(annotations[ANNOT_LEADER_COUNT]),
    capacityBytes: parseIntOrZero(annotations[ANNOT_CAPACITY_BYTES]),
    availableBytes: parseIntOrZero(annotations[ANNOT_AVAILABLE_BYTES]),
  }
}

function summarize(stores: TikvStore[]): TikvStatusData['summary'] {
  let upStores = 0
  let totalRegions = 0
  let totalLeaders = 0
  for (const store of stores) {
    if (store.state === 'Up') upStores += 1
    totalRegions += store.regionCount
    totalLeaders += store.leaderCount
  }
  return {
    totalStores: stores.length,
    upStores,
    downStores: stores.length - upStores,
    totalRegions,
    totalLeaders,
  }
}

function buildStatus(stores: TikvStore[]): TikvStatusData {
  const summary = summarize(stores)
  let health: TikvStatusData['health'] = 'healthy'
  if (summary.totalStores === 0) health = 'not-installed'
  else if (summary.downStores > 0) health = 'degraded'
  return {
    health,
    stores,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTikvStatus(): Promise<TikvStatusData> {
  const params = new URLSearchParams({
    group: '',
    version: 'v1',
    resource: 'pods',
  })

  const resp = await authFetch(`/api/mcp/custom-resources?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (resp.status === 404) return buildStatus([])
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as PodListResponse
  const items = Array.isArray(body.items) ? body.items : []
  const tikvPods = items.filter(isTikvPod)
  const stores = tikvPods.map((pod, idx) => podToStore(pod, idx + 1))
  return buildStatus(stores)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedTikv(): CachedHookResult<TikvStatusData> {
  const result = useCache<TikvStatusData>({
    key: CACHE_KEY_TIKV,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: TIKV_DEMO_DATA,
    persist: true,
    fetcher: fetchTikvStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  isTikvPod,
  parseIntOrZero,
  deriveStoreState,
  parseVersion,
  podToStore,
  summarize,
  buildStatus,
}
