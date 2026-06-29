/**
 * useCachedKagentStatus — Hook for kagent agent status monitoring card.
 *
 * Follows the useCached* caching contract:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true (so CardWrapper shows
 *     a skeleton instead of flashing demo data).
 *
 * Falls back to demo data when the live endpoint is unavailable.
 * Reference implementation: useCachedContainerd.ts
 */

import { createCachedHook, type CachedHookResult } from '../lib/cache'
import {
  KAGENT_DEMO_DATA,
  generateKagentStatus,
  type KagentStatusData,
} from '../lib/demo/kagent'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_KAGENT_STATUS = 'kagent_agent_status'

const INITIAL_DATA: KagentStatusData[] = []

// ---------------------------------------------------------------------------
// Fetcher (placeholder — replace with real endpoint when available)
// ---------------------------------------------------------------------------

async function fetchKagentStatus(): Promise<KagentStatusData[]> {
  throw new Error('kagent status endpoint not configured')
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseCachedKagentStatusResult = CachedHookResult<KagentStatusData[]> & {
  isDemoData: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const useCachedKagentStatusBase = createCachedHook<KagentStatusData[]>({
  key: CACHE_KEY_KAGENT_STATUS,
  initialData: INITIAL_DATA,
  demoData: KAGENT_DEMO_DATA,
  getDemoData: generateKagentStatus,
  fetcher: fetchKagentStatus,
})

export function useCachedKagentStatus(): UseCachedKagentStatusResult {
  const result = useCachedKagentStatusBase()

  return {
    ...result,
    isDemoData: result.isDemoFallback,
  }
}
