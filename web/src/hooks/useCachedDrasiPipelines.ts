/**
 * useCachedDrasiPipelines — Hook for the Drasi pipeline status dashboard card.
 *
 * Follows the useCached* caching contract:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true (so CardWrapper shows
 *     a skeleton instead of flashing demo data).
 *
 * Data source: /drasi/pipelines endpoint from the local kc-agent.
 * Falls back to generated demo data when the live endpoint is unavailable.
 *
 * Upstream issue: kubestellar/console#19911
 */

import { createCachedHook, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import {
  generateDrasiPipelines,
  type DrasiPipelineData,
} from '../lib/demo/drasi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_DRASI_PIPELINES = 'drasi_pipelines'

/** Empty initial payload while the first fetch resolves. */
const INITIAL_DATA: DrasiPipelineData[] = []

// ---------------------------------------------------------------------------
// Backend response shape (narrow — only the fields we consume)
// ---------------------------------------------------------------------------

interface BackendDrasiPipelinesResponse {
  pipelines?: DrasiPipelineData[]
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchDrasiPipelines(): Promise<DrasiPipelineData[]> {
  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/drasi/pipelines`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) throw new Error(`drasi/pipelines HTTP ${resp.status}`)

  const body: BackendDrasiPipelinesResponse = await resp.json()
  return Array.isArray(body?.pipelines) ? body.pipelines : []
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseCachedDrasiPipelinesResult = CachedHookResult<DrasiPipelineData[]> & {
  isDemoData: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const useCachedDrasiPipelinesBase = createCachedHook<DrasiPipelineData[]>({
  key: CACHE_KEY_DRASI_PIPELINES,
  initialData: INITIAL_DATA,
  getDemoData: generateDrasiPipelines,
  fetcher: fetchDrasiPipelines,
})

export function useCachedDrasiPipelines(): UseCachedDrasiPipelinesResult {
  const result = useCachedDrasiPipelinesBase()

  return {
    ...result,
    isDemoData: result.isDemoFallback,
  }
}
