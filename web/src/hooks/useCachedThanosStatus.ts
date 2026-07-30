/**
 * Thanos Monitoring Cached Data Hooks
 *
 * Provides cached hooks for fetching Thanos status data.
 */

import { createCachedHook } from '@/lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

// ============================================================================
// Shared Types
// ============================================================================

export interface ThanosTarget {
    name: string
    health: 'up' | 'down'
    lastScrape: string
}

export interface ThanosStoreGateway {
    name: string
    health: 'healthy' | 'unhealthy'
    minTime: string
    maxTime: string
}

export interface ThanosStatus {
    targets: ThanosTarget[]
    storeGateways: ThanosStoreGateway[]
    queryHealth: 'healthy' | 'degraded'
    lastCheckTime: string
}

// ============================================================================
// Demo Data
// ============================================================================

export const getDemoThanosStatus = (): ThanosStatus => ({
    targets: [
        { name: 'prometheus-k8s-0', health: 'up', lastScrape: new Date(Date.now() - 15_000).toISOString() },
        { name: 'prometheus-k8s-1', health: 'up', lastScrape: new Date(Date.now() - 20_000).toISOString() },
        { name: 'prometheus-remote-1', health: 'up', lastScrape: new Date(Date.now() - 30_000).toISOString() },
        { name: 'prometheus-remote-2', health: 'down', lastScrape: new Date(Date.now() - 120_000).toISOString() },
    ],
    storeGateways: [
        { name: 'store-gw-0', health: 'healthy', minTime: '2025-01-01T00:00:00Z', maxTime: new Date().toISOString() },
        { name: 'store-gw-1', health: 'healthy', minTime: '2025-01-01T00:00:00Z', maxTime: new Date().toISOString() },
        { name: 'store-gw-2', health: 'unhealthy', minTime: '2025-06-01T00:00:00Z', maxTime: new Date(Date.now() - 3_600_000).toISOString() },
    ],
    queryHealth: 'degraded',
    lastCheckTime: new Date(Date.now() - 2 * 60_000).toISOString(),
})

// ============================================================================
// API Fetchers
// ============================================================================

interface PromQueryResult {
    status?: string
    data?: {
        resultType?: string
        result?: Array<{
            metric?: Record<string, string>
            value?: [number, string]
        }>
    }
}

/**
 * Fetch Thanos/Prometheus status via the query API.
 */
export async function fetchThanosStatus(): Promise<ThanosStatus> {
    const resp = await fetch('/api/v1/query?query=up', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
    }

    const body: PromQueryResult = await resp.json()

    if (body.status !== 'success' || !body.data?.result) {
        throw new Error('Unexpected Thanos API response')
    }

    const results = body.data.result

    // Build targets from the `up` metric results
    const targets: ThanosTarget[] = results.map((r) => {
        const job = r.metric?.job ?? 'unknown'
        const instance = r.metric?.instance ?? ''
        const name = instance ? `${job}/${instance}` : job
        const value = r.value?.[1]
        const health: 'up' | 'down' = value === '1' ? 'up' : 'down'
        return {
            name,
            health,
            lastScrape: new Date(((r.value?.[0]) ?? Date.now() / 1000) * 1000).toISOString(),
        }
    })

    // Identify store gateways by job label containing "store" or "gateway"
    const storeGateways: ThanosStoreGateway[] = results
        .filter((r) => {
            const job = (r.metric?.job ?? '').toLowerCase()
            return job.includes('store') || job.includes('gateway') || job.includes('thanos-store')
        })
        .map((r) => {
            const value = r.value?.[1]
            return {
                name: r.metric?.instance ?? r.metric?.job ?? 'unknown',
                health: (value === '1' ? 'healthy' : 'unhealthy') as 'healthy' | 'unhealthy',
                minTime: '',
                maxTime: new Date(((r.value?.[0]) ?? Date.now() / 1000) * 1000).toISOString(),
            }
        })

    const allUp = targets.every((t) => t.health === 'up')
    const allStoresHealthy = storeGateways.every((s) => s.health === 'healthy')
    const queryHealth: 'healthy' | 'degraded' =
        allUp && (storeGateways.length === 0 || allStoresHealthy) ? 'healthy' : 'degraded'

    return {
        targets,
        storeGateways,
        queryHealth,
        lastCheckTime: new Date().toISOString(),
    }
}

// ============================================================================
// Thanos Cached Hook
// ============================================================================

const CACHE_KEY_THANOS = 'thanos-status'

const INITIAL_THANOS_DATA: ThanosStatus = {
    targets: [],
    storeGateways: [],
    queryHealth: 'healthy',
    lastCheckTime: new Date().toISOString(),
}

export const useCachedThanosStatus = createCachedHook<ThanosStatus>({
    key: CACHE_KEY_THANOS,
    initialData: INITIAL_THANOS_DATA,
    getDemoData: getDemoThanosStatus,
    fetcher: fetchThanosStatus,
})
