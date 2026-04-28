import { useCache, type RefreshCategory } from '../lib/cache'
import { fetchJaegerStatus } from './useCachedData/agentFetchers'
import { getDemoJaegerStatus } from './useCachedData/demoData'
import { useDemoMode } from './useDemoMode'
import type { JaegerStatus } from '../types/jaeger'

const CACHE_KEY_JAEGER = 'jaeger_status'

/**
 * useCachedJaegerStatus — Hook for distributed tracing monitoring.
 * Follows the mandatory caching contract defined in CLAUDE.md.
 */
export function useCachedJaegerStatus() {
    const { isDemoMode } = useDemoMode()

    const result = useCache<JaegerStatus>({
        key: CACHE_KEY_JAEGER,
        category: 'default' as RefreshCategory,
        initialData: {
            status: 'Healthy',
            version: '',
            collectors: { count: 0, status: 'Healthy' },
            query: { status: 'Healthy' },
            metrics: {
                servicesCount: 0,
                tracesLastHour: 0,
                dependenciesCount: 0,
                avgLatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
                spansDroppedLastHour: 0,
                avgQueueLength: 0,
            },
        },
        demoData: getDemoJaegerStatus(),
        fetcher: async () => {
            const data = await fetchJaegerStatus()
            if (!data) throw new Error('Jaeger status unavailable')
            return data as JaegerStatus
        },
    })

    // Rule: Never use demo data during loading.
    // The hook's isDemoData must be false while isLoading is true.
    const isDemoData = (isDemoMode || result.isDemoFallback) && !result.isLoading

    // Wire isRefreshing correctly for refresh icon animation
    const isRefreshing = isDemoMode ? false : result.isRefreshing

    return {
        data: isDemoMode ? getDemoJaegerStatus() : result.data,
        isLoading: isDemoMode ? false : result.isLoading,
        isRefreshing,
        isDemoData,
        isFailed: isDemoMode ? false : result.isFailed,
        consecutiveFailures: isDemoMode ? 0 : result.consecutiveFailures,
        lastRefresh: isDemoMode ? Date.now() : result.lastRefresh,
        refetch: result.refetch,
    }
}
