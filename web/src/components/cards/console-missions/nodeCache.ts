import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { agentFetch } from '../../../hooks/mcp/shared'
import type { NodeData } from './offlineDataTransforms'

// ============================================================================
// Module-level cache for all nodes (shared across card instances)
// ============================================================================

export const NODES_CACHE_TTL = 30_000
export const OFFLINE_DETECTION_FAILURE_THRESHOLD = 3
/** Cluster-level GPU allocation threshold — flag when >80% of a cluster's GPUs are allocated */
export const GPU_CLUSTER_EXHAUSTION_THRESHOLD = 0.8

let nodesCache: NodeData[] = []
let nodesCacheTimestamp = 0
let nodesFetchInProgress = false
let nodesFetchError: string | null = null
let nodesFetchConsecutiveFailures = 0

const nodesSubscribers = new Set<(nodes: NodeData[]) => void>()

export interface NodesFetchResult {
  nodes: NodeData[]
  error: string | null
  consecutiveFailures: number
}

export function getNodesCache(): NodeData[] {
  return nodesCache
}

export function subscribeToNodes(cb: (nodes: NodeData[]) => void): () => void {
  nodesSubscribers.add(cb)
  return () => nodesSubscribers.delete(cb)
}

function notifyNodesSubscribers() {
  nodesSubscribers.forEach(cb => cb(nodesCache))
}

export async function fetchAllNodes(): Promise<NodesFetchResult> {
  if (Date.now() - nodesCacheTimestamp < NODES_CACHE_TTL && nodesCache.length > 0) {
    return { nodes: nodesCache, error: null, consecutiveFailures: 0 }
  }

  if (nodesFetchInProgress) {
    return {
      nodes: nodesCache,
      error: nodesFetchError,
      consecutiveFailures: nodesFetchConsecutiveFailures,
    }
  }

  nodesFetchInProgress = true
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() as { nodes?: NodeData[] }
    nodesCache = data.nodes || []
    nodesCacheTimestamp = Date.now()
    nodesFetchError = null
    nodesFetchConsecutiveFailures = 0
    notifyNodesSubscribers()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    nodesFetchConsecutiveFailures += 1
    nodesFetchError = message

    // Fix for #13038: In local k3d/k3s environments, the /nodes endpoint may not be
    // configured, causing persistent JSON parse errors. Suppress excessive logging
    // after the first few failures to reduce console noise.
    const isJsonParseError = message.includes('Unexpected token') || message.includes('JSON')
    const shouldLogError = nodesFetchConsecutiveFailures <= OFFLINE_DETECTION_FAILURE_THRESHOLD || !isJsonParseError

    if (nodesCache.length > 0) {
      if (shouldLogError) {
        console.warn('[OfflineDetection] Node fetch degraded:', message)
      }
    } else {
      if (shouldLogError) {
        console.error('[OfflineDetection] Error fetching nodes:', error)
      }
    }
  } finally {
    nodesFetchInProgress = false
  }

  return {
    nodes: nodesCache,
    error: nodesFetchError,
    consecutiveFailures: nodesFetchConsecutiveFailures,
  }
}
