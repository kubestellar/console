import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FLUENTD_DEMO_DATA, type FluentdDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'

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

/** Namespace where Fluentd is commonly deployed. */
const LOGGING_NAMESPACE = 'logging'
/** Max event records fetched to estimate event throughput. */
const EVENT_SAMPLE_LIMIT = 200
/** Default time window (seconds) used when event timestamps are unavailable. */
const DEFAULT_EVENT_WINDOW_SECONDS = 60

/**
 * Minimal pod shape returned by /api/mcp/pods.
 */
interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  restarts?: number
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

interface BackendDaemonSetInfo {
  name?: string
  namespace?: string
  desiredScheduled?: number
  currentScheduled?: number
  ready?: number
  labels?: Record<string, string>
}

interface BackendEventInfo {
  reason?: string
  message?: string
  object?: string
  namespace?: string
  count?: number
  firstSeen?: string
  lastSeen?: string
}

/**
 * Detect whether a pod belongs to Fluentd.
 */
export function isFluentdPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}

  return (
    labels['app'] === 'fluentd' ||
    labels['app.kubernetes.io/name'] === 'fluentd' ||
    labels['k8s-app'] === 'fluentd-logging'
  )
}

/**
 * Detect whether a daemonset belongs to Fluentd.
 */
export function isFluentdDaemonSet(ds: BackendDaemonSetInfo): boolean {
  const labels = ds.labels ?? {}

  return (
    labels['app'] === 'fluentd' ||
    labels['app.kubernetes.io/name'] === 'fluentd' ||
    labels['k8s-app'] === 'fluentd-logging'
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
 * Derive output plugin names from pod labels/annotations when available.
 */
export function inferOutputPluginTypes(pods: BackendPodInfo[]): string[] {
  const pluginTypes = new Set<string>()

  for (const pod of pods) {
    const labels = pod.labels ?? {}
    const annotations = pod.annotations ?? {}

    const explicitPlugin = labels['fluentd-output'] ?? labels['fluentd.io/output-plugin']
    if (explicitPlugin) {
      pluginTypes.add(explicitPlugin)
    }

    const pluginList = annotations['fluentd.io/output-plugins']
    if (pluginList) {
      for (const rawPlugin of pluginList.split(',')) {
        const plugin = rawPlugin.trim()
        if (plugin) {
          pluginTypes.add(plugin)
        }
      }
    }
  }

  return Array.from(pluginTypes)
}

/**
 * Estimate events/second based on recent Fluentd-related events.
 */
export function estimateEventsPerSecond(events: BackendEventInfo[]): number {
  const fluentdEvents = events.filter((event) => {
    const objectRef = (event.object ?? '').toLowerCase()
    const message = (event.message ?? '').toLowerCase()
    const reason = (event.reason ?? '').toLowerCase()
    return objectRef.includes('fluentd') || message.includes('fluentd') || reason.includes('fluentd')
  })

  if (fluentdEvents.length === 0) {
    return 0
  }

  const totalEventCount = fluentdEvents.reduce((sum, event) => sum + (event.count ?? 1), 0)

  const timestamps = fluentdEvents
    .flatMap((event) => [event.firstSeen, event.lastSeen])
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .map((timestamp) => Date.parse(timestamp))
    .filter((value) => Number.isFinite(value))

  if (timestamps.length < 2) {
    return Math.round((totalEventCount / DEFAULT_EVENT_WINDOW_SECONDS) * 10) / 10
  }

  const minTimestamp = Math.min(...timestamps)
  const maxTimestamp = Math.max(...timestamps)
  const windowSeconds = Math.max((maxTimestamp - minTimestamp) / 1000, 1)

  return Math.round((totalEventCount / windowSeconds) * 10) / 10
}

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await authFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

async function fetchDaemonSets(namespace?: string): Promise<BackendDaemonSetInfo[]> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  const resp = await authFetch(`/api/mcp/daemonsets${query}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { daemonsets?: BackendDaemonSetInfo[] } = await resp.json()
  return Array.isArray(body?.daemonsets) ? body.daemonsets : []
}

async function fetchEvents(namespace: string): Promise<BackendEventInfo[]> {
  try {
    const params = new URLSearchParams({
      namespace,
      limit: String(EVENT_SAMPLE_LIMIT),
    })

    const resp = await authFetch(`/api/mcp/events?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
      return []
    }

    const body: { events?: BackendEventInfo[] } = await resp.json()
    return Array.isArray(body?.events) ? body.events : []
  } catch {
    return []
  }
}

async function fetchFluentdStatus(): Promise<FluentdStatus> {
  const [labeledPods, daemonSets, events] = await Promise.all([
    fetchPods('/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dfluentd').catch(() => []),
    fetchDaemonSets(LOGGING_NAMESPACE).catch(() => []),
    fetchEvents(LOGGING_NAMESPACE),
  ])

  const fluentdPods = (labeledPods || []).filter(isFluentdPod)
  const fluentdDaemonSets = (daemonSets || []).filter(isFluentdDaemonSet)

  if ((fluentdPods || []).length === 0 && (fluentdDaemonSets || []).length === 0) {
    const fallbackPods = (await fetchPods('/api/mcp/pods?labelSelector=app%3Dfluentd')).filter(isFluentdPod)
    if (fallbackPods.length === 0) {
      return {
        ...INITIAL_DATA,
        health: 'not-installed',
        lastCheckTime: new Date().toISOString(),
      }
    }

    const readyPodsFromFallback = fallbackPods.filter(isPodReady).length
    const retriesFromFallback = fallbackPods.reduce((sum, pod) => sum + (pod.restarts ?? 0), 0)
    const pluginTypesFromFallback = inferOutputPluginTypes(fallbackPods)

    return {
      health: readyPodsFromFallback === fallbackPods.length ? 'healthy' : 'degraded',
      pods: { ready: readyPodsFromFallback, total: fallbackPods.length },
      bufferUtilization: 0,
      eventsPerSecond: estimateEventsPerSecond(events),
      retryCount: retriesFromFallback,
      outputPlugins: pluginTypesFromFallback.map((pluginType) => ({
        name: `${pluginType}-output`,
        type: pluginType,
        status: retriesFromFallback > 0 ? 'degraded' : 'healthy',
        emitCount: 0,
        errorCount: retriesFromFallback,
      })),
      lastCheckTime: new Date().toISOString(),
    }
  }

  const desiredFromDaemonSets = fluentdDaemonSets.reduce(
    (sum, ds) => sum + (ds.desiredScheduled ?? ds.currentScheduled ?? 0),
    0,
  )
  const readyFromDaemonSets = fluentdDaemonSets.reduce((sum, ds) => sum + (ds.ready ?? 0), 0)

  const podTotal = desiredFromDaemonSets > 0 ? desiredFromDaemonSets : fluentdPods.length
  const podReady = readyFromDaemonSets > 0 ? readyFromDaemonSets : fluentdPods.filter(isPodReady).length

  if (podTotal === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const retryCount = fluentdPods.reduce((sum, pod) => sum + (pod.restarts ?? 0), 0)
  const pluginTypes = inferOutputPluginTypes(fluentdPods)
  const allReady = podReady === podTotal

  return {
    health: allReady ? 'healthy' : 'degraded',
    pods: { ready: podReady, total: podTotal },
    bufferUtilization: 0,
    eventsPerSecond: estimateEventsPerSecond(events),
    retryCount,
    outputPlugins: pluginTypes.map((pluginType) => ({
      name: `${pluginType}-output`,
      type: pluginType,
      status: retryCount > 0 ? 'degraded' : 'healthy',
      emitCount: 0,
      errorCount: retryCount,
    })),
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseFluentdStatusResult {
  data: FluentdStatus
  loading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
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

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = (data.pods?.total ?? 0) > 0

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
    isDemoFallback,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
