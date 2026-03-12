import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { KUBEVELA_DEMO_DATA, type KubeVelaDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'

export type KubeVelaStatus = KubeVelaDemoData

const INITIAL_DATA: KubeVelaStatus = {
  health: 'not-installed',
  pods: { ready: 0, total: 0 },
  apps: { total: 0, running: 0, failed: 0 },
  totalComponents: 0,
  totalTraits: 0,
  applications: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'kubevela-status'

/** Minimal pod shape returned by /api/mcp/pods. */
interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

/** Detect whether a pod belongs to the KubeVela controller manager. */
function isKubeVelaPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'kubevela' ||
    labels['app.kubernetes.io/name'] === 'vela-core' ||
    labels['app.kubernetes.io/name'] === 'kubevela' ||
    (labels['control-plane'] === 'controller-manager' && name.includes('vela')) ||
    name.startsWith('kubevela-') ||
    name.startsWith('vela-core-')
  )
}

/** Determine if a pod is running/ready based on its status string. */
function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

async function fetchKubeVelaStatus(): Promise<KubeVelaStatus> {
  const resp = await fetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const velaControllerPods = pods.filter(isKubeVelaPod)

  if (velaControllerPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = velaControllerPods.filter(isPodReady).length
  const allReady = readyPods === velaControllerPods.length

  return {
    health: allReady ? 'healthy' : 'degraded',
    pods: { ready: readyPods, total: velaControllerPods.length },
    apps: { total: 0, running: 0, failed: 0 },
    totalComponents: 0,
    totalTraits: 0,
    applications: [],
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseKubeVelaStatusResult {
  data: KubeVelaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useKubeVelaStatus(): UseKubeVelaStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<KubeVelaStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: KUBEVELA_DEMO_DATA,
      persist: true,
      fetcher: fetchKubeVelaStatus,
    })

  const effectiveIsDemoData = isDemoFallback

  const hasAnyData = data.pods.total > 0 || data.apps.total > 0

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
