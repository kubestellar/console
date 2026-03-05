import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FLUENTD_DEMO_DATA, type FluentdDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'

export type FluentdStatus = FluentdDemoData

const INITIAL_DATA: FluentdStatus = {
  health: 'not-installed',
  pods: { ready: 0, total: 0 },
  bufferUtilization: 0,
  eventsPerSecond: 0,
  retryCount: 0,
  outputPlugins: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'fluentd-status'

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
 * Detect whether a pod belongs to Fluentd.
 */
function isFluentdPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'fluentd' ||
    labels['app.kubernetes.io/name'] === 'fluentd' ||
    labels['k8s-app'] === 'fluentd-logging' ||
    name.startsWith('fluentd-')
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

async function fetchFluentdStatus(): Promise<FluentdStatus> {
  const resp = await fetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const fluentdPods = pods.filter(isFluentdPod)

  if (fluentdPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = fluentdPods.filter(isPodReady).length
  const allReady = readyPods === fluentdPods.length

  return {
    health: allReady ? 'healthy' : 'degraded',
    pods: { ready: readyPods, total: fluentdPods.length },
    bufferUtilization: 0,
    eventsPerSecond: 0,
    retryCount: 0,
    outputPlugins: [],
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseFluentdStatusResult {
  data: FluentdStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useFluentdStatus(): UseFluentdStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<FluentdStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: FLUENTD_DEMO_DATA,
      persist: true,
      fetcher: fetchFluentdStatus,
    })

  // isDemoFallback is only true once initial loading has completed (demo mode
  // or demo fallback), so we can pass it through directly.
  const effectiveIsDemoData = isDemoFallback

  const hasAnyData = data.pods.total > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
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
