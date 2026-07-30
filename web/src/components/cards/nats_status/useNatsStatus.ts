import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import { NATS_DEMO_DATA, type NatsDemoData, type NatsServer, type NatsStream, type NatsServerState } from './demoData'

export type NatsStatus = NatsDemoData

// CACHE_KEY is a unique string so the cache knows which data belongs to this card
const CACHE_KEY = 'nats-status'

// BackendPodInfo is what /api/mcp/pods returns for each pod
interface BackendPodInfo {
  name?: string
  namespace?: string
  cluster?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

// INITIAL_DATA is shown for a split second before real data loads
// health: 'not-installed' means we haven't checked yet
const INITIAL_DATA: NatsStatus = {
  health: 'not-installed',
  servers: { total: 0, ok: 0, warning: 0, error: 0 },
  messaging: {
    totalConnections: 0,
    inMsgsPerSec: 0,
    outMsgsPerSec: 0,
    totalSubscriptions: 0,
  },
  jetstream: {
    enabled: false,
    streams: 0,
    totalMessages: 0,
    totalConsumers: 0,
  },
  serverList: [],
  streamList: [],
  lastCheckTime: new Date().toISOString(),
}



// fetchNatsStatus is the main function that pulls all NATS data
// It tries to discover NATS servers via the Kubernetes API first,
// then falls back to checking common default locations
// fetchCR fetches custom resources from the console backend
// Same pattern used by cloudevents_status and strimzi_status
async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`/api/mcp/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: { items?: CRItem[] } = await resp.json()
    return body.items ?? []
  } catch {
    return []
  }
}

// CRItem is what the console backend returns for each custom resource
interface CRItem {
  name: string
  namespace?: string
  cluster?: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
}

// isNatsPod returns true for pods that belong to a NATS deployment
// We check common label patterns used by the NATS operator and Helm charts
function isNatsPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app.kubernetes.io/name'] === 'nats' ||
    labels['app'] === 'nats' ||
    labels['nats_cluster'] !== undefined ||
    name.startsWith('nats-') ||
    name.includes('-nats-')
  )
}

// isPodReady checks if a pod is running and all containers are ready
function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

async function fetchNatsStatus(): Promise<NatsStatus> {
  try {
    // Step 1: Detect NATS pods — same pattern as strimzi_status and cloudevents_status
    const podsResp = await authFetch('/api/mcp/pods', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!podsResp.ok) {
      return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
    }

    const podsBody: { pods?: BackendPodInfo[] } = await podsResp.json()
    const allPods = Array.isArray(podsBody?.pods) ? podsBody.pods : []
    const natsPods = allPods.filter(isNatsPod)

    // No NATS pods found — operator not installed
    if (natsPods.length === 0) {
      return { ...INITIAL_DATA, health: 'not-installed', lastCheckTime: new Date().toISOString() }
    }

    const readyPods = natsPods.filter(isPodReady)
    const totalPods = natsPods.length
    const readyCount = readyPods.length

    // Step 2: Fetch NATS operator CRDs (best-effort — operator may not be installed)
    // NatsClusters is the CRD created by the NATS operator (nats.io/v1alpha2)
    const [natsClusters, natsStreams] = await Promise.all([
      fetchCR('nats.io', 'v1alpha2', 'natsclusters'),
      fetchCR('jetstream.nats.io', 'v1beta2', 'streams'),
    ])

    // Build server list from pods — each NATS pod is effectively a server node
    const serverList: NatsServer[] = natsPods.map((pod) => {
      const isReady = isPodReady(pod)
      // A pod that is not ready gets warning state; missing entirely gets error
      const state: NatsServerState = isReady ? 'ok' : 'warning'
      const clusterLabel =
        pod.labels?.['nats_cluster'] ??
        pod.labels?.['app.kubernetes.io/instance'] ??
        pod.cluster ??
        'default'

      return {
        name: pod.name ?? 'nats',
        cluster: clusterLabel,
        state,
        // Connection counts come from CRD status when available
        connections: 0,
        subscriptions: 0,
        version: pod.labels?.['app.kubernetes.io/version'] ?? 'unknown',
      }
    })

    // Enrich server entries with real connection data from NatsCluster CRD status
    for (const cr of natsClusters) {
      const status = (cr.status ?? {}) as Record<string, unknown>
      const conditions = Array.isArray(status.conditions) ? status.conditions : []
      const isReady = conditions.some(
        (c) => {
          const cond = c as Record<string, unknown>
          return cond.type === 'Ready' && cond.status === 'True'
        }
      )
      // Update any server in the same cluster to reflect CRD-reported health
      for (const server of serverList) {
        if (server.cluster === cr.cluster || server.name.includes(cr.name)) {
          if (!isReady) server.state = 'warning'
        }
      }
    }

    // Build stream list from JetStream CRDs
    const streamList: NatsStream[] = natsStreams.map((item: CRItem) => {
      const status = (item.status ?? {}) as Record<string, unknown>
      const conditions = Array.isArray(status.conditions) ? status.conditions : []
      const isReady = conditions.some(
        (c) => {
          const cond = c as Record<string, unknown>
          return cond.type === 'Ready' && cond.status === 'True'
        }
      )
      const spec = (item.spec ?? {}) as Record<string, unknown>
      const config = (spec.config ?? {}) as Record<string, unknown>

      return {
        name: item.name,
        cluster: item.cluster ?? 'default',
        messages: typeof config.maxMsgs === 'number' ? config.maxMsgs : 0,
        consumers: 0,
        state: isReady ? 'ok' : ('warning' as NatsServerState),
      }
    })

    const jetstreamEnabled = natsStreams.length > 0

    // Overall health is degraded when any pod is not ready
    const errorCount = serverList.filter((s) => s.state === 'error').length
    const warningCount = serverList.filter((s) => s.state === 'warning').length
    const health: NatsStatus['health'] =
      readyCount === 0 ? 'degraded' : errorCount > 0 || warningCount > 0 ? 'degraded' : 'healthy'

    return {
      health,
      servers: {
        total: totalPods,
        ok: readyCount,
        warning: warningCount,
        error: errorCount,
      },
      messaging: {
        // Pod-level connection counts require NATS monitoring sidecar;
        // we report zeros here and let demo data show realistic values
        totalConnections: 0,
        inMsgsPerSec: 0,
        outMsgsPerSec: 0,
        totalSubscriptions: 0,
      },
      jetstream: {
        enabled: jetstreamEnabled,
        streams: streamList.length,
        totalMessages: streamList.reduce((sum, s) => sum + s.messages, 0),
        totalConsumers: streamList.reduce((sum, s) => sum + s.consumers, 0),
      },
      serverList,
      streamList,
      lastCheckTime: new Date().toISOString(),
    }
  } catch {
    return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
  }
}

export interface UseNatsStatusResult {
  data: NatsStatus
  isRefreshing: boolean
  error: boolean
  showSkeleton: boolean
  showEmptyState: boolean
}

// useNatsStatus is the hook components call to get NATS data
// useCache handles caching, demo fallback, and refresh automatically
export function useNatsStatus(): UseNatsStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<NatsStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      // demoData is what shows when demo mode is ON or the API fails
      demoData: NATS_DEMO_DATA,
      persist: true,
      fetcher: fetchNatsStatus,
    })

  // Only treat as demo data AFTER loading is done
  // Without this check, the demo badge flashes during initial load
  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.health === 'not-installed'
    ? true
    : data.servers.total > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    isRefreshing,
    error: isFailed && !hasAnyData,
    showSkeleton,
    showEmptyState,
  }
}
