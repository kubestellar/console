/**
 * useCachedDrasiHealth — Hook for the Drasi pipeline health summary card.
 *
 * Follows the useCached* caching contract:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true.
 *
 * Data source: /drasi/health endpoint from the local kc-agent.
 * Falls back to generated demo data when the live endpoint is unavailable.
 */

import { createCachedHook, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import {
  generateDrasiHealthSummary,
  type DrasiHealthSummary,
} from '../lib/demo/drasiHealth'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_DRASI_HEALTH = 'drasi_health'

const INITIAL_DATA: DrasiHealthSummary = {
  overallHealth: 'healthy',
  pipelines: [],
  totalSources: 0,
  healthySources: 0,
  totalQueries: 0,
  healthyQueries: 0,
  totalReactions: 0,
  healthyReactions: 0,
}

// ---------------------------------------------------------------------------
// Backend response shape
// ---------------------------------------------------------------------------

interface BackendDrasiHealthResponse {
  health?: DrasiHealthSummary
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchDrasiHealth(): Promise<DrasiHealthSummary> {
  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/drasi/health`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) throw new Error(`drasi/health HTTP ${resp.status}`)

  const body: BackendDrasiHealthResponse = await resp.json()
  return body?.health ?? INITIAL_DATA
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseCachedDrasiHealthResult = CachedHookResult<DrasiHealthSummary> & {
  isDemoData: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const useCachedDrasiHealthBase = createCachedHook<DrasiHealthSummary>({
  key: CACHE_KEY_DRASI_HEALTH,
  initialData: INITIAL_DATA,
  getDemoData: generateDrasiHealthSummary,
  fetcher: fetchDrasiHealth,
})

export function useCachedDrasiHealth(): UseCachedDrasiHealthResult {
  const result = useCachedDrasiHealthBase()

  return {
    ...result,
    isDemoData: result.isDemoFallback,
  }
}
