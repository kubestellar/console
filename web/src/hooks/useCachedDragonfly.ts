/**
 * useCachedDragonfly — Cached hook for Dragonfly P2P distribution status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 *   - useCache with fetcher + demoData
 *   - isDemoFallback is guarded so it's false during loading
 *   - Standard CachedHookResult return shape
 *
 * Fetches Pod resources via the MCP bridge and filters down to the four
 * canonical Dragonfly component workloads (manager, scheduler, seed-peer,
 * dfdaemon). Per-component ready/desired counts are derived from Pod phase
 * + containerStatuses so no synthetic live values are invented.
 *
 * Metrics exposed by the Dragonfly manager Prometheus endpoint (active
 * tasks, cache hit rate, bytes served) can be layered in later; for now
 * they default to zero on live data and are populated for demo mode only.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  DRAGONFLY_DEMO_DATA,
  type DragonflyComponent,
  type DragonflyComponentRow,
  type DragonflyStatusData,
} from '../lib/demo/dragonfly'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_DRAGONFLY = 'dragonfly-status'

// Label keys commonly used by the official Dragonfly Helm chart to tag
// each component workload.
const LABEL_COMPONENT = 'app.kubernetes.io/component'
const LABEL_NAME = 'app.kubernetes.io/name'
const LABEL_APP = 'app'

const COMPONENT_MANAGER: DragonflyComponent = 'manager'
const COMPONENT_SCHEDULER: DragonflyComponent = 'scheduler'
const COMPONENT_SEED_PEER: DragonflyComponent = 'seed-peer'
const COMPONENT_DFDAEMON: DragonflyComponent = 'dfdaemon'

const INITIAL_DATA: DragonflyStatusData = {
  health: 'not-installed',
  clusterName: '',
  lastCheckTime: new Date().toISOString(),
  summary: {
    managerReplicas: 0,
    schedulerReplicas: 0,
    seedPeers: 0,
    dfdaemonNodesUp: 0,
    dfdaemonNodesTotal: 0,
    activeTasks: 0,
    cacheHitPercent: 0,
    p2pBytesServed: 0,
    upstreamBytes: 0,
  },
  components: [],
}

// ---------------------------------------------------------------------------
// Internal types (shape of MCP custom-resource response)
// ---------------------------------------------------------------------------

interface PodItem {
  name: string
  namespace?: string
  cluster?: string
  status?: {
    phase?: string
    containerStatuses?: Array<{ name?: string; ready?: boolean; image?: string }>
  }
  metadata?: {
    labels?: Record<string, string>
  }
}

interface PodListResponse {
  items?: PodItem[]
}

// ---------------------------------------------------------------------------
// Helpers (pure, unit-testable)
// ---------------------------------------------------------------------------

/**
 * Returns which Dragonfly component a Pod belongs to, or `null` when the
 * Pod is not part of a Dragonfly deployment.
 *
 * Detection order:
 *   1. `app.kubernetes.io/component=dragonfly-<component>` (Helm chart default)
 *   2. `app.kubernetes.io/name=dragonfly-<component>`
 *   3. `app=dragonfly-<component>` (legacy label)
 *   4. Pod name prefix `dragonfly-<component>-`
 */
function classifyDragonflyPod(pod: PodItem): DragonflyComponent | null {
  const labels = pod.metadata?.labels ?? {}
  const componentLabel = (labels[LABEL_COMPONENT] ?? '').toLowerCase()
  const nameLabel = (labels[LABEL_NAME] ?? '').toLowerCase()
  const appLabel = (labels[LABEL_APP] ?? '').toLowerCase()
  const podName = (pod.name ?? '').toLowerCase()

  const matchers: Array<[DragonflyComponent, string[]]> = [
    [COMPONENT_MANAGER, ['dragonfly-manager', 'manager']],
    [COMPONENT_SCHEDULER, ['dragonfly-scheduler', 'scheduler']],
    [COMPONENT_SEED_PEER, ['dragonfly-seed-peer', 'seed-peer']],
    [COMPONENT_DFDAEMON, ['dragonfly-dfdaemon', 'dfdaemon']],
  ]

  for (const [component, candidates] of matchers) {
    for (const candidate of candidates) {
      if (componentLabel === candidate) return component
      if (nameLabel === candidate) return component
      if (appLabel === candidate) return component
    }
    if (podName.startsWith(`dragonfly-${component}-`)) return component
  }

  return null
}

function podIsReady(pod: PodItem): boolean {
  if (pod.status?.phase !== 'Running') return false
  const containers = pod.status?.containerStatuses ?? []
  if (containers.length === 0) return false
  return containers.every(c => c.ready === true)
}

function parseVersion(pod: PodItem): string {
  const containers = pod.status?.containerStatuses ?? []
  const image = containers[0]?.image ?? ''
  if (!image) return ''
  const withoutDigest = image.split('@')[0]
  const colonIdx = withoutDigest.lastIndexOf(':')
  if (colonIdx < 0) return ''
  return withoutDigest.substring(colonIdx + 1)
}

interface Aggregate {
  ready: number
  desired: number
  namespace: string
  cluster: string
  version: string
  name: string
}

function emptyAggregate(): Aggregate {
  return { ready: 0, desired: 0, namespace: '', cluster: '', version: '', name: '' }
}

function buildStatus(pods: PodItem[]): DragonflyStatusData {
  // Use literal keys (not computed property names) so TypeScript sees this as
  // a full `Record<DragonflyComponent, Aggregate>` rather than widening to
  // `{ [x: string]: Aggregate }` and failing TS2739.
  const aggregates: Record<DragonflyComponent, Aggregate> = {
    manager: emptyAggregate(),
    scheduler: emptyAggregate(),
    'seed-peer': emptyAggregate(),
    dfdaemon: emptyAggregate(),
  }

  let sawAnyDragonflyPod = false
  let clusterName = ''

  for (const pod of pods) {
    const component = classifyDragonflyPod(pod)
    if (!component) continue

    sawAnyDragonflyPod = true
    const agg = aggregates[component]
    agg.desired += 1
    if (podIsReady(pod)) agg.ready += 1
    if (!agg.namespace && pod.namespace) agg.namespace = pod.namespace
    if (!agg.cluster && pod.cluster) agg.cluster = pod.cluster
    if (!agg.version) agg.version = parseVersion(pod)
    if (!agg.name) agg.name = `dragonfly-${component}`
    if (!clusterName && pod.cluster) clusterName = pod.cluster
  }

  if (!sawAnyDragonflyPod) {
    return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
  }

  const components: DragonflyComponentRow[] = (Object.keys(aggregates) as DragonflyComponent[])
    .filter(c => aggregates[c].desired > 0)
    .map(component => {
      const agg = aggregates[component]
      return {
        component,
        name: agg.name,
        namespace: agg.namespace,
        cluster: agg.cluster,
        ready: agg.ready,
        desired: agg.desired,
        version: agg.version,
      }
    })

  const dfdaemonAgg = aggregates[COMPONENT_DFDAEMON]
  const managerAgg = aggregates[COMPONENT_MANAGER]
  const schedulerAgg = aggregates[COMPONENT_SCHEDULER]
  const seedPeerAgg = aggregates[COMPONENT_SEED_PEER]

  const totalDesired =
    managerAgg.desired + schedulerAgg.desired + seedPeerAgg.desired + dfdaemonAgg.desired
  const totalReady =
    managerAgg.ready + schedulerAgg.ready + seedPeerAgg.ready + dfdaemonAgg.ready
  const health: DragonflyStatusData['health'] =
    totalDesired === 0 ? 'not-installed' : totalReady < totalDesired ? 'degraded' : 'healthy'

  return {
    health,
    clusterName,
    lastCheckTime: new Date().toISOString(),
    summary: {
      managerReplicas: managerAgg.ready,
      schedulerReplicas: schedulerAgg.ready,
      seedPeers: seedPeerAgg.desired,
      dfdaemonNodesUp: dfdaemonAgg.ready,
      dfdaemonNodesTotal: dfdaemonAgg.desired,
      // Metrics-endpoint derived fields default to zero until wired up.
      activeTasks: 0,
      cacheHitPercent: 0,
      p2pBytesServed: 0,
      upstreamBytes: 0,
    },
    components,
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/** HTTP statuses that indicate "endpoint not available" — treat as empty, not
 *  as a hard failure (#9933). */
const NOT_INSTALLED_STATUSES = new Set<number>([401, 403, 404, 501, 503])

async function fetchDragonflyStatus(): Promise<DragonflyStatusData> {
  const params = new URLSearchParams({
    group: '',
    version: 'v1',
    resource: 'pods',
  })

  const resp = await authFetch(`/api/mcp/custom-resources?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (NOT_INSTALLED_STATUSES.has(resp.status)) return buildStatus([])
    throw new Error(`HTTP ${resp.status}`)
  }

  // Defensive JSON parse — Netlify SPA fallback may return text/html (#9933)
  let body: PodListResponse
  try {
    body = (await resp.json()) as PodListResponse
  } catch {
    return buildStatus([])
  }
  const items = Array.isArray(body?.items) ? body.items : []
  return buildStatus(items)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedDragonfly(): CachedHookResult<DragonflyStatusData> {
  const result = useCache<DragonflyStatusData>({
    key: CACHE_KEY_DRAGONFLY,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: DRAGONFLY_DEMO_DATA,
    persist: true,
    fetcher: fetchDragonflyStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  classifyDragonflyPod,
  podIsReady,
  parseVersion,
  buildStatus,
}
