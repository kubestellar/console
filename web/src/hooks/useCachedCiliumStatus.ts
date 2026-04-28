import { useCache, type RefreshCategory } from '../lib/cache'
import { fetchCiliumStatus } from './useCachedData/agentFetchers'
import { getDemoCiliumStatus } from './useCachedData/demoData'
import { useDemoMode } from './useDemoMode'
import type { CiliumStatus } from '../types/cilium'


const CACHE_KEY_CILIUM = 'cilium_status'

export interface CiliumCacheResult<T> {
    data: T
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    isFailed: boolean
    consecutiveFailures: number
    lastRefresh: number | null
    refetch: () => Promise<void>
}

export function useCachedCiliumStatus(): CiliumCacheResult<CiliumStatus> {
    const { isDemoMode } = useDemoMode()
    const result = useCache<CiliumStatus>({
        key: CACHE_KEY_CILIUM,
        category: 'default' as RefreshCategory,
        initialData: {
            status: 'Healthy',
            nodes: [],
            networkPolicies: 0,
            endpoints: 0,
            hubble: {
                enabled: false,
                flowsPerSecond: 0,
                metrics: { forwarded: 0, dropped: 0 }
            }
        } as CiliumStatus,
        demoData: getDemoCiliumStatus(),
        fetcher: async () => {
            const data = await fetchCiliumStatus()
            if (!data) throw new Error('Cilium status unavailable')
            return data as CiliumStatus
        },
    })

    // Rule 2: Never use demo data during loading.
    // The hook's isDemoFallback must be false while isLoading is true.
    const isDemoData = (isDemoMode || result.isDemoFallback) && !result.isLoading

    return {
        data: isDemoMode ? getDemoCiliumStatus() : result.data,
        isLoading: isDemoMode ? false : result.isLoading,
        isRefreshing: isDemoMode ? false : result.isRefreshing,
        isDemoData,
        isFailed: isDemoMode ? false : result.isFailed,
        consecutiveFailures: isDemoMode ? 0 : result.consecutiveFailures,
        lastRefresh: isDemoMode ? Date.now() : result.lastRefresh,
        refetch: result.refetch,
    }
}
