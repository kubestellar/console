import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import { NATS_DEMO_DATA, type NatsDemoData, type NatsServer, type NatsStream } from './demoData'

export type NatsStatus = NatsDemoData

// CACHE_KEY is a unique string so the cache knows which data belongs to this card
const CACHE_KEY = 'nats-status'

// NATS monitoring endpoints — these are the standard NATS server monitoring URLs
// NATS exposes a built-in HTTP monitoring server on port 8222
const NATS_MONITORING_PORT = 8222
const NATS_VARZ_PATH = '/varz'     // server stats (connections, msgs in/out)
const NATS_JSINFO_PATH = '/jsz'    // JetStream info (streams, consumers)

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

// VarzResponse is the shape of data NATS returns from /varz endpoint
interface VarzResponse {
  server_name?: string
  version?: string
  connections?: number
  subscriptions?: number
  in_msgs_rate?: number
  out_msgs_rate?: number
  jetstream_enabled?: boolean
}

// JszResponse is the shape of data NATS returns from /jsz endpoint
interface JszResponse {
  streams?: number
  messages?: number
  consumers?: number
  account_details?: Array<{
    stream_detail?: Array<{
      name?: string
      state?: { messages?: number; consumers?: number }
    }>
  }>
}

// ClusterInfo holds what we know about each NATS server in the cluster
interface ClusterInfo {
  name: string
  cluster: string
  monitoringUrl: string
}

// fetchNatsServerInfo tries to reach a NATS server's monitoring endpoint
// Returns null if the server is unreachable — we handle that gracefully
async function fetchNatsServerInfo(server: ClusterInfo): Promise<{ varz: VarzResponse | null; jsz: JszResponse | null }> {
  try {
    const [varzRes, jszRes] = await Promise.all([
      authFetch(`${server.monitoringUrl}${NATS_VARZ_PATH}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      }),
      authFetch(`${server.monitoringUrl}${NATS_JSINFO_PATH}?streams=true`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      }),
    ])

    const varz: VarzResponse = varzRes.ok ? await varzRes.json() : {}
    const jsz: JszResponse = jszRes.ok ? await jszRes.json() : {}

    return { varz, jsz }
  } catch {
    // Network error or timeout — server is unreachable
    return { varz: null, jsz: null }
  }
}

// fetchNatsStatus is the main function that pulls all NATS data
// It tries to discover NATS servers via the Kubernetes API first,
// then falls back to checking common default locations
async function fetchNatsStatus(): Promise<NatsStatus> {
  try {
    // Ask the console backend for NATS services running in the cluster
    const response = await authFetch('/api/mcp/custom-resources?group=&version=v1&resource=services', {
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
    }

    const body = await response.json()
    const services: Array<{ name?: string; namespace?: string; cluster?: string; spec?: Record<string, unknown> }> =
      Array.isArray(body.items) ? body.items : []

    // Find services that look like NATS — they typically have "nats" in the name
    const natsServices = services.filter((svc) =>
      (svc.name ?? '').toLowerCase().includes('nats'),
    )

    if (natsServices.length === 0) {
      // No NATS found in the cluster
      return { ...INITIAL_DATA, health: 'not-installed', lastCheckTime: new Date().toISOString() }
    }

    // Build monitoring URLs for each discovered NATS service
    const clusterServers: ClusterInfo[] = natsServices.map((svc) => ({
      name: svc.name ?? 'nats',
      cluster: svc.cluster ?? 'default',
      monitoringUrl: `/api/proxy/${svc.cluster ?? 'default'}/${svc.namespace ?? 'default'}/${svc.name ?? 'nats'}/${NATS_MONITORING_PORT}`,
    }))

    // Fetch monitoring data from all servers in parallel
    const results = await Promise.all(
      clusterServers.map(async (server) => {
        const { varz, jsz } = await fetchNatsServerInfo(server)
        return { server, varz, jsz }
      }),
    )

    // Count how many servers responded successfully
    const respondingServers = results.filter((r) => r.varz !== null)

    if (respondingServers.length === 0) {
      return { ...INITIAL_DATA, health: 'not-installed', lastCheckTime: new Date().toISOString() }
    }

    // Build the server list from what we got back
    const serverList: NatsServer[] = results.map(({ server, varz }) => {
      if (!varz) {
        return {
          name: server.name,
          cluster: server.cluster,
          state: 'error' as const,
          connections: 0,
          subscriptions: 0,
          version: 'unknown',
        }
      }

      // A server is in 'warning' if it has unusually high connections (>500)
      const state: NatsServer['state'] = (varz.connections ?? 0) > 500 ? 'warning' : 'ok'

      return {
        name: varz.server_name ?? server.name,
        cluster: server.cluster,
        state,
        connections: varz.connections ?? 0,
        subscriptions: varz.subscriptions ?? 0,
        version: varz.version ?? 'unknown',
      }
    })

    // Aggregate messaging stats across all servers
    const totalConnections = respondingServers.reduce((sum, r) => sum + (r.varz?.connections ?? 0), 0)
    const inMsgsPerSec = respondingServers.reduce((sum, r) => sum + (r.varz?.in_msgs_rate ?? 0), 0)
    const outMsgsPerSec = respondingServers.reduce((sum, r) => sum + (r.varz?.out_msgs_rate ?? 0), 0)
    const totalSubscriptions = respondingServers.reduce((sum, r) => sum + (r.varz?.subscriptions ?? 0), 0)

    // Build stream list from JetStream data
    const streamList: NatsStream[] = []
    let totalMessages = 0
    let totalConsumers = 0

    for (const { server, jsz } of respondingServers) {
      if (!jsz?.account_details) continue
      for (const account of (jsz.account_details ?? [])) {
        for (const stream of (account.stream_detail ?? [])) {
          const msgs = stream.state?.messages ?? 0
          const consumers = stream.state?.consumers ?? 0
          totalMessages += msgs
          totalConsumers += consumers
          streamList.push({
            name: stream.name ?? 'unknown',
            cluster: server.cluster,
            messages: msgs,
            consumers,
            state: 'ok',
          })
        }
      }
    }

    const jetstreamEnabled = respondingServers.some((r) => r.varz?.jetstream_enabled)

    // Overall health: degraded if any server has errors or warnings
    const errorCount = serverList.filter((s) => s.state === 'error').length
    const warningCount = serverList.filter((s) => s.state === 'warning').length
    const health: NatsStatus['health'] = errorCount > 0
      ? 'degraded'
      : warningCount > 0
        ? 'degraded'
        : 'healthy'

    return {
      health,
      servers: {
        total: serverList.length,
        ok: serverList.filter((s) => s.state === 'ok').length,
        warning: warningCount,
        error: errorCount,
      },
      messaging: {
        totalConnections,
        inMsgsPerSec: Math.round(inMsgsPerSec),
        outMsgsPerSec: Math.round(outMsgsPerSec),
        totalSubscriptions,
      },
      jetstream: {
        enabled: jetstreamEnabled,
        streams: jetstreamEnabled ? (respondingServers[0]?.jsz?.streams ?? streamList.length) : 0,
        totalMessages,
        totalConsumers,
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
    isLoading,
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
