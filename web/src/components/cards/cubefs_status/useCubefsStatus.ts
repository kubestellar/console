import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  CUBEFS_DEMO_DATA,
  type CubefsDemoData,
  type CubefsVolume,
  type CubefsVolumeStatus,
  type CubefsNode,
  type CubefsNodeStatus,
} from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

export type CubefsStatus = CubefsDemoData

// Re-export types consumed by the component
export type {
  CubefsVolume,
  CubefsVolumeStatus,
  CubefsNode,
  CubefsNodeStatus,
}

const INITIAL_DATA: CubefsStatus = {
  health: 'not-installed',
  clusterName: '',
  masterLeader: '',
  volumes: [],
  nodes: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'cubefs-status'

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
  annotations?: Record<string, string>
  [key: string]: unknown
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isCubefsPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  const ns = (pod.namespace ?? '').toLowerCase()
  const isCubefsControllerByName =
    (ns === 'cubefs' || ns === 'cubefs-system' || ns === 'cfs-system') &&
    (
      name.startsWith('cfs-master') ||
      name.startsWith('cfs-metanode') ||
      name.startsWith('cfs-datanode') ||
      name.startsWith('cubefs-master') ||
      name.startsWith('cubefs-meta') ||
      name.startsWith('cubefs-data') ||
      name.startsWith('cubefs-csi') ||
      name.startsWith('objectnode') ||
      name.startsWith('blobstore')
    )
  return (
    labels['app'] === 'cubefs' ||
    labels['app.kubernetes.io/name'] === 'cubefs' ||
    labels['app.kubernetes.io/part-of'] === 'cubefs' ||
    isCubefsControllerByName
  )
}

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  const EXPECTED_PARTS = 2
  if (parts.length !== EXPECTED_PARTS) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

/** Determine the CubeFS pod role from name conventions */
function getPodRole(pod: BackendPodInfo): 'master' | 'meta' | 'data' | 'other' {
  const name = (pod.name ?? '').toLowerCase()
  if (name.includes('master')) return 'master'
  if (name.includes('meta')) return 'meta'
  if (name.includes('data')) return 'data'
  return 'other'
}

// ---------------------------------------------------------------------------
// CRD helpers
// ---------------------------------------------------------------------------

async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`${LOCAL_AGENT_HTTP_URL}/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: CRResponse = await resp.json()
    return body.items ?? []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

// ---------------------------------------------------------------------------
// Volume parser (from CubeFS volume CRDs — cubefs.io/v1alpha1 Volume)
// ---------------------------------------------------------------------------

const PERCENT_MAX = 100

function parseVolume(item: CRItem): CubefsVolume {
  const status = (item.status ?? {}) as Record<string, unknown>
  const spec = (item.spec ?? {}) as Record<string, unknown>

  // Status phase
  const phase = typeof status.phase === 'string' ? status.phase.toLowerCase() : ''
  let volumeStatus: CubefsVolumeStatus = 'unknown'
  if (phase === 'active' || phase === 'ready' || phase === 'running') {
    volumeStatus = 'active'
  } else if (phase === 'inactive' || phase === 'stopped') {
    volumeStatus = 'inactive'
  } else if (phase === 'readonly' || phase === 'read-only') {
    volumeStatus = 'read-only'
  }

  // Capacity and usage
  const capacity = typeof spec.capacity === 'string' ? spec.capacity : ''
  const usedSize = typeof status.usedSize === 'string' ? status.usedSize : ''
  let usagePercent = 0
  if (typeof status.usageRatio === 'number') {
    usagePercent = Math.min(Math.round(status.usageRatio * PERCENT_MAX), PERCENT_MAX)
  }

  // Partitions
  const dataPartitions = typeof status.dpCount === 'number' ? status.dpCount : 0
  const metaPartitions = typeof status.mpCount === 'number' ? status.mpCount : 0

  // Replicas
  const replicaCount = typeof spec.replicaNum === 'number'
    ? spec.replicaNum
    : typeof spec.dpReplicaNum === 'number'
      ? spec.dpReplicaNum
      : 3

  const owner = typeof spec.owner === 'string' ? spec.owner : ''

  return {
    name: item.name,
    owner,
    status: volumeStatus,
    capacity,
    usedSize,
    usagePercent,
    dataPartitions,
    metaPartitions,
    replicaCount,
  }
}

// ---------------------------------------------------------------------------
// Node builder from pods
// ---------------------------------------------------------------------------

function buildNodeFromPod(pod: BackendPodInfo): CubefsNode | null {
  const role = getPodRole(pod)
  if (role === 'other') return null

  return {
    address: pod.name ?? '',
    role,
    status: isPodReady(pod) ? 'active' : 'inactive',
    totalDisk: '',
    usedDisk: '',
    diskUsagePercent: 0,
    partitions: 0,
  }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchCubefsStatus(): Promise<CubefsStatus> {
  // Step 1: Detect CubeFS pods via label selector
  const labeledPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app%3Dcubefs`,
  ).catch(() => [] as BackendPodInfo[])

  let cubefsPods = labeledPods.filter(isCubefsPod)

  // Fallback: try namespace filter
  if (cubefsPods.length === 0) {
    const nsPods = await fetchPods(
      `${LOCAL_AGENT_HTTP_URL}/pods?namespace=cubefs`,
    ).catch(() => [] as BackendPodInfo[])
    cubefsPods = nsPods.filter(isCubefsPod)
  }

  // Fallback: try alternate namespace
  if (cubefsPods.length === 0) {
    const nsPods2 = await fetchPods(
      `${LOCAL_AGENT_HTTP_URL}/pods?namespace=cubefs-system`,
    ).catch(() => [] as BackendPodInfo[])
    cubefsPods = nsPods2.filter(isCubefsPod)
  }

  // Fallback: unfiltered pod list
  if (cubefsPods.length === 0) {
    const allPods = await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`)
      .catch(() => [] as BackendPodInfo[])
    cubefsPods = allPods.filter(isCubefsPod)
  }

  // No CubeFS at all
  if (cubefsPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  // Step 2: Build node list from pods
  const nodes: CubefsNode[] = []
  for (const pod of cubefsPods) {
    const node = buildNodeFromPod(pod)
    if (node) nodes.push(node)
  }

  // Step 3: Fetch volume CRDs (best-effort)
  const volumeItems = await fetchCR('cubefs.io', 'v1alpha1', 'volumes')
    .catch(() => [] as CRItem[])
  const volumes = (volumeItems || []).map(parseVolume)

  // Step 4: Determine health
  const masterNodes = nodes.filter(n => n.role === 'master')
  const activeMasters = masterNodes.filter(n => n.status === 'active').length
  const allNodesActive = nodes.every(n => n.status === 'active')
  const hasInactiveVolumes = volumes.some(v => v.status === 'inactive')

  // Identify leader (first active master)
  const masterLeader = masterNodes.find(n => n.status === 'active')?.address ?? ''

  const health =
    activeMasters > 0 && allNodesActive && !hasInactiveVolumes
      ? 'healthy'
      : 'degraded'

  // Cluster name from namespace or labels
  const clusterName = cubefsPods[0]?.labels?.['app.kubernetes.io/instance']
    ?? cubefsPods[0]?.namespace
    ?? 'cubefs'

  return {
    health,
    clusterName,
    masterLeader,
    volumes,
    nodes,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCubefsStatusResult {
  data: CubefsStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
  isDemoFallback: boolean
}

export function useCubefsStatus(): UseCubefsStatusResult {
  const { isDemoMode } = useDemoMode()

  const {
    data: liveData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
  } = useCache<CubefsStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: CUBEFS_DEMO_DATA,
    persist: true,
    fetcher: fetchCubefsStatus,
  })

  const data = isDemoMode ? CUBEFS_DEMO_DATA : liveData
  const effectiveIsDemoData = isDemoMode || (isDemoFallback && !isLoading)

  const hasAnyData =
    (data.volumes || []).length > 0 ||
    (data.nodes || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !isDemoMode,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading && !isDemoMode,
    isRefreshing,
    error: isFailed && !hasAnyData && !isDemoMode,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
    lastRefresh,
    isDemoFallback: effectiveIsDemoData,
  }
}
