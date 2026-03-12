import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { KEDA_DEMO_DATA, type KedaDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'

export type KedaStatus = KedaDemoData

const INITIAL_DATA: KedaStatus = {
  health: 'not-installed',
  operatorPods: { ready: 0, total: 0 },
  scaledObjects: [],
  totalScaledJobs: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'keda-status'

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
 * Detect whether a pod belongs to the KEDA operator.
 * KEDA uses labels like `app=keda-operator` or `app.kubernetes.io/name=keda-operator`.
 */
function isKedaOperatorPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'keda-operator' ||
    labels['app.kubernetes.io/name'] === 'keda-operator' ||
    labels['app.kubernetes.io/part-of'] === 'keda-operator' ||
    name.startsWith('keda-operator') ||
    name.startsWith('keda-metrics-apiserver')
  )
}

/**
 * Determine if a pod is running/ready.
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
 * Fetch pods using the given URL, returning the parsed pod list.
 */
async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

/**
 * Fetch KEDA operator status via the console backend proxy.
 *
 * First attempts a label-filtered request using the KEDA part-of label to
 * minimise data transfer in large clusters.  If the filtered call returns no
 * pods we fall back to an unfiltered call so installations that do not set
 * that label (or use custom labels) are still detected.
 *
 * ScaledObject CRD data is not available through the current stock API
 * endpoints, so we surface pod health only in live mode.
 */
async function fetchKedaStatus(): Promise<KedaStatus> {
  // Try label-filtered first (transfers far fewer bytes in large clusters)
  const labeledPods = await fetchPods(
    '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fpart-of%3Dkeda-operator',
  )
  const kedaPods = labeledPods.length > 0
    ? labeledPods.filter(isKedaOperatorPod)
    : // Fall back to unfiltered scan if the label isn't present
      (await fetchPods('/api/mcp/pods')).filter(isKedaOperatorPod)

  if (kedaPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = kedaPods.filter(isPodReady).length
  const allReady = readyPods === kedaPods.length

  return {
    health: allReady ? 'healthy' : 'degraded',
    operatorPods: { ready: readyPods, total: kedaPods.length },
    // ScaledObject CRD data requires the KEDA API or Kubernetes CRD API,
    // which is not proxied by the current backend. We return live pod data
    // only, without fabricating ScaledObject metrics.
    scaledObjects: [],
    totalScaledJobs: 0,
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseKedaStatusResult {
  data: KedaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useKedaStatus(): UseKedaStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<KedaStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KEDA_DEMO_DATA,
    persist: true,
    fetcher: fetchKedaStatus,
  })

  // Never show demo data during initial loading — CardWrapper should show the
  // skeleton until live data arrives, not immediately render demo + Demo badge.
  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.operatorPods.total > 0 || data.scaledObjects.length > 0

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
