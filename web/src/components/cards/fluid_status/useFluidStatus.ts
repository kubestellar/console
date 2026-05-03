import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  FLUID_DEMO_DATA,
  type FluidDemoData,
  type FluidDataset,
  type FluidDatasetStatus,
  type FluidRuntime,
  type FluidRuntimeStatus,
  type FluidDataLoad,
  type FluidDataLoadPhase,
} from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

export type FluidStatus = FluidDemoData

// Re-export types consumed by the component
export type {
  FluidDataset,
  FluidDatasetStatus,
  FluidRuntime,
  FluidRuntimeStatus,
  FluidDataLoad,
  FluidDataLoadPhase,
}

const INITIAL_DATA: FluidStatus = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  datasets: [],
  runtimes: [],
  dataLoads: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'fluid-status'

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

function isFluidControllerPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  const ns = (pod.namespace ?? '').toLowerCase()
  const isFluidSystemControllerByName =
    ns === 'fluid-system' &&
    (
      name.startsWith('controller-manager-') ||
      name.startsWith('dataset-controller-') ||
      name.startsWith('csi-nodeplugin-') ||
      name.startsWith('fluid-webhook-')
    )
  return (
    labels['app'] === 'fluid' ||
    labels['app.kubernetes.io/name'] === 'fluid' ||
    isFluidSystemControllerByName
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
// Dataset parser
// ---------------------------------------------------------------------------

const PERCENT_MAX = 100

function parseDataset(item: CRItem): FluidDataset {
  const status = (item.status ?? {}) as Record<string, unknown>
  const spec = (item.spec ?? {}) as Record<string, unknown>

  // Status phase
  const phase = typeof status.phase === 'string' ? status.phase.toLowerCase() : ''
  let datasetStatus: FluidDatasetStatus = 'unknown'
  if (phase === 'bound' || phase === 'ready') {
    datasetStatus = 'bound'
  } else if (phase === 'notbound' || phase === 'not-bound' || phase === 'pending' || phase === 'created') {
    datasetStatus = 'not-bound'
  }

  // Source from spec.mounts
  let source = ''
  const mounts = Array.isArray(spec.mounts) ? spec.mounts : []
  if (mounts.length > 0) {
    const firstMount = mounts[0] as Record<string, unknown>
    const mountPoint = typeof firstMount.mountPoint === 'string' ? firstMount.mountPoint : ''
    const name = typeof firstMount.name === 'string' ? firstMount.name : ''
    source = mountPoint || name
  }

  // Cache percentage
  const cacheStates = status.cacheStates as Record<string, string> | undefined
  let cachedPercentage = 0
  if (cacheStates) {
    const cached = cacheStates['cached'] ?? cacheStates['cacheCapacity'] ?? ''
    const total = cacheStates['total'] ?? ''
    if (cached && total) {
      // Try to parse as percentage string (e.g. "87%")
      const pctMatch = cached.match(/(\d+(\.\d+)?)%/)
      if (pctMatch) {
        cachedPercentage = Math.min(parseFloat(pctMatch[1]), PERCENT_MAX)
      }
    }
    // Also try 'cacheHitRatio' as a fallback
    const hitRatio = cacheStates['cacheHitRatio'] ?? ''
    if (cachedPercentage === 0 && hitRatio) {
      const ratioMatch = hitRatio.match(/(\d+(\.\d+)?)/)
      if (ratioMatch) {
        cachedPercentage = Math.min(parseFloat(ratioMatch[1]), PERCENT_MAX)
      }
    }
  }

  // Total size
  const totalSize = typeof status.ufsTotal === 'string'
    ? status.ufsTotal
    : typeof (cacheStates ?? {})['total'] === 'string'
      ? (cacheStates as Record<string, string>)['total']
      : ''

  // File count from status
  const fileNum = status.fileNum as string | undefined
  const fileCount = fileNum ? parseInt(fileNum, 10) || 0 : 0

  // Runtime type from label or status
  const runtimeType = (item.labels ?? {})['fluid.io/runtime-type'] ??
    (typeof status.runtimeType === 'string' ? status.runtimeType : '')

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    status: datasetStatus,
    source,
    cachedPercentage,
    totalSize,
    fileCount,
    runtimeType,
  }
}

// ---------------------------------------------------------------------------
// Runtime parser
// ---------------------------------------------------------------------------

function parseRuntime(item: CRItem, runtimeType: string): FluidRuntime {
  const status = (item.status ?? {}) as Record<string, unknown>

  // Pod readiness
  const masterReadyCount = typeof status.masterNumberReady === 'number'
    ? status.masterNumberReady : 0
  const masterDesired = typeof status.desiredMasterNumberScheduled === 'number'
    ? status.desiredMasterNumberScheduled : 1
  const workerReadyCount = typeof status.workerNumberReady === 'number'
    ? status.workerNumberReady : 0
  const workerDesired = typeof status.desiredWorkerNumberScheduled === 'number'
    ? status.desiredWorkerNumberScheduled : 0
  const fuseReadyCount = typeof status.fuseNumberReady === 'number'
    ? status.fuseNumberReady : 0
  const fuseDesired = typeof status.desiredFuseNumberScheduled === 'number'
    ? status.desiredFuseNumberScheduled : 0

  // Status from conditions
  let runtimeStatus: FluidRuntimeStatus = 'unknown'
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready') {
      runtimeStatus = cond.status === 'True' ? 'ready' : 'not-ready'
      break
    }
  }
  // Fallback: check phase
  if (runtimeStatus === 'unknown') {
    const phase = typeof status.phase === 'string' ? status.phase.toLowerCase() : ''
    if (phase === 'ready') runtimeStatus = 'ready'
    else if (phase === 'notready' || phase === 'not-ready' || phase === 'pending') {
      runtimeStatus = 'not-ready'
    }
  }

  // Cache capacity and usage
  const cacheStates = status.cacheStates as Record<string, string> | undefined
  const cacheCapacity = cacheStates?.['cacheCapacity'] ?? cacheStates?.['capacity'] ?? ''
  const cacheUsed = cacheStates?.['cached'] ?? cacheStates?.['used'] ?? ''

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    type: runtimeType,
    status: runtimeStatus,
    masterReady: { ready: masterReadyCount, total: masterDesired },
    workerReady: { ready: workerReadyCount, total: workerDesired },
    fuseReady: { ready: fuseReadyCount, total: fuseDesired },
    cacheCapacity,
    cacheUsed,
  }
}

// ---------------------------------------------------------------------------
// DataLoad parser
// ---------------------------------------------------------------------------

function parseDataLoad(item: CRItem): FluidDataLoad {
  const status = (item.status ?? {}) as Record<string, unknown>
  const spec = (item.spec ?? {}) as Record<string, unknown>

  // Dataset ref
  const datasetRef = (spec.dataset ?? {}) as Record<string, unknown>
  const dataset = typeof datasetRef.name === 'string' ? datasetRef.name : ''

  // Phase
  const rawPhase = typeof status.phase === 'string' ? status.phase.toLowerCase() : ''
  let phase: FluidDataLoadPhase = 'pending'
  if (rawPhase === 'complete' || rawPhase === 'completed' || rawPhase === 'succeed') {
    phase = 'complete'
  } else if (rawPhase === 'loading' || rawPhase === 'executing' || rawPhase === 'running') {
    phase = 'loading'
  } else if (rawPhase === 'failed' || rawPhase === 'error') {
    phase = 'failed'
  }

  // Progress — Fluid DataLoad status may include a duration but not always progress
  let progress = 0
  if (phase === 'complete') {
    progress = PERCENT_MAX
  } else if (typeof status.progress === 'string') {
    const pctMatch = status.progress.match(/(\d+)/)
    if (pctMatch) progress = Math.min(parseInt(pctMatch[1], 10), PERCENT_MAX)
  }

  // Duration
  const duration = typeof status.duration === 'string' ? status.duration : ''

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    dataset,
    phase,
    progress,
    duration,
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
// Runtime type constants — API groups for each runtime
// ---------------------------------------------------------------------------

const RUNTIME_TYPES = [
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'alluxioruntimes', type: 'Alluxio' },
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'juicefsruntimes', type: 'JuiceFS' },
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'jindoruntimes', type: 'JindoFS' },
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'goosefsruntimes', type: 'GooseFS' },
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'efcruntimes', type: 'EFC' },
  { group: 'data.fluid.io', version: 'v1alpha1', resource: 'thinruntimes', type: 'Thin' },
] as const

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchFluidStatus(): Promise<FluidStatus> {
  // Step 1: Detect Fluid controller pods
  const labeledPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app%3Dfluid`,
  ).catch(() => [] as BackendPodInfo[])

  let controllerPods = labeledPods.filter(isFluidControllerPod)

  // Fallback: if label selector returned nothing, try namespace filter
  if (controllerPods.length === 0) {
    const nsPods = await fetchPods(
      `${LOCAL_AGENT_HTTP_URL}/pods?namespace=fluid-system`,
    ).catch(() => [] as BackendPodInfo[])
    controllerPods = nsPods.filter(isFluidControllerPod)
  }

  // Fallback: unfiltered pod list
  if (controllerPods.length === 0) {
    const allPods = await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`)
      .catch(() => [] as BackendPodInfo[])
    controllerPods = allPods.filter(isFluidControllerPod)
  }

  // No Fluid at all
  if (controllerPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyControllers = controllerPods.filter(isPodReady).length

  // Step 2: Fetch CRDs in parallel (best-effort)
  const [datasetItems, dataLoadItems, ...runtimeResults] = await Promise.all([
    fetchCR('data.fluid.io', 'v1alpha1', 'datasets'),
    fetchCR('data.fluid.io', 'v1alpha1', 'dataloads'),
    ...RUNTIME_TYPES.map(rt =>
      fetchCR(rt.group, rt.version, rt.resource).then(items =>
        items.map(item => parseRuntime(item, rt.type)),
      ),
    ),
  ])

  const datasets = (datasetItems || []).map(parseDataset)
  const dataLoads = (dataLoadItems || []).map(parseDataLoad)
  const runtimes = (runtimeResults || []).flat()

  // Step 3: Determine health
  const allControllersReady = readyControllers === controllerPods.length
  const hasNotBoundDatasets = datasets.some(d => d.status !== 'bound')
  const hasNotReadyRuntimes = runtimes.some(r => r.status !== 'ready')
  const hasFailedLoads = dataLoads.some(dl => dl.phase === 'failed')

  const health =
    allControllersReady && !hasNotBoundDatasets && !hasNotReadyRuntimes && !hasFailedLoads
      ? 'healthy'
      : 'degraded'

  return {
    health,
    controllerPods: { ready: readyControllers, total: controllerPods.length },
    datasets,
    runtimes,
    dataLoads,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFluidStatusResult {
  data: FluidStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
  isDemoFallback: boolean
}

export function useFluidStatus(): UseFluidStatusResult {
  const { isDemoMode } = useDemoMode()

  const {
    data: liveData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
  } = useCache<FluidStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: FLUID_DEMO_DATA,
    persist: true,
    fetcher: fetchFluidStatus,
  })

  const data = isDemoMode ? FLUID_DEMO_DATA : liveData
  const effectiveIsDemoData = isDemoMode || (isDemoFallback && !isLoading)

  const hasAnyData =
    (data.controllerPods?.total ?? 0) > 0 ||
    (data.datasets || []).length > 0 ||
    (data.runtimes || []).length > 0 ||
    (data.dataLoads || []).length > 0

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
