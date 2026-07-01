/**
 * useCachedDrasiTopology — Hook for the Drasi topology summary card.
 *
 * Follows the useCached* caching contract:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true.
 *
 * Data source: /drasi/topology endpoint from the local kc-agent.
 * Falls back to generated demo data when the live endpoint is unavailable.
 */

import { createCachedHook, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import {
  generateDrasiTopology,
  type DrasiTopologyData,
} from '../lib/demo/drasiTopology'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_DRASI_TOPOLOGY = 'drasi_topology'

const INITIAL_DATA: DrasiTopologyData = {
  nodes: [],
  edges: [],
  totalSources: 0,
  totalQueries: 0,
  totalReactions: 0,
  connectedPairs: 0,
  orphanedNodes: 0,
}

// ---------------------------------------------------------------------------
// Backend response shape
// ---------------------------------------------------------------------------

interface BackendDrasiTopologyResponse {
  topology?: DrasiTopologyData
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchDrasiTopology(): Promise<DrasiTopologyData> {
  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/drasi/topology`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) throw new Error(`drasi/topology HTTP ${resp.status}`)

  const body: BackendDrasiTopologyResponse = await resp.json()
  return body?.topology ?? INITIAL_DATA
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseCachedDrasiTopologyResult = CachedHookResult<DrasiTopologyData> & {
  isDemoData: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const useCachedDrasiTopologyBase = createCachedHook<DrasiTopologyData>({
  key: CACHE_KEY_DRASI_TOPOLOGY,
  initialData: INITIAL_DATA,
  getDemoData: generateDrasiTopology,
  fetcher: fetchDrasiTopology,
})

export function useCachedDrasiTopology(): UseCachedDrasiTopologyResult {
  const result = useCachedDrasiTopologyBase()

  return {
    ...result,
    isDemoData: result.isDemoFallback,
  }
}
