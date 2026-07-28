/**
 * DashboardState selector factories.
 *
 * Extracted from DashboardState.ts — see issue #15790 / #21653.
 */
import { ROUTES } from '../../config/routes'
import type { StatBlockValue } from '../ui/StatsOverview'

export interface DashboardStatDeps {
  clusterCount: number
  healthyClusters: number
  unhealthyClusters: number
  healthyNodes: number
  totalPods: number
  totalNamespaces: number
  totalNodes: number
  navigate: (path: string) => void
  drillToAllClusters: (filter?: string) => void
  drillToAllNodes: () => void
  drillToAllPods: () => void
}

/**
 * Returns a getStatValue function bound to the current cluster stats.
 * Call inside useMemo with the relevant deps.
 */
export function makeDashboardStatSelector(deps: DashboardStatDeps) {
  const {
    clusterCount, healthyClusters, unhealthyClusters, healthyNodes,
    totalPods, totalNamespaces, totalNodes,
    navigate, drillToAllClusters, drillToAllNodes, drillToAllPods,
  } = deps

  return function getDashboardStatValue(blockId: string): StatBlockValue {
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
