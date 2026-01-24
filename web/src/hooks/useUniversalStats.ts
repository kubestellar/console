import { useCallback } from 'react'
import { useClusters } from './useMCP'
import { StatBlockValue } from '../components/ui/StatsOverview'
import { useDrillDownActions } from './useDrillDown'

/**
 * Universal stat value provider that works across all dashboards.
 * Provides values for any stat block that can be computed from common data sources.
 *
 * This enables users to add any stat block to any dashboard and get real values
 * (as long as the underlying data is available from useClusters).
 */
export function useUniversalStats() {
  const { clusters, isLoading } = useClusters()
  const { drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()

  // Computed values from cluster data
  const totalClusters = clusters.length
  const healthyClusters = clusters.filter(c => c.healthy).length
  const unhealthyClusters = clusters.filter(c => !c.healthy).length
  const unreachableClusters = clusters.filter(c => c.reachable === false).length
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
  const totalStorageGB = clusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
  const totalGPUs = 0 // GPU data requires separate API call

  // Create a lookup for stat values that can be derived from cluster data
  const getStatValue = useCallback((blockId: string): StatBlockValue | undefined => {
    // Cluster stats (available everywhere)
    switch (blockId) {
      // --- Cluster Dashboard Stats ---
      case 'clusters':
        return { value: totalClusters, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: totalClusters > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'unhealthy':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'unreachable':
        return { value: unreachableClusters, sublabel: 'offline', isClickable: false }
      case 'nodes':
        return { value: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'cpus':
        return { value: totalCPUs, sublabel: 'total CPUs', isClickable: false }
      case 'memory':
        return { value: `${Math.round(totalMemoryGB)}`, sublabel: 'GB memory', isClickable: false }
      case 'storage':
        return { value: `${Math.round(totalStorageGB)}`, sublabel: 'GB storage', isClickable: false }
      case 'gpus':
        return { value: totalGPUs, sublabel: 'total GPUs', isClickable: false }
      case 'pods':
        return { value: totalPods, sublabel: 'total pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }

      // --- Pods Dashboard Stats ---
      case 'total_pods':
        return { value: totalPods, sublabel: 'across all clusters', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }

      // --- Compute Dashboard Stats ---
      case 'cpu_util':
        return { value: '-', sublabel: 'CPU utilization', isClickable: false }
      case 'memory_util':
        return { value: '-', sublabel: 'Memory utilization', isClickable: false }
      case 'tpus':
        return { value: 0, sublabel: 'total TPUs', isClickable: false }

      // --- General purpose stats that can be inferred ---
      case 'total':
        return { value: totalClusters, sublabel: 'items', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'errors', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }

      default:
        // Return undefined for stats that require specific data sources
        return undefined
    }
  }, [
    totalClusters, healthyClusters, unhealthyClusters, unreachableClusters,
    totalNodes, totalPods, totalCPUs, totalMemoryGB, totalStorageGB, totalGPUs,
    drillToAllClusters, drillToAllNodes, drillToAllPods
  ])

  return {
    getStatValue,
    isLoading,
    clusters,
  }
}

/**
 * Creates a merged stat value getter that combines dashboard-specific values
 * with universal fallback values.
 *
 * Usage in dashboards:
 * ```ts
 * const { getStatValue: getUniversalStatValue } = useUniversalStats()
 * const getMergedStatValue = createMergedStatValueGetter(
 *   dashboardSpecificGetStatValue,
 *   getUniversalStatValue
 * )
 * ```
 */
export function createMergedStatValueGetter(
  dashboardGetter: (blockId: string) => StatBlockValue,
  universalGetter: (blockId: string) => StatBlockValue | undefined
): (blockId: string) => StatBlockValue {
  return (blockId: string) => {
    // First try the dashboard-specific getter
    const dashboardValue = dashboardGetter(blockId)

    // If dashboard provides a real value, use it
    if (dashboardValue?.value !== undefined && dashboardValue.value !== '-') {
      return dashboardValue
    }

    // Fall back to universal getter
    const universalValue = universalGetter(blockId)
    if (universalValue?.value !== undefined) {
      return universalValue
    }

    // Final fallback - not available
    return { value: '-', sublabel: 'Not available on this dashboard' }
  }
}
