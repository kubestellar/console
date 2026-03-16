import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { CONTOUR_DEMO_DATA } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import type { ContourDemoData } from './demoData'

export type ContourStatus = ContourDemoData

const INITIAL_DATA: ContourStatus = {
  health: 'not-installed',
  contourPods: { ready: 0, total: 0 },
  envoyPods: { ready: 0, total: 0 },
  httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 },
  tlsEnabled: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'contour-status'

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
 * Detect whether a pod belongs to the Contour controller.
 * Contour uses labels like `app=contour` or `app.kubernetes.io/name=contour`.
 */
function isContourPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'contour' ||
    labels['app.kubernetes.io/name'] === 'contour' ||
    labels['app.kubernetes.io/component'] === 'contour' ||
    name.startsWith('contour-')
  )
}

/**
 * Detect whether a pod belongs to the Envoy proxy managed by Contour.
 */
function isEnvoyPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'envoy' ||
    labels['app.kubernetes.io/name'] === 'envoy' ||
    labels['app.kubernetes.io/component'] === 'envoy' ||
    name.startsWith('envoy-')
  )
}

/**
 * Determine if a pod is running/ready based on its status string.
 */
function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  // "Running" + all containers ready
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

async function fetchContourStatus(): Promise<ContourStatus> {
  const resp = await authFetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const contourPodList = pods.filter(isContourPod)
  const envoyPodList = pods.filter(isEnvoyPod)

  const contourReady = contourPodList.filter(isPodReady).length
  const envoyReady = envoyPodList.filter(isPodReady).length

  // If no Contour or Envoy pods found at all → not installed
  if (contourPodList.length === 0 && envoyPodList.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const allHealthy =
    contourReady === contourPodList.length &&
    envoyReady === envoyPodList.length &&
    contourPodList.length > 0 &&
    envoyPodList.length > 0

  // HTTPProxy stats are not currently surfaced through the stock API endpoints.
  // We leave them as zeros in live mode so the card clearly indicates
  // "live pods detected" without fabricating CRD data.
  return {
    health: allHealthy ? 'healthy' : 'degraded',
    contourPods: { ready: contourReady, total: contourPodList.length },
    envoyPods: { ready: envoyReady, total: envoyPodList.length },
    httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 },
    tlsEnabled: 0,
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseContourStatusResult {
  data: ContourStatus
  loading: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useContourStatus(): UseContourStatusResult {
  const { data, isLoading, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<ContourStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: CONTOUR_DEMO_DATA,
      persist: true,
      fetcher: fetchContourStatus,
    })

  // hasAnyData is true only when live pod data exists.
  // 'not-installed' is NOT counted as "has data" so that:
  //   - a successful fetch with no pods (health='not-installed') triggers showEmptyState,
  //     and the component falls through to the data.health === 'not-installed' check.
  //   - a failed fetch with initial data (also health='not-installed') sets error=true
  //     so the component shows the fetchError UI instead.
  const hasAnyData = data.contourPods.total > 0 || data.envoyPods.total > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  return {
    data,
    loading: isLoading,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
