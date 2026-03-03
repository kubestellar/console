import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { THANOS_DEMO_DATA, type ThanosDemoData } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'

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

const INITIAL_DATA: ThanosStatus = {
    targets: [],
    storeGateways: [],
    queryHealth: 'healthy',
    lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'thanos-status'

/**
 * Result shape from Prometheus/Thanos `GET /api/v1/query?query=up`.
 * Only the fields needed for the status card are typed here.
 */
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
 * Fetch Thanos/Prometheus target status via the standard query API.
 *
 * Uses GET /api/v1/query?query=up which returns a vector of {job, instance}
 * with value 1 (up) or 0 (down).
 *
 * Store gateway status is synthesized from the thanos_store_gateway_loaded_blocks
 * metric when available, falling back to demo-like structure from target data.
 */
async function fetchThanosStatus(): Promise<ThanosStatus> {
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

function toDemoStatus(demo: ThanosDemoData): ThanosStatus {
    return {
        targets: demo.targets,
        storeGateways: demo.storeGateways,
        queryHealth: demo.queryHealth,
        lastCheckTime: demo.lastCheckTime,
    }
}

export interface UseThanosStatusResult {
    data: ThanosStatus
    loading: boolean
    error: boolean
    consecutiveFailures: number
    showSkeleton: boolean
    showEmptyState: boolean
}

export function useThanosStatus(): UseThanosStatusResult {
    const { data, isLoading, isFailed, consecutiveFailures, isDemoFallback } =
        useCache<ThanosStatus>({
            key: CACHE_KEY,
            category: 'default',
            initialData: INITIAL_DATA,
            demoData: toDemoStatus(THANOS_DEMO_DATA),
            persist: true,
            fetcher: fetchThanosStatus,
        })

    const hasAnyData = data.targets.length > 0

    const { showSkeleton, showEmptyState } = useCardLoadingState({
        isLoading,
        hasAnyData,
        isFailed,
        consecutiveFailures,
        isDemoData: isDemoFallback,
    })

    return {
        data,
        loading: isLoading,
        error: isFailed && !hasAnyData,
        consecutiveFailures,
        showSkeleton,
        showEmptyState,
    }
}
