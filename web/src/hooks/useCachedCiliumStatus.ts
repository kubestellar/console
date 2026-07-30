/**
 * useCachedCiliumStatus — Hook for the Cilium network status card.
 *
 * Uses the createCachedHook factory for zero-boilerplate caching.
 * Returns CachedHookResult<CiliumStatus> — consumers alias
 * `isDemoFallback` as `isDemoData` in their destructure.
 */

import { createCachedHook } from '../lib/cache'
import { fetchCiliumStatus } from './useCachedData/agentFetchers'
import { getDemoCiliumStatus } from './useCachedData/demoData'
import type { CiliumStatus } from '../types/cilium'

const CACHE_KEY_CILIUM = 'cilium_status'

const INITIAL_DATA: CiliumStatus = {
    status: 'Healthy',
    nodes: [],
    networkPolicies: 0,
    endpoints: 0,
    hubble: {
        enabled: false,
        flowsPerSecond: 0,
        metrics: { forwarded: 0, dropped: 0 }
    }
}

export const useCachedCiliumStatus = createCachedHook<CiliumStatus>({
    key: CACHE_KEY_CILIUM,
    initialData: INITIAL_DATA,
    getDemoData: getDemoCiliumStatus,
    fetcher: async () => {
        const data = await fetchCiliumStatus()
        if (!data) throw new Error('Cilium status unavailable')
        return data as CiliumStatus
    },
})
