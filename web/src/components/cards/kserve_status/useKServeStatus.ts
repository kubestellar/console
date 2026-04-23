import { useCache } from '../../../lib/cache'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import {
  KSERVE_DEMO_DATA,
  type KServeDemoData,
  type KServeService,
  type KServeServiceStatus,
} from './demoData'

const CACHE_KEY = 'kserve-status'

interface PodInfo {
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
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  labels?: Record<string, string>
  annotations?: Record<string, string>
  generation?: number
}

interface CRResponse {
  items?: CRItem[]
}

const INITIAL_DATA: KServeDemoData = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  services: [],
  totalRequestsPerSecond: 0,
  avgP95LatencyMs: 0,
  lastCheckTime: new Date(0).toISOString(),
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isKServeControllerPod(pod: PodInfo): boolean {
  const labels = pod.labels ?? {}
  const ns = (pod.namespace ?? '').toLowerCase()
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app.kubernetes.io/part-of'] === 'kserve' ||
    labels['app.kubernetes.io/name'] === 'kserve-controller-manager' ||
    labels['app'] === 'kserve-controller-manager' ||
    (ns === 'kserve' && name.startsWith('kserve-controller-manager')) ||
    (ns === 'kserve' && name.startsWith('kserve-webhook-server'))
  )
}

function isPodReady(pod: PodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  if (status !== 'running') return false
  const ready = pod.ready ?? ''
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

async function fetchPods(url: string): Promise<PodInfo[]> {
  const resp = await authFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body: { pods?: PodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

async function fetchCR(
  group: string,
  version: string,
  resource: string,
): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`${LOCAL_AGENT_HTTP_URL}/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: CRResponse = await resp.json()
    return Array.isArray(body.items) ? body.items : []
  } catch {
    return []
  }
}

async function fetchInferenceServices(): Promise<CRItem[]> {
  const versions = ['v1beta1', 'v1alpha1', 'v1']
  for (const version of versions) {
    const items = await fetchCR('serving.kserve.io', version, 'inferenceservices')
    if (items.length > 0) return items
  }
  return []
}

function parseService(item: CRItem): KServeService {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const annotations = item.annotations ?? {}
  const predictor = asRecord(spec.predictor)
  const predictorModel = asRecord(predictor.model)
  const predictorStatus = asRecord(asRecord(status.components).predictor)

  let serviceStatus: KServeServiceStatus = 'unknown'
  let updatedAt = new Date().toISOString()
  const conditions = Array.isArray(status.conditions) ? status.conditions : []
  for (const cond of conditions) {
    const c = asRecord(cond)
    if (c.type === 'Ready') {
      serviceStatus = c.status === 'True' ? 'ready' : 'not-ready'
      updatedAt = asString(c.lastTransitionTime, updatedAt)
      break
    }
  }

  const runtime = asString(
    predictor.runtime,
    asString(predictorModel.runtime, 'unknown'),
  )
  const modelFormat = asRecord(predictorModel.modelFormat)
  const modelName =
    asString(predictorModel.storageUri).split('/').pop() ||
    asString(modelFormat.name, 'model')

  const qpsFromMetrics = asNumber(asRecord(status.metrics).requestsPerSecond)
  const latencyFromMetrics = asNumber(asRecord(status.metrics).p95LatencyMs)
  const qpsFromAnnotations = Number.parseFloat(annotations['metrics.kserve.io/rps'] ?? '0')
  const p95FromAnnotations = Number.parseFloat(annotations['metrics.kserve.io/p95-ms'] ?? '0')
  const qps = Number.isFinite(qpsFromMetrics)
    ? qpsFromMetrics
    : Number.isFinite(qpsFromAnnotations)
      ? qpsFromAnnotations
      : 0
  const p95 = Number.isFinite(latencyFromMetrics)
    ? latencyFromMetrics
    : Number.isFinite(p95FromAnnotations)
      ? p95FromAnnotations
      : 0

  return {
    id: `isvc-${item.cluster}-${item.namespace ?? 'default'}-${item.name}`,
    name: item.name,
    namespace: item.namespace ?? 'default',
    cluster: item.cluster,
    status: serviceStatus,
    modelName,
    runtime,
    url: asString(status.url),
    trafficPercent: asNumber(spec.canaryTrafficPercent, 100),
    readyReplicas: asNumber(predictorStatus.readyReplicas),
    desiredReplicas: asNumber(predictorStatus.replicas),
    requestsPerSecond: qps,
    p95LatencyMs: p95,
    updatedAt,
  }
}

async function fetchKServeStatus(): Promise<KServeDemoData> {
  const labeled = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app.kubernetes.io%2Fname%3Dkserve-controller-manager`,
  ).catch(() => [] as PodInfo[])

  const controllerPods = labeled.length > 0
    ? labeled.filter(isKServeControllerPod)
    : (await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`).catch(() => [] as PodInfo[])).filter(isKServeControllerPod)

  if (controllerPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const services = (await fetchInferenceServices()).map(parseService)
  const readyPods = controllerPods.filter(isPodReady).length
  const allControllerPodsReady = readyPods === controllerPods.length
  const hasNotReadyService = services.some(s => s.status !== 'ready')
  const health = (allControllerPodsReady && !hasNotReadyService)
    ? 'healthy'
    : 'degraded'

  const totalRps = services.reduce((sum, s) => sum + s.requestsPerSecond, 0)
  const totalLatency = services.reduce((sum, s) => sum + s.p95LatencyMs, 0)
  const avgP95 = services.length > 0 ? Math.round(totalLatency / services.length) : 0

  return {
    health,
    controllerPods: { ready: readyPods, total: controllerPods.length },
    services,
    totalRequestsPerSecond: Math.round(totalRps * 10) / 10,
    avgP95LatencyMs: avgP95,
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseKServeStatusResult {
  data: KServeDemoData
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useKServeStatus(): UseKServeStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCache<KServeDemoData>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KSERVE_DEMO_DATA,
    persist: true,
    fetcher: fetchKServeStatus,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  }
}
