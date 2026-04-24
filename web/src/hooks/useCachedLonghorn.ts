/**
 * useCachedLonghorn — Cached hook for Longhorn distributed block storage status.
 *
 * Longhorn (CNCF Incubating) replicates block volumes across Kubernetes
 * nodes. This hook surfaces:
 *   • Volume list + per-volume state/robustness/replica health
 *   • Node status (Ready + schedulable)
 *   • Cluster-wide capacity utilization
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 * - 404 from the endpoint is treated as "not installed" (empty) rather
 *   than a failure — the card then renders the "Longhorn not detected"
 *   empty state instead of falling back to demo.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  LONGHORN_DEMO_DATA,
  type LonghornNode,
  type LonghornStatusData,
  type LonghornSummary,
  type LonghornVolume,
  type LonghornVolumeRobustness,
  type LonghornVolumeState,
} from '../lib/demo/longhorn'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_LONGHORN = 'longhorn-status'
const LONGHORN_STATUS_ENDPOINT = '/api/longhorn/status'

// HTTP status sentinels
const HTTP_NOT_FOUND = 404

const INITIAL_DATA: LonghornStatusData = {
  health: 'not-installed',
  volumes: [],
  nodes: [],
  summary: {
    totalVolumes: 0,
    healthyVolumes: 0,
    degradedVolumes: 0,
    faultedVolumes: 0,
    totalNodes: 0,
    readyNodes: 0,
    schedulableNodes: 0,
    totalCapacityBytes: 0,
    totalUsedBytes: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the /api/longhorn/status response)
// ---------------------------------------------------------------------------

interface LonghornStatusResponse {
  volumes?: LonghornVolume[]
  nodes?: LonghornNode[]
}

const VALID_VOLUME_STATES: ReadonlyArray<LonghornVolumeState> = [
  'attached',
  'detached',
  'attaching',
  'detaching',
  'creating',
  'deleting',
]

const VALID_VOLUME_ROBUSTNESS: ReadonlyArray<LonghornVolumeRobustness> = [
  'healthy',
  'degraded',
  'faulted',
  'unknown',
]

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function normalizeVolumeState(value: string | undefined): LonghornVolumeState {
  if (value && (VALID_VOLUME_STATES as readonly string[]).includes(value)) {
    return value as LonghornVolumeState
  }
  return 'detached'
}

function normalizeRobustness(value: string | undefined): LonghornVolumeRobustness {
  if (value && (VALID_VOLUME_ROBUSTNESS as readonly string[]).includes(value)) {
    return value as LonghornVolumeRobustness
  }
  return 'unknown'
}

function summarize(
  volumes: LonghornVolume[],
  nodes: LonghornNode[],
): LonghornSummary {
  let healthyVolumes = 0
  let degradedVolumes = 0
  let faultedVolumes = 0
  for (const v of volumes ?? []) {
    if (v.robustness === 'healthy') healthyVolumes += 1
    else if (v.robustness === 'degraded') degradedVolumes += 1
    else if (v.robustness === 'faulted') faultedVolumes += 1
  }

  let readyNodes = 0
  let schedulableNodes = 0
  let totalCapacityBytes = 0
  let totalUsedBytes = 0
  for (const n of nodes ?? []) {
    if (n.ready) readyNodes += 1
    if (n.schedulable) schedulableNodes += 1
    totalCapacityBytes += n.storageTotalBytes
    totalUsedBytes += n.storageUsedBytes
  }

  return {
    totalVolumes: volumes.length,
    healthyVolumes,
    degradedVolumes,
    faultedVolumes,
    totalNodes: nodes.length,
    readyNodes,
    schedulableNodes,
    totalCapacityBytes,
    totalUsedBytes,
  }
}

function deriveHealth(
  volumes: LonghornVolume[],
  nodes: LonghornNode[],
): LonghornStatusData['health'] {
  if (volumes.length === 0 && nodes.length === 0) {
    return 'not-installed'
  }
  const hasFaultedVolume = volumes.some(v => v.robustness === 'faulted')
  const hasDegradedVolume = volumes.some(v => v.robustness === 'degraded')
  const hasUnreadyNode = nodes.some(n => !n.ready)
  if (hasFaultedVolume || hasDegradedVolume || hasUnreadyNode) {
    return 'degraded'
  }
  return 'healthy'
}

function buildStatus(
  volumes: LonghornVolume[],
  nodes: LonghornNode[],
): LonghornStatusData {
  return {
    health: deriveHealth(volumes, nodes),
    volumes,
    nodes,
    summary: summarize(volumes, nodes),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchLonghornStatus(): Promise<LonghornStatusData> {
  const resp = await authFetch(LONGHORN_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    // Endpoint not wired up / Longhorn not installed → treat as empty so
    // the card renders its "not installed" empty state rather than an error.
    if (resp.status === HTTP_NOT_FOUND) return buildStatus([], [])
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as LonghornStatusResponse
  const rawVolumes = Array.isArray(body.volumes) ? body.volumes : []
  const rawNodes = Array.isArray(body.nodes) ? body.nodes : []

  const volumes: LonghornVolume[] = (rawVolumes ?? []).map(v => ({
    name: v.name ?? '',
    namespace: v.namespace ?? '',
    state: normalizeVolumeState(v.state),
    robustness: normalizeRobustness(v.robustness),
    replicasDesired: v.replicasDesired ?? 0,
    replicasHealthy: v.replicasHealthy ?? 0,
    sizeBytes: v.sizeBytes ?? 0,
    actualSizeBytes: v.actualSizeBytes ?? 0,
    nodeAttached: v.nodeAttached ?? '',
    cluster: v.cluster ?? '',
  }))

  const nodes: LonghornNode[] = (rawNodes ?? []).map(n => ({
    name: n.name ?? '',
    cluster: n.cluster ?? '',
    ready: Boolean(n.ready),
    schedulable: Boolean(n.schedulable),
    storageTotalBytes: n.storageTotalBytes ?? 0,
    storageUsedBytes: n.storageUsedBytes ?? 0,
    replicaCount: n.replicaCount ?? 0,
  }))

  return buildStatus(volumes, nodes)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedLonghorn(): CachedHookResult<LonghornStatusData> {
  const result = useCache<LonghornStatusData>({
    key: CACHE_KEY_LONGHORN,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: LONGHORN_DEMO_DATA,
    persist: true,
    fetcher: fetchLonghornStatus,
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
  normalizeVolumeState,
  normalizeRobustness,
  summarize,
  deriveHealth,
  buildStatus,
}
