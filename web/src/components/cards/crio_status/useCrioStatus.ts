import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { CRIO_DEMO_DATA, type CrioStatusDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { agentFetch } from '../../../hooks/mcp/shared'
import {
  buildRecentImagePulls,
  extractCrioVersion,
  isCrioRuntime,
  summarizeCrioPods,
} from './helpers'

export interface CrioStatus {
  detected: boolean
  totalNodes: number
  versions: Record<string, number>
  health: 'healthy' | 'degraded' | 'not-installed'
  runtimeMetrics: {
    runningContainers: number
    pausedContainers: number
    stoppedContainers: number
  }
  imagePulls: {
    total: number
    successful: number
    failed: number
  }
  podSandboxes: {
    ready: number
    notReady: number
    total: number
  }
  recentImagePulls: Array<{
    image: string
    status: 'success' | 'failed'
    time: string
    size?: string
  }>
  lastCheckTime: string
}

const INITIAL_DATA: CrioStatus = {
  detected: false,
  totalNodes: 0,
  versions: {},
  health: 'not-installed',
  runtimeMetrics: {
    runningContainers: 0,
    pausedContainers: 0,
    stoppedContainers: 0,
  },
  imagePulls: {
    total: 0,
    successful: 0,
    failed: 0,
  },
  podSandboxes: {
    ready: 0,
    notReady: 0,
    total: 0,
  },
  recentImagePulls: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'crio-status'

/**
 * NodeInfo shape returned by the console backend at GET /api/mcp/nodes.
 * Only the fields we need for CRI-O detection are typed here.
 */
interface BackendNodeInfo {
  name?: string
  containerRuntime?: string
  conditions?: Array<{ type?: string; status?: string }>
}

interface BackendPodContainer {
  image?: string
  state?: 'running' | 'waiting' | 'terminated'
  reason?: string
}

interface BackendPodInfo {
  name?: string
  node?: string
  status?: string
  ready?: string
  containers?: BackendPodContainer[]
}

interface BackendEventInfo {
  reason?: string
  message?: string
  lastSeen?: string
  involvedObject?: {
    kind?: string
    name?: string
  }
}

/**
 * Fetch CRI-O container runtime status via the console backend proxy.
 *
 * Uses GET /api/mcp/nodes which proxies through the backend to all connected
 * clusters. The backend returns { nodes: NodeInfo[], source: string } where
 * NodeInfo includes containerRuntime from node.Status.NodeInfo.ContainerRuntimeVersion.
 *
 * CRI-O nodes are identified by containerRuntime containing "cri-o".
 */
async function fetchCrioStatus(): Promise<CrioStatus> {
  const [nodesResp, podsResp, eventsResp] = await Promise.all([
    agentFetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    agentFetch(`${LOCAL_AGENT_HTTP_URL}/pods`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    agentFetch(`${LOCAL_AGENT_HTTP_URL}/events?limit=200`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }).catch(() => undefined),
  ])

  if (!nodesResp.ok) {
    throw new Error(`HTTP ${nodesResp.status}`)
  }
  if (!podsResp.ok) {
    throw new Error(`HTTP ${podsResp.status}`)
  }

  const nodesBody: { nodes?: BackendNodeInfo[] } = await nodesResp.json()
  const podsBody: { pods?: BackendPodInfo[] } = await podsResp.json()
  const eventsBody: { events?: BackendEventInfo[] } | undefined = eventsResp && eventsResp.ok
    ? await eventsResp.json()
    : undefined

  const items = Array.isArray(nodesBody?.nodes) ? nodesBody.nodes : []
  const allPods = Array.isArray(podsBody?.pods) ? podsBody.pods : []
  const allEvents = Array.isArray(eventsBody?.events) ? eventsBody.events : []

  // Filter for CRI-O nodes only
  const crioNodes = items.filter((n) => isCrioRuntime(n.containerRuntime))
  // Build a set of CRI-O node names for pod matching.
  // Use both raw name and the short hostname (before the first dot) so pods
  // whose node field uses a different identifier format still match (#7356).
  const crioNodeNames = new Set<string>()
  for (const node of crioNodes) {
    if (node.name) {
      crioNodeNames.add(node.name)
      const shortName = node.name.split('.')[0]
      if (shortName) crioNodeNames.add(shortName)
    }
  }
  const crioPods = allPods.filter((pod) => {
    const nodeName = pod.node ?? ''
    if (!nodeName) return false
    return crioNodeNames.has(nodeName) || crioNodeNames.has(nodeName.split('.')[0])
  })

  if (crioNodes.length === 0) {
    return {
      ...INITIAL_DATA,
      detected: false,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  // Aggregate version distribution
  const versions: Record<string, number> = {}
  for (const node of crioNodes) {
    const version = extractCrioVersion(node.containerRuntime)
    versions[version] = (versions[version] ?? 0) + 1
  }

  // Determine health based on version consistency and node conditions
  const hasMultipleVersions = Object.keys(versions).length > 1
  const hasUnhealthyNodes = crioNodes.some((node) =>
    node.conditions?.some((c) => 
      (c.type === 'Ready' && c.status !== 'True') ||
      (c.type === 'DiskPressure' && c.status === 'True') ||
      (c.type === 'MemoryPressure' && c.status === 'True') ||
      (c.type === 'PIDPressure' && c.status === 'True')
    )
  )

  const health: 'healthy' | 'degraded' = 
    hasMultipleVersions || hasUnhealthyNodes ? 'degraded' : 'healthy'
  const podSummary = summarizeCrioPods(crioPods)
  const crioPodNames = new Set(
    crioPods
      .map((pod) => pod.name)
      .filter((name): name is string => Boolean(name)),
  )
  const crioEvents = allEvents.filter((event) => {
    if (event?.involvedObject?.kind === 'Pod' && event.involvedObject.name) {
      return crioPodNames.has(event.involvedObject.name)
    }

    const eventMessage = String(event?.message ?? '')
    for (const podName of crioPodNames) {
      if (eventMessage.includes(podName)) {
        return true
      }
    }

    return false
  })
  const recentImagePulls = buildRecentImagePulls(crioEvents)
  const imagePullSuccessful = Math.max(
    0,
    podSummary.totalContainers - podSummary.imagePullFailed,
  )
  const podSandboxesNotReady = Math.max(
    0,
    podSummary.podSandboxesTotal - podSummary.podSandboxesReady,
  )
  
  return {
    detected: true,
    totalNodes: crioNodes.length,
    versions,
    health,
    runtimeMetrics: {
      runningContainers: podSummary.runningContainers,
      pausedContainers: podSummary.pausedContainers,
      stoppedContainers: podSummary.stoppedContainers,
    },
    imagePulls: {
      total: podSummary.totalContainers,
      successful: imagePullSuccessful,
      failed: podSummary.imagePullFailed,
    },
    podSandboxes: {
      ready: podSummary.podSandboxesReady,
      notReady: podSandboxesNotReady,
      total: podSummary.podSandboxesTotal,
    },
    recentImagePulls,
    lastCheckTime: new Date().toISOString(),
  }
}

function toDemoStatus(demo: CrioStatusDemoData): CrioStatus {
  return {
    detected: demo.detected,
    totalNodes: demo.totalNodes,
    versions: demo.versions,
    health: demo.health,
    runtimeMetrics: demo.runtimeMetrics,
    imagePulls: demo.imagePulls,
    podSandboxes: demo.podSandboxes,
    recentImagePulls: demo.recentImagePulls,
    lastCheckTime: demo.lastCheckTime,
  }
}

export interface UseCrioStatusResult {
  data: CrioStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  /** True when displaying demo/fallback data (no real cluster connected) */
  isDemoData: boolean
}

export function useCrioStatus(): UseCrioStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<CrioStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(CRIO_DEMO_DATA),
      persist: true,
      fetcher: fetchCrioStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.detected

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
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
    isDemoData: effectiveIsDemoData,
  }
}
