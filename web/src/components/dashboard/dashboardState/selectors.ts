import type { StatBlockValue } from '../../ui/StatsOverview'
import type { ClusterInfo } from '../../../hooks/mcp/types'
import { ROUTES } from '../../../config/routes'
import { isClusterHealthy } from '../../clusters/utils'

interface ClusterStats {
  clusterCount: number
  healthyClusters: number
  unhealthyClusters: number
  healthyNodes: number
  totalPods: number
  totalNamespaces: number
  totalNodes: number
}

export function buildClusterStats(filteredClusters: ClusterInfo[]): ClusterStats {
  return filteredClusters.reduce((stats, cluster) => {
    stats.clusterCount += 1
    if (isClusterHealthy(cluster)) {
      stats.healthyClusters += 1
      stats.healthyNodes += cluster.nodeCount || 0
    } else {
      stats.unhealthyClusters += 1
    }
    stats.totalPods += cluster.podCount || 0
    stats.totalNamespaces += cluster.namespaces?.length || 0
    stats.totalNodes += cluster.nodeCount || 0
    return stats
  }, {
    clusterCount: 0,
    healthyClusters: 0,
    unhealthyClusters: 0,
    healthyNodes: 0,
    totalPods: 0,
    totalNamespaces: 0,
    totalNodes: 0,
  })
}

interface DashboardStatSelectorsParams extends ClusterStats {
  drillToAllClusters: (filter?: 'healthy' | 'unhealthy') => void
  drillToAllNodes: () => void
  drillToAllPods: () => void
  navigate: (path: string) => void
}

export function createDashboardStatValueGetter({
  clusterCount,
  healthyClusters,
  unhealthyClusters,
  healthyNodes,
  totalPods,
  totalNamespaces,
  totalNodes,
  drillToAllClusters,
  drillToAllNodes,
  drillToAllPods,
  navigate,
}: DashboardStatSelectorsParams) {
  return (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: clusterCount, groundtruthField: 'dashboard-clusters-total', sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: clusterCount > 0 }
      case 'healthy':
        return { value: healthyClusters, groundtruthField: 'dashboard-healthy-clusters', sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, groundtruthField: 'dashboard-error-clusters', sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNamespaces, groundtruthField: 'dashboard-namespaces-total', sublabel: 'namespaces', onClick: () => navigate(ROUTES.NAMESPACES), isClickable: totalNamespaces > 0 }
      case 'nodes':
        return { value: totalNodes, groundtruthField: 'dashboard-nodes-total', progressValue: healthyNodes, max: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, groundtruthField: 'dashboard-pods-total', sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }
}
