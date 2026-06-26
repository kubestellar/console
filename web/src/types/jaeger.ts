export interface JaegerCollector {
    name: string
    status: 'Healthy' | 'Degraded' | 'Unhealthy'
    version: string
    cluster?: string
}

export interface JaegerStatus {
    status: 'Healthy' | 'Degraded' | 'Unhealthy'
    version: string
    collectors: {
        count: number
        status: 'Healthy' | 'Degraded' | 'Unhealthy'
        items?: JaegerCollector[]
    }
    query: {
        status: 'Healthy' | 'Degraded' | 'Unhealthy'
    }
    metrics: {
        servicesCount: number
        tracesLastHour: number
        dependenciesCount: number
        avgLatencyMs: number
        p95LatencyMs: number
        p99LatencyMs: number
        spansDroppedLastHour: number // Critical KPI
        avgQueueLength: number      // Performance indicator
    }
}
