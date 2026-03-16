import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FLATCAR_DEMO_DATA, type FlatcarDemoData } from './demoData'
import { compareFlatcarVersions } from './versionUtils'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'

export interface FlatcarStatus {
  totalNodes: number
  versions: Record<string, number>
  outdatedNodes: number
  health: 'healthy' | 'degraded'
  lastCheckTime: string
}

const INITIAL_DATA: FlatcarStatus = {
  totalNodes: 0,
  versions: {},
  outdatedNodes: 0,
  health: 'healthy',
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'flatcar-status'

/**
 * Shape of each item returned by GET /api/mcp/flatcar/nodes.
 * The backend filters for Flatcar nodes, so every item here is a Flatcar node.
 */
interface FlatcarNodeInfo {
  nodeName: string
  cluster: string
  osImage: string
  kernelVersion: string
}

/**
 * Fetch Flatcar Container Linux node status via the dedicated backend endpoint.
 *
 * GET /api/mcp/flatcar/nodes returns { nodes: FlatcarNodeInfo[], source: string }.
 * The backend already filters to only Flatcar nodes (OSImage containing "flatcar"),
 * so no client-side filtering is needed.
 */
async function fetchFlatcarStatus(): Promise<FlatcarStatus> {
  const resp = await authFetch('/api/mcp/flatcar/nodes', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { nodes?: FlatcarNodeInfo[] } = await resp.json()
  const items = Array.isArray(body?.nodes) ? body.nodes : []

  // Aggregate version distribution from the pre-filtered Flatcar node list
  const versions: Record<string, number> = {}
  for (const node of items) {
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

  let outdatedNodes = 0

  for (const node of items) {
    const osImage = node.osImage ?? ''
    const versionMatch = osImage.match(/(\d+\.\d+\.\d+)/)
    const nodeVersion = versionMatch?.[1]

    // The backend does not expose a NodeUpdateInProgress condition in FlatcarNodeInfo,
    // so we conservatively flag nodes whose version differs from the fleet latest.
    if (nodeVersion && latestVersion && nodeVersion !== latestVersion) {
      outdatedNodes++
    }
  }

  const health: 'healthy' | 'degraded' =
    outdatedNodes === 0 ? 'healthy' : 'degraded'

  return {
    totalNodes: items.length,
    versions,
    outdatedNodes,
    health,
    lastCheckTime: new Date().toISOString(),
  }
}

function toDemoStatus(demo: FlatcarDemoData): FlatcarStatus {
  return {
    totalNodes: demo.totalNodes,
    versions: demo.versions,
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
