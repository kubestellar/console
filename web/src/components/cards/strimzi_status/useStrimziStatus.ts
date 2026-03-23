import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { STRIMZI_DEMO_DATA, type StrimziDemoData, type StrimziTopic } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'

export type StrimziStatus = StrimziDemoData

const INITIAL_DATA: StrimziStatus = {
  health: 'not-installed',
  clusterName: '',
  kafkaVersion: '',
  topics: [],
  consumerGroups: [],
  brokers: { ready: 0, total: 0 },
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'strimzi-status'

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
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isStrimziPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['strimzi.io/cluster'] !== undefined ||
    labels['app.kubernetes.io/managed-by'] === 'strimzi-cluster-operator' ||
    name.startsWith('strimzi-cluster-operator') ||
    (name.includes('-kafka-') && (labels['strimzi.io/kind'] !== undefined || name.startsWith('strimzi'))) ||
    (name.includes('-zookeeper-') && (labels['strimzi.io/kind'] !== undefined || name.startsWith('strimzi')))
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

function isBrokerPod(pod: BackendPodInfo): boolean {
  const name = (pod.name ?? '').toLowerCase()
  return name.includes('-kafka-') && !name.includes('zookeeper')
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

/** Parse a Strimzi KafkaTopic CRD into our topic shape. */
function parseTopic(item: CRItem): StrimziTopic {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  const partitions = typeof spec.partitions === 'number' ? spec.partitions : 1
  const replicationFactor = typeof spec.replicas === 'number' ? spec.replicas : 1

  // Derive topic status from conditions
  let topicStatus: StrimziTopic['status'] = 'active'
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready' && cond.status === 'False') {
      topicStatus = 'error'
      break
    }
  }

  return {
    name: item.name,
    partitions,
    replicationFactor,
    status: topicStatus,
  }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchStrimziStatus(): Promise<StrimziStatus> {
  // Step 1: Detect Strimzi pods
  const resp = await authFetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const strimziPods = pods.filter(isStrimziPod)

  if (strimziPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const brokerPods = strimziPods.filter(isBrokerPod)
  const readyBrokers = brokerPods.filter(isPodReady).length
  const allReady = brokerPods.length > 0 && readyBrokers === brokerPods.length

  // Extract cluster name from pod labels
  const clusterName = strimziPods[0].labels?.['strimzi.io/cluster'] ?? 'kafka'

  // Step 2: Fetch Kafka and KafkaTopic CRDs (best-effort)
  const [kafkaItems, topicItems] = await Promise.all([
    fetchCR('kafka.strimzi.io', 'v1beta2', 'kafkas'),
    fetchCR('kafka.strimzi.io', 'v1beta2', 'kafkatopics'),
  ])

  // Extract Kafka version from the first Kafka CR
  let kafkaVersion = ''
  if (kafkaItems.length > 0) {
    const kafkaStatus = (kafkaItems[0].status ?? {}) as Record<string, unknown>
    kafkaVersion = (kafkaStatus.kafkaVersion as string) ?? ''
  }

  // Parse topics
  const topics = topicItems.map(parseTopic)

  return {
    health: allReady ? 'healthy' : 'degraded',
    clusterName,
    kafkaVersion,
    topics,
    consumerGroups: [], // Consumer groups require Kafka Admin API, not available via CRD
    brokers: { ready: readyBrokers, total: brokerPods.length },
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseStrimziStatusResult {
  data: StrimziStatus
  loading: boolean
  isRefreshing: boolean
  lastRefresh: number | null
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useStrimziStatus(): UseStrimziStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback, lastRefresh } =
    useCache<StrimziStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: STRIMZI_DEMO_DATA,
      persist: true,
      fetcher: fetchStrimziStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.brokers.total > 0 || (data.topics || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    lastRefresh,
  })

  return {
    data,
    loading: isLoading,
    isRefreshing,
    lastRefresh,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
