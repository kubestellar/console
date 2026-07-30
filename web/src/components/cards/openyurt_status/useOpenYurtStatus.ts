import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { OPENYURT_DEMO_DATA, type OpenYurtDemoData, type OpenYurtNodePool, type NodePoolType, type NodePoolStatus, type GatewayStatus } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'

export type OpenYurtStatus = OpenYurtDemoData

const INITIAL_DATA: OpenYurtStatus = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  nodePools: [],
  gateways: [],
  totalNodes: 0,
  autonomousNodes: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'openyurt-status'

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
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isOpenYurtControllerPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'yurt-manager' ||
    labels['app.kubernetes.io/name'] === 'openyurt' ||
    labels['app.kubernetes.io/name'] === 'yurt-manager' ||
    labels['app.kubernetes.io/part-of'] === 'openyurt' ||
    name.startsWith('yurt-manager') ||
    name.startsWith('yurt-controller-manager') ||
    name.startsWith('yurt-hub') ||
    name.startsWith('yurt-tunnel')
  )
}

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

// ---------------------------------------------------------------------------
// CRD helpers
// ---------------------------------------------------------------------------

async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`/api/mcp/custom-resources?${params}`, {
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
// NodePool parser
// ---------------------------------------------------------------------------

const KNOWN_POOL_TYPES = new Set<string>(['edge', 'cloud'])

function parseNodePool(item: CRItem): OpenYurtNodePool {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>
  const annotations = item.annotations ?? {}

  // Pool type: spec.type or annotation
  const rawType = (spec.type as string) ?? annotations['apps.openyurt.io/pool-type'] ?? 'edge'
  const poolType: NodePoolType = KNOWN_POOL_TYPES.has(rawType) ? (rawType as NodePoolType) : 'edge'

  // Node counts from status
  const nodeCount = typeof status.readyNodeNum === 'number' && typeof status.unreadyNodeNum === 'number'
    ? status.readyNodeNum + status.unreadyNodeNum
    : typeof status.nodes === 'number'
      ? status.nodes
      : 0
  const readyNodes = typeof status.readyNodeNum === 'number'
    ? status.readyNodeNum
    : nodeCount

  // Derive pool status
  let poolStatus: NodePoolStatus = 'ready'
  if (nodeCount === 0 || readyNodes === 0) {
    poolStatus = 'not-ready'
  } else if (readyNodes < nodeCount) {
    poolStatus = 'degraded'
  }

  // Autonomy enabled check
  const autonomyEnabled = poolType === 'edge' ||
    spec.autonomy === true ||
    annotations['node.beta.openyurt.io/autonomy'] === 'true'

  return {
    name: item.name,
    type: poolType,
    status: poolStatus,
    nodeCount,
    readyNodes,
    autonomyEnabled,
  }
}

// ---------------------------------------------------------------------------
// Gateway parser
// ---------------------------------------------------------------------------

function parseGateway(item: CRItem): { name: string; nodePool: string; status: GatewayStatus; endpoint: string } {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  const nodePool = (spec.nodePool as string) ??
    (spec.proxyNodePool as string) ??
    (item.labels?.['raven.openyurt.io/gateway-node-pool'] ?? '')

  // Derive endpoint
  const endpoints = Array.isArray(spec.endpoints) ? spec.endpoints : []
  const endpoint = endpoints.length > 0
    ? ((endpoints[0] as Record<string, unknown>).publicIP as string) ?? ''
    : (spec.endpoint as string) ?? ''

  // Derive status
  const activeEndpoints = Array.isArray(status.activeEndpoints) ? status.activeEndpoints : []
  const nodes = Array.isArray(status.nodes) ? status.nodes : []
  let gwStatus: GatewayStatus = 'pending'
  if (activeEndpoints.length > 0 || nodes.length > 0) {
    gwStatus = 'connected'
  } else if (status.phase === 'Disconnected' || status.phase === 'Failed') {
    gwStatus = 'disconnected'
  }

  return {
    name: item.name,
    nodePool,
    status: gwStatus,
    endpoint,
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
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchOpenYurtStatus(): Promise<OpenYurtStatus> {
  // Step 1: Detect OpenYurt controller pods
  const labeledPods = await fetchPods(
    '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dyurt-manager',
  )
  const yurtPods = labeledPods.length > 0
    ? labeledPods.filter(isOpenYurtControllerPod)
    : (await fetchPods('/api/mcp/pods')).filter(isOpenYurtControllerPod)

  if (yurtPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = yurtPods.filter(isPodReady).length
  const allPodsReady = readyPods === yurtPods.length

  // Step 2: Fetch NodePool and Gateway CRDs (best-effort, in parallel)
  const [nodePoolItems, gatewayItems] = await Promise.all([
    fetchCR('apps.openyurt.io', 'v1beta1', 'nodepools'),
    fetchCR('raven.openyurt.io', 'v1beta1', 'gateways'),
  ])

  const nodePools = nodePoolItems.map(parseNodePool)
  const gateways = gatewayItems.map(parseGateway)

  // Compute aggregates
  const totalNodes = nodePools.reduce((sum, np) => sum + np.nodeCount, 0)
  const autonomousNodes = nodePools
    .filter(np => np.autonomyEnabled)
    .reduce((sum, np) => sum + np.nodeCount, 0)

  const allPoolsReady = nodePools.length === 0 || nodePools.every(np => np.status === 'ready')
  const health = allPodsReady && allPoolsReady ? 'healthy' : 'degraded'

  return {
    health,
    controllerPods: { ready: readyPods, total: yurtPods.length },
    nodePools,
    gateways,
    totalNodes,
    autonomousNodes,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseOpenYurtStatusResult {
  data: OpenYurtStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useOpenYurtStatus(): UseOpenYurtStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<OpenYurtStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: OPENYURT_DEMO_DATA,
    persist: true,
    fetcher: fetchOpenYurtStatus,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasData = (data.nodePools?.length ?? 0) > 0 || (data.gateways?.length ?? 0) > 0
  const hasAnyData = hasData || (data.controllerPods?.total ?? 0) > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData, // gate on !hasData so skeleton doesn't flash on refetch
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
