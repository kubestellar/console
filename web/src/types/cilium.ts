export interface CiliumNode {
    name: string
    status: 'Healthy' | 'Degraded' | 'Unhealthy'
    version: string
}

export interface CiliumStatus {
    status: 'Healthy' | 'Degraded' | 'Unhealthy'
    nodes: CiliumNode[]
    networkPolicies: number
    endpoints: number
    hubble: {
        enabled: boolean
        flowsPerSecond: number
        metrics: {
            forwarded: number
            dropped: number
        }
    }
}
