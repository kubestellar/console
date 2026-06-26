import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  KNATIVE_DEMO_DATA,
  type KnativeDemoData,
  type KnativeServingService,
  type KnativeServiceStatus,
  type KnativeRevision,
  type KnativeRevisionStatus,
  type KnativeEventingBroker,
  type KnativeBrokerStatus,
  type KnativeTrafficTarget,
} from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

export type KnativeStatus = KnativeDemoData

// Re-export types consumed by the component
export type {
  KnativeServingService,
  KnativeServiceStatus,
  KnativeRevision,
  KnativeRevisionStatus,
  KnativeEventingBroker,
  KnativeBrokerStatus,
  KnativeTrafficTarget,
}

const INITIAL_DATA: KnativeStatus = {
  health: 'not-installed',
  servingControllerPods: { ready: 0, total: 0 },
  eventingControllerPods: { ready: 0, total: 0 },
  services: [],
  revisions: [],
  brokers: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'knative-status'

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
  generation?: number
  [key: string]: unknown
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isKnativeServingPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  const ns = (pod.namespace ?? '').toLowerCase()
  return (
    labels['app.kubernetes.io/part-of'] === 'knative-serving' ||
    labels['app'] === 'controller' && ns === 'knative-serving' ||
    name.startsWith('controller-') && ns === 'knative-serving' ||
    name.startsWith('activator-') && ns === 'knative-serving' ||
    name.startsWith('autoscaler-') && ns === 'knative-serving' ||
    name.startsWith('webhook-') && ns === 'knative-serving'
  )
}

function isKnativeEventingPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  const ns = (pod.namespace ?? '').toLowerCase()
  return (
    labels['app.kubernetes.io/part-of'] === 'knative-eventing' ||
    labels['app'] === 'eventing-controller' && ns === 'knative-eventing' ||
    name.startsWith('eventing-controller-') && ns === 'knative-eventing' ||
    name.startsWith('eventing-webhook-') && ns === 'knative-eventing' ||
    name.startsWith('mt-broker-controller-') && ns === 'knative-eventing'
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
// Service parser
// ---------------------------------------------------------------------------

function parseService(item: CRItem): KnativeServingService {
  const status = (item.status ?? {}) as Record<string, unknown>

  // URL
  const url = typeof status.url === 'string' ? status.url : ''

  // Latest revisions
  const latestCreatedRevision = typeof status.latestCreatedRevisionName === 'string'
    ? status.latestCreatedRevisionName : ''
  const latestReadyRevision = typeof status.latestReadyRevisionName === 'string'
    ? status.latestReadyRevisionName : ''

  // Generation
  const generation = typeof item.generation === 'number'
    ? item.generation
    : 0

  // Traffic from status (reflects actual state)
  const rawTraffic = Array.isArray(status.traffic) ? status.traffic : []
  const traffic: KnativeTrafficTarget[] = rawTraffic.map((t: unknown) => {
    const entry = t as Record<string, unknown>
    return {
      revisionName: typeof entry.revisionName === 'string' ? entry.revisionName : '',
      percent: typeof entry.percent === 'number' ? entry.percent : 0,
      latestRevision: entry.latestRevision === true,
      tag: typeof entry.tag === 'string' ? entry.tag : '',
    }
  })

  // Status from conditions
  let serviceStatus: KnativeServiceStatus = 'unknown'
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready') {
      serviceStatus = cond.status === 'True' ? 'ready' : 'not-ready'
      break
    }
  }


  return {
    name: item.name,
    namespace: item.namespace ?? '',
    status: serviceStatus,
    url,
    latestCreatedRevision,
    latestReadyRevision,
    generation,
    traffic,
  }
}

// ---------------------------------------------------------------------------
// Revision parser
// ---------------------------------------------------------------------------

function parseRevision(item: CRItem): KnativeRevision {
  const status = (item.status ?? {}) as Record<string, unknown>
  const labels = item.labels ?? {}
  const spec = (item.spec ?? {}) as Record<string, unknown>

  // Owning service from label
  const service = labels['serving.knative.dev/service'] ?? ''

  // Generation from label
  const genLabel = labels['serving.knative.dev/configurationGeneration'] ?? '0'
  const generation = parseInt(genLabel, 10) || 0

  // Container image
  let image = ''
  const containers = Array.isArray(spec.containers) ? spec.containers : []
  if (containers.length > 0) {
    const first = containers[0] as Record<string, unknown>
    image = typeof first.image === 'string' ? first.image : ''
  }

  // Ready replicas
  const readyReplicas = typeof status.readyReplicas === 'number' ? status.readyReplicas : 0

  // Status from conditions
  let revisionStatus: KnativeRevisionStatus = 'unknown'
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready') {
      if (cond.status === 'True') {
        revisionStatus = 'ready'
      } else if (cond.reason === 'Activating') {
        revisionStatus = 'activating'
      } else {
        revisionStatus = 'not-ready'
      }
      break
    }
  }

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    service,
    generation,
    image,
    readyReplicas,
    status: revisionStatus,
  }
}

// ---------------------------------------------------------------------------
// Broker parser
// ---------------------------------------------------------------------------

function parseBroker(item: CRItem): KnativeEventingBroker {
  const status = (item.status ?? {}) as Record<string, unknown>
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const annotations = item.annotations

  // Status from conditions
  let brokerStatus: KnativeBrokerStatus = 'unknown'
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready') {
      brokerStatus = cond.status === 'True' ? 'ready' : 'not-ready'
      break
    }
  }

  // Broker class from annotation, falling back to the default class
  const brokerClass =
    (annotations?.['eventing.knative.dev/broker.class'] as string) ?? 'MTChannelBasedBroker'

  // Dead-letter sink
  const delivery = (spec.delivery ?? {}) as Record<string, unknown>
  const hasDeadLetterSink = delivery.deadLetterSink != null

  // Trigger count not available from broker CRD itself — set 0, enriched later
  return {
    name: item.name,
    namespace: item.namespace ?? '',
    status: brokerStatus,
    triggerCount: 0,
    hasDeadLetterSink,
    brokerClass,
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
// Trigger counter
// ---------------------------------------------------------------------------

async function fetchTriggerCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  try {
    const items = await fetchCR('eventing.knative.dev', 'v1', 'triggers')
    for (const item of items) {
      const spec = (item.spec ?? {}) as Record<string, unknown>
      const brokerRef = (spec.broker as string) ?? 'default'
      const ns = item.namespace ?? ''
      const key = `${ns}/${brokerRef}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  } catch {
    // best-effort — triggers may not be accessible
  }
  return counts
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchKnativeStatus(): Promise<KnativeStatus> {
  // Step 1: Detect Knative pods (serving + eventing)
  const labeledServingPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app.kubernetes.io%2Fpart-of%3Dknative-serving`,
  ).catch(() => [] as BackendPodInfo[])

  const labeledEventingPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app.kubernetes.io%2Fpart-of%3Dknative-eventing`,
  ).catch(() => [] as BackendPodInfo[])

  let servingPods = labeledServingPods.filter(isKnativeServingPod)
  let eventingPods = labeledEventingPods.filter(isKnativeEventingPod)

  // Fallback: unfiltered pod list if label selectors returned nothing
  if (servingPods.length === 0 && eventingPods.length === 0) {
    const allPods = await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`).catch(() => [] as BackendPodInfo[])
    servingPods = allPods.filter(isKnativeServingPod)
    eventingPods = allPods.filter(isKnativeEventingPod)
  }

  // No Knative at all
  if (servingPods.length === 0 && eventingPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyServing = servingPods.filter(isPodReady).length
  const readyEventing = eventingPods.filter(isPodReady).length
  const allServingReady = servingPods.length > 0 ? readyServing === servingPods.length : true
  const allEventingReady = eventingPods.length > 0 ? readyEventing === eventingPods.length : true

  // Step 2: Fetch CRDs in parallel (best-effort)
  const [serviceItems, revisionItems, brokerItems, triggerCounts] = await Promise.all([
    fetchCR('serving.knative.dev', 'v1', 'services'),
    fetchCR('serving.knative.dev', 'v1', 'revisions'),
    fetchCR('eventing.knative.dev', 'v1', 'brokers'),
    fetchTriggerCounts(),
  ])

  const services = serviceItems.map(parseService)
  const revisions = revisionItems.map(parseRevision)
  const brokers = brokerItems.map(parseBroker).map(b => ({
    ...b,
    triggerCount: triggerCounts.get(`${b.namespace}/${b.name}`) ?? 0,
  }))

  // Step 3: Determine health
  const hasNotReadyServices = services.some(s => s.status !== 'ready')
  const hasNotReadyBrokers = brokers.some(b => b.status !== 'ready')
  const allPodsReady = allServingReady && allEventingReady
  const health = (allPodsReady && !hasNotReadyServices && !hasNotReadyBrokers)
    ? 'healthy' : 'degraded'

  return {
    health,
    servingControllerPods: { ready: readyServing, total: servingPods.length },
    eventingControllerPods: { ready: readyEventing, total: eventingPods.length },
    services,
    revisions,
    brokers,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseKnativeStatusResult {
  data: KnativeStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
  isDemoFallback: boolean
}

export function useKnativeStatus(): UseKnativeStatusResult {
  const { isDemoMode } = useDemoMode()

  const {
    data: liveData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
  } = useCache<KnativeStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KNATIVE_DEMO_DATA,
    persist: true,
    fetcher: fetchKnativeStatus,
  })

  const data = isDemoMode ? KNATIVE_DEMO_DATA : liveData
  const effectiveIsDemoData = isDemoMode || (isDemoFallback && !isLoading)

  const hasAnyData =
    (data.servingControllerPods?.total ?? 0) > 0 ||
    (data.eventingControllerPods?.total ?? 0) > 0 ||
    (data.services || []).length > 0 ||
    (data.revisions || []).length > 0 ||
    (data.brokers || []).length > 0

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
