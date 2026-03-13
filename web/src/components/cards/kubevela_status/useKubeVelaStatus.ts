import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { KUBEVELA_DEMO_DATA, type KubeVelaDemoData, type KubeVelaApplication } from './demoData'
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
    const resp = await fetch(`/api/mcp/custom-resources?${params}`, {
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

/** Parse a KubeVela Application CRD into our app shape. */
function parseApplication(item: CRItem): KubeVelaApplication {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  // Count components and traits from spec
  const components = Array.isArray(spec.components) ? spec.components : []
  let traitCount = 0
  for (const comp of components) {
    const c = comp as Record<string, unknown>
    const traits = Array.isArray(c.traits) ? c.traits : []
    traitCount += traits.length
  }

  // Workflow status
  const workflow = (status.workflow ?? {}) as Record<string, unknown>
  const steps = Array.isArray(workflow.steps) ? workflow.steps : []
  const completedSteps = steps.filter((s: unknown) => {
    const step = s as Record<string, unknown>
    return step.phase === 'succeeded'
  }).length

  // Derive app status from CRD status
  const appStatus = (status.status as string) ?? ''
  let mappedStatus: KubeVelaApplication['status'] = 'running'
  if (appStatus === 'running' || appStatus === 'runningWorkflow') mappedStatus = 'running'
  else if (appStatus === 'workflowSuspending') mappedStatus = 'workflowSuspending'
  else if (appStatus === 'workflowTerminated') mappedStatus = 'workflowTerminated'
  else if (appStatus === 'workflowFailed') mappedStatus = 'workflowFailed'
  else if (appStatus === 'unhealthy') mappedStatus = 'unhealthy'
  else if (appStatus === 'deleting') mappedStatus = 'deleting'

  // Message from conditions
  let message: string | undefined
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.status === 'False' && typeof cond.message === 'string') {
      message = cond.message as string
      break
    }
  }

  // We don't have creationTimestamp from the CRD response; default to 0
  const ageMinutes = 0

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    status: mappedStatus,
    components: components.length,
    traits: traitCount,
    workflowSteps: steps.length,
    workflowStepsCompleted: completedSteps,
    message,
    ageMinutes,
  }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchKubeVelaStatus(): Promise<KubeVelaStatus> {
  // Step 1: Detect controller pods
  const resp = await fetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []
  const velaControllerPods = pods.filter(isKubeVelaPod)

  if (velaControllerPods.length === 0) {
    return { ...INITIAL_DATA, health: 'not-installed', lastCheckTime: new Date().toISOString() }
  }

  const readyPods = velaControllerPods.filter(isPodReady).length
  const allReady = readyPods === velaControllerPods.length

  // Step 2: Fetch OAM Application CRDs (best-effort)
  const appItems = await fetchCR('core.oam.dev', 'v1beta1', 'applications')
  const applications = appItems.map(parseApplication)

  // Aggregate stats
  const running = applications.filter(a => a.status === 'running').length
  const failed = applications.filter(a =>
    a.status === 'workflowFailed' || a.status === 'unhealthy',
  ).length
  const totalComponents = applications.reduce((sum, a) => sum + a.components, 0)
  const totalTraits = applications.reduce((sum, a) => sum + a.traits, 0)

  return {
    health: allReady ? 'healthy' : 'degraded',
    pods: { ready: readyPods, total: velaControllerPods.length },
    apps: { total: applications.length, running, failed },
    totalComponents,
    totalTraits,
    applications,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.health !== 'not-installed'
    ? ((data.pods?.total ?? 0) > 0 || (data.apps?.total ?? 0) > 0)
    : true

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
