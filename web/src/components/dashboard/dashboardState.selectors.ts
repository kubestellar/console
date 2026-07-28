/**
 * Dashboard state selector factories.
 *
 * Extracted from DashboardState.ts as part of the selector/action split
 * (tracked by #15790). All functions here are pure — no React hooks, no
 * side effects. They accept their inputs explicitly so they are trivially
 * unit-testable and reusable across hooks.
 */
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { StatBlockValue } from '../ui/StatsOverview'
import type { NavigateFunction } from 'react-router-dom'
import type { Card } from './dashboardUtils'
import { isClusterHealthy } from '../clusters/utils'
import { ROUTES } from '../../config/routes'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClusterStats {
  clusterCount: number
  healthyClusters: number
  unhealthyClusters: number
  healthyNodes: number
  totalPods: number
  totalNamespaces: number
  totalNodes: number
}

export interface StatValueDeps extends ClusterStats {
  drillToAllClusters: (filter?: string) => void
  drillToAllNodes: () => void
  drillToAllPods: () => void
  navigate: NavigateFunction
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/**
 * Filter the full cluster list down to only the globally-selected clusters.
 * When all clusters are selected the full list is returned unchanged.
 */
export function computeFilteredClusters(
  clusters: ClusterInfo[],
  globalSelectedClusters: string[],
  isAllClustersSelected: boolean,
): ClusterInfo[] {
  const all = clusters || []
  if (isAllClustersSelected) return all
  const selectedClusterSet = new Set(globalSelectedClusters)
  return all.filter(cluster => selectedClusterSet.has(cluster.name))
}

/**
 * Aggregate per-cluster counts from the filtered cluster list.
 */
export function computeClusterStats(filteredClusters: ClusterInfo[]): ClusterStats {
  return filteredClusters.reduce<ClusterStats>((stats, cluster) => {
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

/**
 * Resolve a single stat block value for the dashboard stats overview.
 * Delegates click handlers via the deps object so the function stays pure.
 */
export function resolveStatValue(blockId: string, deps: StatValueDeps): StatBlockValue {
  const {
    clusterCount, healthyClusters, unhealthyClusters,
    healthyNodes, totalPods, totalNamespaces, totalNodes,
    drillToAllClusters, drillToAllNodes, drillToAllPods, navigate,
  } = deps
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

/**
 * Derive the current card-type identifiers from the local cards list.
 * Dynamic cards include their dynamicCardId to disambiguate instances.
 */
export function computeCurrentCardTypes(localCards: Card[]): string[] {
  return localCards.map(card => {
    if (card.card_type === 'dynamic_card' && card.config?.dynamicCardId) {
      return `dynamic_card::${card.config.dynamicCardId as string}`
    }
    return card.card_type
  })
}
