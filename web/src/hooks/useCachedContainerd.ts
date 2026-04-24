/**
 * useCachedContainerd — Hook for the containerd runtime monitoring card.
 *
 * Follows the useCached* caching contract from CLAUDE.md:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true (so CardWrapper shows
 *     a skeleton instead of flashing demo data).
 *
 * Data source: derives a containerd view from node.containerRuntime +
 * pod.containers surfaced by the kc-agent /nodes and /pods endpoints
 * (same source of truth used by useCrioStatus). Containerd nodes are
 * matched by `containerRuntime` containing "containerd".
 *
 * Marketplace preset: cncf-containerd
 * Upstream issue: kubestellar/console-marketplace#4
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { useDemoMode } from './useDemoMode'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'
import {
  CONTAINERD_DEMO_DATA,
  type ContainerdContainer,
  type ContainerdContainerState,
  type ContainerdStatusData,
} from '../lib/demo/containerd'

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const CACHE_KEY_CONTAINERD = 'containerd_status'

/** How many characters of the raw container ID to surface (matches ctr/crictl). */
const CONTAINER_ID_DISPLAY_LEN = 12

/** Fallback name used when a container's namespace is not reported. */
const NAMESPACE_FALLBACK = 'default'

/** Fallback node name for pods whose `node` field is missing. */
const NODE_FALLBACK = 'unknown'

/** Max number of containers to surface in the card (keeps payload small). */
const MAX_CONTAINERS_DISPLAYED = 25

/** Zero-state uptime for containers that aren't currently running. */
const UPTIME_STOPPED = '0s'

/** Default uptime when the backend does not expose a start timestamp. */
const UPTIME_UNKNOWN = 'unknown'

/** Initial empty payload while the first fetch resolves. */
const INITIAL_DATA: ContainerdStatusData = {
  health: 'not-installed',
  containers: [],
  summary: { totalContainers: 0, running: 0, paused: 0, stopped: 0 },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Backend response shapes (narrow — only the fields we consume)
// ---------------------------------------------------------------------------

interface BackendNodeInfo {
  name?: string
  containerRuntime?: string
}

interface BackendPodContainer {
  name?: string
  image?: string
  state?: 'running' | 'waiting' | 'terminated'
  containerID?: string
  startedAt?: string
}

interface BackendPodInfo {
  name?: string
  namespace?: string
  node?: string
  containers?: BackendPodContainer[]
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function isContainerdRuntime(runtime: string | undefined): boolean {
  return (runtime || '').toLowerCase().includes('containerd')
}

function normalizeContainerId(raw: string | undefined): string {
  if (!raw) return ''
  // kubelet reports e.g. "containerd://3f9a1c4b2e7d..." — strip scheme + truncate.
  const afterScheme = raw.includes('://') ? raw.split('://').pop() || '' : raw
  return afterScheme.slice(0, CONTAINER_ID_DISPLAY_LEN)
}

function mapContainerState(state: BackendPodContainer['state']): ContainerdContainerState {
  if (state === 'running') return 'running'
  if (state === 'waiting') return 'paused'
  return 'stopped'
}

function formatUptime(startedAt: string | undefined, state: ContainerdContainerState): string {
  if (state !== 'running') return UPTIME_STOPPED
  if (!startedAt) return UPTIME_UNKNOWN

  const started = new Date(startedAt).getTime()
  if (Number.isNaN(started)) return UPTIME_UNKNOWN

  const MS_PER_SECOND = 1000
  const SECONDS_PER_MINUTE = 60
  const MINUTES_PER_HOUR = 60
  const HOURS_PER_DAY = 24

  const diffSeconds = Math.max(0, Math.floor((Date.now() - started) / MS_PER_SECOND))
  if (diffSeconds < SECONDS_PER_MINUTE) return `${diffSeconds}s`

  const diffMinutes = Math.floor(diffSeconds / SECONDS_PER_MINUTE)
  if (diffMinutes < MINUTES_PER_HOUR) return `${diffMinutes}m`

  const diffHours = Math.floor(diffMinutes / MINUTES_PER_HOUR)
  const remainderMinutes = diffMinutes % MINUTES_PER_HOUR
  if (diffHours < HOURS_PER_DAY) return `${diffHours}h ${remainderMinutes}m`

  const diffDays = Math.floor(diffHours / HOURS_PER_DAY)
  const remainderHours = diffHours % HOURS_PER_DAY
  return `${diffDays}d ${remainderHours}h`
}

function buildContainerdData(
  nodes: BackendNodeInfo[],
  pods: BackendPodInfo[],
): ContainerdStatusData {
  const containerdNodes = nodes.filter(n => isContainerdRuntime(n.containerRuntime))

  if (containerdNodes.length === 0) {
    return {
      ...INITIAL_DATA,
      lastCheckTime: new Date().toISOString(),
    }
  }

  const containerdNodeNames = new Set<string>()
  for (const node of containerdNodes) {
    if (!node.name) continue
    containerdNodeNames.add(node.name)
    const shortName = node.name.split('.')[0]
    if (shortName) containerdNodeNames.add(shortName)
  }

  const containers: ContainerdContainer[] = []
  for (const pod of pods) {
    const nodeName = pod.node ?? ''
    if (!nodeName) continue
    const matches = containerdNodeNames.has(nodeName) ||
      containerdNodeNames.has(nodeName.split('.')[0])
    if (!matches) continue

    for (const c of pod.containers || []) {
      const state = mapContainerState(c.state)
      containers.push({
        id: normalizeContainerId(c.containerID) || (c.name || ''),
        image: c.image || '',
        namespace: pod.namespace || NAMESPACE_FALLBACK,
        state,
        uptime: formatUptime(c.startedAt, state),
        node: pod.node || NODE_FALLBACK,
      })
      if (containers.length >= MAX_CONTAINERS_DISPLAYED) break
    }
    if (containers.length >= MAX_CONTAINERS_DISPLAYED) break
  }

  const running = containers.filter(c => c.state === 'running').length
  const paused = containers.filter(c => c.state === 'paused').length
  const stopped = containers.filter(c => c.state === 'stopped').length

  return {
    health: stopped > 0 ? 'degraded' : 'healthy',
    containers,
    summary: {
      totalContainers: containers.length,
      running,
      paused,
      stopped,
    },
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchContainerdStatus(): Promise<ContainerdStatusData> {
  const [nodesResp, podsResp] = await Promise.all([
    fetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    fetch(`${LOCAL_AGENT_HTTP_URL}/pods`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
  ])

  if (!nodesResp.ok) throw new Error(`nodes HTTP ${nodesResp.status}`)
  if (!podsResp.ok) throw new Error(`pods HTTP ${podsResp.status}`)

  const nodesBody: { nodes?: BackendNodeInfo[] } = await nodesResp.json()
  const podsBody: { pods?: BackendPodInfo[] } = await podsResp.json()

  const nodes = Array.isArray(nodesBody?.nodes) ? nodesBody.nodes : []
  const pods = Array.isArray(podsBody?.pods) ? podsBody.pods : []

  return buildContainerdData(nodes, pods)
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseCachedContainerdResult {
  data: ContainerdStatusData
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedContainerd(): UseCachedContainerdResult {
  const { isDemoMode } = useDemoMode()

  const result = useCache<ContainerdStatusData>({
    key: CACHE_KEY_CONTAINERD,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: CONTAINERD_DEMO_DATA,
    persist: true,
    fetcher: fetchContainerdStatus,
  })

  // Never surface demo data during loading (CLAUDE.md rule).
  const isDemoData = (isDemoMode || result.isDemoFallback) && !result.isLoading
  const isRefreshing = isDemoMode ? false : result.isRefreshing

  return {
    data: isDemoMode ? CONTAINERD_DEMO_DATA : result.data,
    isLoading: isDemoMode ? false : result.isLoading,
    isRefreshing,
    isDemoData,
    isFailed: isDemoMode ? false : result.isFailed,
    consecutiveFailures: isDemoMode ? 0 : result.consecutiveFailures,
    lastRefresh: isDemoMode ? Date.now() : result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  isContainerdRuntime,
  normalizeContainerId,
  mapContainerState,
  formatUptime,
  buildContainerdData,
}
