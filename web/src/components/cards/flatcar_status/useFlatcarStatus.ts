import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FLATCAR_DEMO_DATA, type FlatcarDemoData } from './demoData'
import { compareFlatcarVersions } from './versionUtils'

export interface FlatcarStatus {
  totalNodes: number
  versions: Record<string, number>
  updatingNodes: number
  outdatedNodes: number
  health: 'healthy' | 'degraded'
  lastCheckTime: string
}

const INITIAL_DATA: FlatcarStatus = {
  totalNodes: 0,
  versions: {},
  updatingNodes: 0,
  outdatedNodes: 0,
  health: 'healthy',
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'flatcar-status'

/**
 * NodeInfo shape returned by the console backend at GET /api/mcp/nodes.
 * Only the fields we need for Flatcar detection are typed here.
 */
interface BackendNodeInfo {
  osImage?: string
  conditions?: Array<{ type?: string; status?: string }>
}

/**
 * Fetch Flatcar Container Linux node status via the console backend proxy.
 *
 * Uses GET /api/mcp/nodes which proxies through the backend to all connected
 * clusters. The backend returns { nodes: NodeInfo[], source: string } where
 * NodeInfo includes osImage from node.Status.NodeInfo.OSImage.
 *
 * Flatcar nodes are identified by osImage containing "Flatcar".
 */
async function fetchFlatcarStatus(): Promise<FlatcarStatus> {
  const resp = await fetch('/api/mcp/nodes', {
    headers: { Accept: 'application/json' },
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { nodes?: BackendNodeInfo[] } = await resp.json()
  const items = Array.isArray(body?.nodes) ? body.nodes : []

  // Filter for Flatcar nodes only
  const flatcarNodes = items.filter((n) =>
    n.osImage?.toLowerCase().includes('flatcar'),
  )

  // Aggregate version distribution
  // Gracefully handles "unknown" if the version cannot be parsed
  const versions: Record<string, number> = {}
  for (const node of flatcarNodes) {
    const osImage = node.osImage ?? ''
    // Extract semver from osImage e.g. "Flatcar Container Linux by Kinvolk 3815.2.5 (…)"
    const versionMatch = osImage.match(/(\d+\.\d+\.\d+)/)
    const version = versionMatch?.[1] ?? 'unknown'
    versions[version] = (versions[version] ?? 0) + 1
  }

  // Sort versions descending, placing "unknown" last
  const sortedVersions = Object.keys(versions)
    .filter((v) => v !== 'unknown')
    .sort(compareFlatcarVersions)
  const latestVersion = sortedVersions[0]

  let updatingNodes = 0
  let outdatedNodes = 0

  for (const node of flatcarNodes) {
    const osImage = node.osImage ?? ''
    const versionMatch = osImage.match(/(\d+\.\d+\.\d+)/)
    const nodeVersion = versionMatch?.[1]

    const isUpdating = node.conditions?.some(
      (c) => c.type === 'NodeUpdateInProgress' && c.status === 'True',
    )

    if (isUpdating) {
      updatingNodes++
    } else if (nodeVersion && latestVersion && nodeVersion !== latestVersion) {
      outdatedNodes++
    }
    // nodes with version "unknown" are neither counted as updating nor outdated
  }

  const health: 'healthy' | 'degraded' =
    outdatedNodes === 0 && updatingNodes === 0 ? 'healthy' : 'degraded'

  return {
    totalNodes: flatcarNodes.length,
    versions,
    updatingNodes,
    outdatedNodes,
    health,
    lastCheckTime: new Date().toISOString(),
  }
}

function toDemoStatus(demo: FlatcarDemoData): FlatcarStatus {
  return {
    totalNodes: demo.totalNodes,
    versions: demo.versions,
    updatingNodes: demo.updatingNodes,
    outdatedNodes: demo.outdatedNodes,
    health: demo.health,
    lastCheckTime: demo.lastCheckTime,
  }
}

export interface UseFlatcarStatusResult {
  data: FlatcarStatus
  loading: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useFlatcarStatus(): UseFlatcarStatusResult {
  const { data, isLoading, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<FlatcarStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(FLATCAR_DEMO_DATA),
      persist: true,
      fetcher: fetchFlatcarStatus,
    })

  const hasAnyData = data.totalNodes > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  return {
    data,
    loading: isLoading,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
