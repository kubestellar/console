import { useMemo } from 'react'
import { useClusters } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { getClusterHealthState, isClusterUnreachable } from '../../clusters/utils'
import type { StatBlockValue } from '../../ui/StatsOverview'

/**
 * Computes cluster-derived stats (healthy/unhealthy counts, node/pod totals)
 * and exposes a `getDashboardStatValue` callback for the StatsOverview block.
 *
 * Extracted from CustomDashboard.tsx to keep that file focused on rendering.
 */
export function useDashboardStats() {
  const { deduplicatedClusters, isLoading: isClustersLoading } = useClusters()
  const { drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()

  // Stats data from clusters — use the centralised state machine so these
  // counts always match the main cluster grid and sidebar (#5928).
  const { healthyClusters, unhealthyClusters, totalNodes, totalPods } = useMemo(() => {
    return deduplicatedClusters.reduce((stats, cluster) => {
      if (!isClusterUnreachable(cluster)) {
        const healthState = getClusterHealthState(cluster)
        if (healthState === 'healthy') {
          stats.healthyClusters += 1
        }
        if (healthState === 'unhealthy') {
          stats.unhealthyClusters += 1
        }
      }

      stats.totalNodes += cluster.nodeCount || 0
      stats.totalPods += cluster.podCount || 0
      return stats
    }, {
      healthyClusters: 0,
      unhealthyClusters: 0,
      totalNodes: 0,
      totalPods: 0,
    })
  }, [deduplicatedClusters])

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: deduplicatedClusters.length, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: deduplicatedClusters.length > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNodes, sublabel: 'nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }

  return { deduplicatedClusters, isClustersLoading, getDashboardStatValue }
}
