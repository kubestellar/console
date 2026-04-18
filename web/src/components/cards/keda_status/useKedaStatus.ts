import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { KEDA_DEMO_DATA, type KedaDemoData, type KedaScaledObject, type KedaTriggerType } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

export type KedaStatus = KedaDemoData

const INITIAL_DATA: KedaStatus = {
  health: 'not-installed',
  operatorPods: { ready: 0, total: 0 },
  scaledObjects: [],
  totalScaledJobs: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'keda-status'

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

/** Known KEDA trigger types that map to our union type. */
const KNOWN_TRIGGER_TYPES = new Set<string>([
  'kafka', 'prometheus', 'rabbitmq', 'aws-sqs-queue',
  'azure-servicebus', 'redis', 'cron', 'cpu', 'memory', 'external',
])

/** Parse a KEDA ScaledObject CRD into our app shape. */
function parseScaledObject(item: CRItem): KedaScaledObject {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  // Target workload
  const scaleTargetRef = (spec.scaleTargetRef ?? {}) as Record<string, unknown>
  const target = (scaleTargetRef.name as string) ?? ''

  // Replica bounds
  const minReplicas = typeof spec.minReplicaCount === 'number' ? spec.minReplicaCount : 0
  const maxReplicas = typeof spec.maxReplicaCount === 'number' ? spec.maxReplicaCount : 0

  // Parse triggers from spec
  const rawTriggers = Array.isArray(spec.triggers) ? spec.triggers : []
  const triggers = rawTriggers.map((t: unknown) => {
    const trigger = t as Record<string, unknown>
    const triggerType = (trigger.type as string) ?? 'external'
    const metadata = (trigger.metadata ?? {}) as Record<string, string>

    // Derive a human-readable source from trigger metadata
    const source = metadata.topic ?? metadata.queueName ?? metadata.query ??
      metadata.address ?? metadata.schedule ?? metadata.listName ?? triggerType

    return {
      type: (KNOWN_TRIGGER_TYPES.has(triggerType) ? triggerType : 'external') as KedaTriggerType,
      source,
      currentValue: 0,
      targetValue: 0,
    }
  })

  // Derive status from conditions
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  let scaledObjectStatus: KedaScaledObject['status'] = 'ready'
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready' && cond.status === 'False') {
      scaledObjectStatus = 'error'
      break
    }
    if (cond.type === 'Active' && cond.status === 'False') {
      scaledObjectStatus = 'paused'
    }
  }

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    status: scaledObjectStatus,
    target,
    currentReplicas: 0,
    desiredReplicas: 0,
    minReplicas,
    maxReplicas,
    triggers,
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

async function fetchKedaStatus(): Promise<KedaStatus> {
  // Step 1: Detect operator pods (label-filtered first, then unfiltered fallback)
  const labeledPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app.kubernetes.io%2Fpart-of%3Dkeda-operator`,
  )
  const kedaPods = labeledPods.length > 0
    ? labeledPods.filter(isKedaOperatorPod)
    : (await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`)).filter(isKedaOperatorPod)

  if (kedaPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = kedaPods.filter(isPodReady).length
  const allReady = readyPods === kedaPods.length

  // Step 2: Fetch ScaledObject and ScaledJob CRDs (best-effort)
  const [scaledObjectItems, scaledJobItems] = await Promise.all([
    fetchCR('keda.sh', 'v1alpha1', 'scaledobjects'),
    fetchCR('keda.sh', 'v1alpha1', 'scaledjobs'),
  ])

  const scaledObjects = scaledObjectItems.map(parseScaledObject)

  return {
    health: allReady ? 'healthy' : 'degraded',
    operatorPods: { ready: readyPods, total: kedaPods.length },
    scaledObjects,
    totalScaledJobs: scaledJobItems.length,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
  // #8836: subscribe to demo mode toggles so the card swaps to demo data
  // immediately (and shows the Demo badge / yellow outline) when the user
  // flips demo mode on, instead of only switching when the cache layer falls
  // back after a fetch failure.
  const { isDemoMode } = useDemoMode()

  const {
    data: liveData,
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

  const data = isDemoMode ? KEDA_DEMO_DATA : liveData
  const effectiveIsDemoData = isDemoMode || (isDemoFallback && !isLoading)

  const hasAnyData = (data.operatorPods?.total ?? 0) > 0 || (data.scaledObjects || []).length > 0

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
  }
}
