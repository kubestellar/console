import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { STRIMZI_DEMO_DATA, type StrimziDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

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

/**
 * Minimal pod shape returned by /api/mcp/pods.
 */
interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

/**
 * Detect whether a pod belongs to Strimzi.
 */
function isStrimziPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['strimzi.io/cluster'] !== undefined ||
    labels['app.kubernetes.io/managed-by'] === 'strimzi-cluster-operator' ||
    name.startsWith('strimzi-cluster-operator') ||
    name.includes('-kafka-') ||
    name.includes('-zookeeper-')
  )
}

/**
 * Determine if a pod is running/ready based on its status string.
 */
function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

/**
 * Extract broker pods (kafka pods, not zookeeper or operator).
 */
function isBrokerPod(pod: BackendPodInfo): boolean {
  const name = (pod.name ?? '').toLowerCase()
  return name.includes('-kafka-') && !name.includes('zookeeper')
}

async function fetchStrimziStatus(): Promise<StrimziStatus> {
  const resp = await fetch('/api/mcp/pods', {
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

  return {
    health: allReady ? 'healthy' : 'degraded',
    clusterName,
    kafkaVersion: '',
    topics: [],
    consumerGroups: [],
    brokers: { ready: readyBrokers, total: brokerPods.length },
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseStrimziStatusResult {
  data: StrimziStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useStrimziStatus(): UseStrimziStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<StrimziStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: STRIMZI_DEMO_DATA,
      persist: true,
      fetcher: fetchStrimziStatus,
    })

  const effectiveIsDemoData = isDemoFallback

  const hasAnyData = data.brokers.total > 0 || data.topics.length > 0

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
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
