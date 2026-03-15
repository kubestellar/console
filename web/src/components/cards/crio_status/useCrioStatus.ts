import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { CRIO_DEMO_DATA, type CrioStatusDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
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
  node?: string
  status?: string
  ready?: string
  containers?: BackendPodContainer[]
}

interface BackendEventInfo {
  reason?: string
  message?: string
  lastSeen?: string
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
  const resp = await authFetch('/api/mcp/nodes', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  const [nodesResp, podsResp, eventsResp] = await Promise.all([
    fetch('/api/mcp/nodes', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    fetch('/api/mcp/pods', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    fetch('/api/mcp/events?limit=200', {
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
  const crioNodeNames = new Set(crioNodes.map((node) => node.name).filter(Boolean))
  const crioPods = allPods.filter((pod) => {
    const nodeName = pod.node ?? ''
    return crioNodeNames.has(nodeName)
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
  const recentImagePulls = buildRecentImagePulls(allEvents)
  const imagePullSuccessful = Math.max(
    0,
    podSummary.imagePullTotal - podSummary.imagePullFailed,
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
      total: podSummary.imagePullTotal,
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
  const hasAnyData = !data.detected ? true : data.totalNodes > 0

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
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
