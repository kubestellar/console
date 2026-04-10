import { useMemo } from 'react'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { isClusterUnreachable, isClusterHealthy } from './utils'

export interface GPUByCluster {
  [clusterKey: string]: { total: number; allocated: number }
}

export interface ClusterStats {
  total: number
  loading: number
  healthy: number
  unhealthy: number
  unreachable: number
  staleContexts: number
  totalNodes: number
  totalCPUs: number
  totalMemoryGB: number
  totalStorageGB: number
  totalPods: number
  totalGPUs: number
  allocatedGPUs: number
  hasResourceData: boolean
}

export interface ClusterStatsParams {
  /** Clusters after global filter but before health filter */
  globalFilteredClusters: ClusterInfo[]
  /** GPU counts indexed by cluster name */
  gpuByCluster: GPUByCluster
}

/**
 * Custom hook that computes aggregate statistics from the filtered cluster list.
 * Calculates health counts, resource totals (nodes, CPUs, memory, storage, pods),
 * and GPU counts from the provided cluster data.
 */
export function useClusterStats({
  globalFilteredClusters,
  gpuByCluster,
}: ClusterStatsParams): ClusterStats {
  const stats = useMemo(() => {
    // Calculate total GPUs from GPU nodes that match filtered clusters
    // Only include GPUs from reachable clusters
    let totalGPUs = 0
    let allocatedGPUs = 0
    globalFilteredClusters.forEach(cluster => {
      // Skip offline clusters - don't count their GPUs
      if (isClusterUnreachable(cluster)) return

      const clusterKey = cluster.name.split('/')[0]
      const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
      if (gpuInfo) {
        totalGPUs += gpuInfo.total
        allocatedGPUs += gpuInfo.allocated
      }
    })

    // Separate unreachable, healthy, unhealthy - simplified logic matching sidebar
    const unreachable = globalFilteredClusters.filter(c => isClusterUnreachable(c)).length
    // `neverConnected` is populated by the backend — set in
    // `pkg/api/handlers/mcp_cluster.go` (and also stamped in
    // `pkg/k8s/client.go` when the health cache has never seen the
    // cluster) — when every health probe since startup has failed.
    // Surfaces the stale kubeconfig warning banner (#5921).
    const staleContexts = globalFilteredClusters.filter(c => c.neverConnected === true).length
    const healthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c)).length
    const unhealthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c)).length
    const loadingCount = globalFilteredClusters.filter(c =>
      c.nodeCount === undefined && c.reachable === undefined
    ).length

    const hasResourceData = globalFilteredClusters.some(c =>
      !isClusterUnreachable(c) && c.nodeCount !== undefined && c.nodeCount > 0
    )

    return {
      total: globalFilteredClusters.length,
      loading: loadingCount,
      healthy,
      unhealthy,
      unreachable,
      staleContexts,
      totalNodes: globalFilteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
      totalCPUs: globalFilteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
      totalMemoryGB: globalFilteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
      totalStorageGB: globalFilteredClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0),
      totalPods: globalFilteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
      totalGPUs,
      allocatedGPUs,
      hasResourceData,
    }
  }, [globalFilteredClusters, gpuByCluster])

  return stats
}
