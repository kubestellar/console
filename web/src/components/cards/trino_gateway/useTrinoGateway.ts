/**
 * Data-fetching hook for the Trino Gateway Monitor card.
 *
 * Discovers Trino coordinator and worker pods via label selectors
 * (app=trino,component=coordinator / component=worker) and Trino Gateway
 * pods (app=trino-gateway) across all connected clusters.
 */

import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  TRINO_GATEWAY_DEMO_DATA,
  type TrinoGatewayData,
  type TrinoClusterInfo,
  type TrinoGatewayInfo,
  type TrinoGatewayStatus,
  type TrinoGatewayBackend,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'trino-gateway-status'

const LABEL_TRINO_COORDINATOR = 'app%3Dtrino%2Ccomponent%3Dcoordinator'
const LABEL_TRINO_WORKER = 'app%3Dtrino%2Ccomponent%3Dworker'
const LABEL_TRINO_GATEWAY = 'app%3Dtrino-gateway'

const INITIAL_DATA: TrinoGatewayData = {
  detected: false,
  trinoClusters: [],
  gateways: [],
  totalWorkers: 0,
  totalActiveQueries: 0,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  cluster?: string
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: { pods?: BackendPodInfo[] } = await resp.json()
    return Array.isArray(body?.pods) ? body.pods : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

/** Build a composite key for grouping pods by cluster + namespace. */
function clusterKey(pod: BackendPodInfo): string {
  return `${pod.cluster ?? 'unknown'}/${pod.namespace ?? 'default'}`
}

// ---------------------------------------------------------------------------
// Cluster aggregation
// ---------------------------------------------------------------------------

function aggregateTrinoClusters(
  coordinators: BackendPodInfo[],
  workers: BackendPodInfo[],
): TrinoClusterInfo[] {
  // Group coordinators by cluster/namespace
  const clusterMap = new Map<string, { coordinators: BackendPodInfo[]; workers: BackendPodInfo[] }>()

  for (const pod of coordinators) {
    const key = clusterKey(pod)
    if (!clusterMap.has(key)) clusterMap.set(key, { coordinators: [], workers: [] })
    clusterMap.get(key)!.coordinators.push(pod)
  }

  for (const pod of workers) {
    const key = clusterKey(pod)
    if (!clusterMap.has(key)) clusterMap.set(key, { coordinators: [], workers: [] })
    clusterMap.get(key)!.workers.push(pod)
  }

  const clusters: TrinoClusterInfo[] = []

  for (const [key, group] of clusterMap) {
    const [cluster, namespace] = key.split('/')
    const trinoClusterLabel = group.coordinators[0]?.labels?.['app.kubernetes.io/instance'] ?? ''
    const name = trinoClusterLabel || `trino-${cluster}`
    const coordinatorReady = group.coordinators.some(isPodReady)
    const workerCount = group.workers.length

    clusters.push({
      name,
      cluster,
      namespace,
      coordinatorReady,
      workerCount,
      // Active/queued queries cannot be determined from pod metadata alone;
      // these would require the Trino REST API (/v1/query). Default to 0.
      activeQueries: 0,
      queuedQueries: 0,
    })
  }

  return clusters
}

// ---------------------------------------------------------------------------
// Gateway aggregation
// ---------------------------------------------------------------------------

function aggregateGateways(
  gatewayPods: BackendPodInfo[],
  trinoClusters: TrinoClusterInfo[],
): TrinoGatewayInfo[] {
  // Group gateway pods by cluster/namespace
  const gwMap = new Map<string, BackendPodInfo[]>()

  for (const pod of gatewayPods) {
    const key = clusterKey(pod)
    if (!gwMap.has(key)) gwMap.set(key, [])
    gwMap.get(key)!.push(pod)
  }

  const gateways: TrinoGatewayInfo[] = []

  for (const [key, pods] of gwMap) {
    const [cluster, namespace] = key.split('/')
    const allReady = pods.every(isPodReady)
    const anyReady = pods.some(isPodReady)

    let status: TrinoGatewayStatus = 'down'
    if (allReady) status = 'healthy'
    else if (anyReady) status = 'degraded'

    // Each known Trino cluster is a potential backend for this gateway
    const backends: TrinoGatewayBackend[] = trinoClusters.map(tc => ({
      name: tc.name,
      cluster: tc.cluster,
      active: tc.coordinatorReady,
      draining: false,
    }))

    const instanceLabel = pods[0]?.labels?.['app.kubernetes.io/instance'] ?? ''
    const name = instanceLabel || `trino-gateway-${cluster}`

    gateways.push({
      name,
      cluster,
      namespace,
      status,
      backends,
    })
  }

  return gateways
}

// ---------------------------------------------------------------------------
// Live data fetcher
// ---------------------------------------------------------------------------

async function fetchTrinoGatewayData(): Promise<TrinoGatewayData> {
  const [coordinators, workers, gatewayPods] = await Promise.all([
    fetchPods(`/api/mcp/pods?labelSelector=${LABEL_TRINO_COORDINATOR}`),
    fetchPods(`/api/mcp/pods?labelSelector=${LABEL_TRINO_WORKER}`),
    fetchPods(`/api/mcp/pods?labelSelector=${LABEL_TRINO_GATEWAY}`),
  ])

  const detected = coordinators.length > 0 || workers.length > 0 || gatewayPods.length > 0
  if (!detected) throw new Error('No Trino resources detected')

  const trinoClusters = aggregateTrinoClusters(coordinators, workers)
  const gateways = aggregateGateways(gatewayPods, trinoClusters)
  const totalWorkers = trinoClusters.reduce((sum, c) => sum + c.workerCount, 0)
  const totalActiveQueries = trinoClusters.reduce((sum, c) => sum + c.activeQueries, 0)

  return {
    detected: true,
    trinoClusters,
    gateways,
    totalWorkers,
    totalActiveQueries,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrinoGateway() {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<TrinoGatewayData>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: TRINO_GATEWAY_DEMO_DATA,
    persist: true,
    fetcher: fetchTrinoGatewayData,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.detected
    ? ((data.trinoClusters || []).length > 0 || (data.gateways || []).length > 0)
    : !isFailed // "not detected" is a valid state

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    showSkeleton,
    showEmptyState,
    error: isFailed && !hasAnyData,
  }
}
