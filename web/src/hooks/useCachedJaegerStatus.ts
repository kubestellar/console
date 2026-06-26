/**
 * useCachedJaegerStatus — Hook for distributed tracing monitoring.
 *
 * Uses the createCachedHook factory for zero-boilerplate caching.
 * Returns CachedHookResult<JaegerStatus> — consumers alias
 * `isDemoFallback` as `isDemoData` in their destructure.
 */

import { createCachedHook } from '../lib/cache'
import { fetchJaegerStatus } from './useCachedData/agentFetchers'
import { getDemoJaegerStatus } from './useCachedData/demoData'
import type { JaegerStatus } from '../types/jaeger'

const CACHE_KEY_JAEGER = 'jaeger_status'

const INITIAL_DATA: JaegerStatus = {
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
}

export const useCachedJaegerStatus = createCachedHook<JaegerStatus>({
    key: CACHE_KEY_JAEGER,
    initialData: INITIAL_DATA,
    getDemoData: getDemoJaegerStatus,
    fetcher: async () => {
        const data = await fetchJaegerStatus()
        if (!data) throw new Error('Jaeger status unavailable')
        return data as JaegerStatus
    },
})
