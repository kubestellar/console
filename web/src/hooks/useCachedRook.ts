/**
 * useCachedRook — Cached hook for Rook Ceph storage status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * Rook publishes CephCluster custom resources in the rook-ceph operator
 * namespace. We read them through the MCP custom-resources bridge and
 * derive health counters from the `status.ceph` subresource. When Rook
 * hasn't been installed the endpoint returns no items (or the CRD isn't
 * registered at all) and the card falls back to demo data.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  ROOK_DEMO_DATA,
  type RookCephCluster,
  type RookCephHealth,
  type RookStatusData,
} from '../lib/demo/rook'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_ROOK = 'rook-status'

const CEPH_CLUSTER_GROUP = 'ceph.rook.io'
const CEPH_CLUSTER_VERSION = 'v1'
const CEPH_CLUSTER_RESOURCE = 'cephclusters'

// HTTP status sentinels
const HTTP_NOT_FOUND = 404

const INITIAL_DATA: RookStatusData = {
  health: 'not-installed',
  clusters: [],
  summary: {
    totalClusters: 0,
    healthyClusters: 0,
    degradedClusters: 0,
    totalOsdUp: 0,
    totalOsdTotal: 0,
    totalCapacityBytes: 0,
    totalUsedBytes: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the CephCluster custom resource as surfaced by MCP)
// ---------------------------------------------------------------------------

interface CephClusterItem {
  name?: string
  namespace?: string
  cluster?: string
  metadata?: {
    name?: string
    namespace?: string
  }
  spec?: {
    cephVersion?: { image?: string }
  }
  status?: {
    ceph?: {
      health?: string
      version?: string
    }
    storage?: {
      deviceClasses?: Array<{ name?: string }>
    }
    version?: { version?: string }
    osd?: {
      storeType?: Record<string, number>
    }
    phase?: string
  }
}

interface CephClusterListResponse {
  items?: CephClusterItem[]
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function normalizeCephHealth(value: string | undefined): RookCephHealth {
  if (value === 'HEALTH_OK') return 'HEALTH_OK'
  if (value === 'HEALTH_ERR') return 'HEALTH_ERR'
  // Default any unknown / missing value to WARN so we never misreport as OK.
  return 'HEALTH_WARN'
}

function extractCephVersion(item: CephClusterItem): string {
  const statusVersion = item.status?.ceph?.version ?? item.status?.version?.version
  if (statusVersion) return statusVersion

  const image = item.spec?.cephVersion?.image
  if (!image) return ''
  const withoutDigest = image.split('@')[0]
  const colonIdx = withoutDigest.lastIndexOf(':')
  if (colonIdx < 0) return ''
  return withoutDigest.substring(colonIdx + 1)
}

function itemToCluster(item: CephClusterItem): RookCephCluster {
  const name = item.metadata?.name ?? item.name ?? ''
  const namespace = item.metadata?.namespace ?? item.namespace ?? ''
  return {
    namespace,
    name,
    cluster: item.cluster ?? '',
    cephVersion: extractCephVersion(item),
    cephHealth: normalizeCephHealth(item.status?.ceph?.health),
    // Live OSD / MON / MGR / capacity counters are not surfaced on the
    // CephCluster status subresource in a consistent, version-stable way.
    // We leave them at zero until a dedicated metrics bridge lands; the
    // demo fallback renders representative values so operators see the
    // intended layout.
    osdTotal: 0,
    osdUp: 0,
    osdIn: 0,
    monQuorum: 0,
    monExpected: 0,
    mgrActive: 0,
    mgrStandby: 0,
    capacityTotalBytes: 0,
    capacityUsedBytes: 0,
    pools: 0,
    pgActiveClean: 0,
    pgTotal: 0,
  }
}

function summarize(clusters: RookCephCluster[]): RookStatusData['summary'] {
  let healthyClusters = 0
  let totalOsdUp = 0
  let totalOsdTotal = 0
  let totalCapacityBytes = 0
  let totalUsedBytes = 0
  for (const c of clusters ?? []) {
    if (c.cephHealth === 'HEALTH_OK') healthyClusters += 1
    totalOsdUp += c.osdUp
    totalOsdTotal += c.osdTotal
    totalCapacityBytes += c.capacityTotalBytes
    totalUsedBytes += c.capacityUsedBytes
  }
  return {
    totalClusters: clusters.length,
    healthyClusters,
    degradedClusters: clusters.length - healthyClusters,
    totalOsdUp,
    totalOsdTotal,
    totalCapacityBytes,
    totalUsedBytes,
  }
}

function buildStatus(clusters: RookCephCluster[]): RookStatusData {
  const summary = summarize(clusters)
  let health: RookStatusData['health'] = 'healthy'
  if (summary.totalClusters === 0) {
    health = 'not-installed'
  } else if (summary.degradedClusters > 0) {
    health = 'degraded'
  }
  return {
    health,
    clusters,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchRookStatus(): Promise<RookStatusData> {
  const params = new URLSearchParams({
    group: CEPH_CLUSTER_GROUP,
    version: CEPH_CLUSTER_VERSION,
    resource: CEPH_CLUSTER_RESOURCE,
  })

  const resp = await authFetch(`/api/mcp/custom-resources?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    // CRD not registered → treat as "not installed" without surfacing an error.
    if (resp.status === HTTP_NOT_FOUND) return buildStatus([])
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as CephClusterListResponse
  const items = Array.isArray(body.items) ? body.items : []
  const clusters = (items ?? []).map(itemToCluster)
  return buildStatus(clusters)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedRook(): CachedHookResult<RookStatusData> {
  const result = useCache<RookStatusData>({
    key: CACHE_KEY_ROOK,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: ROOK_DEMO_DATA,
    persist: true,
    fetcher: fetchRookStatus,
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
  normalizeCephHealth,
  extractCephVersion,
  itemToCluster,
  summarize,
  buildStatus,
}
