import { useMemo, useCallback } from 'react'
import { ROUTES } from '../../config/routes'
import { type StatBlockValue } from '../ui/StatsOverview'
import { isClusterHealthy } from '../clusters/utils'
import type { ClusterInfo } from '../../hooks/mcp/types'

interface DashboardStatsDeps {
  clusters: ClusterInfo[] | undefined
  globalSelectedClusters: string[]
  isAllClustersSelected: boolean
  drillToAllClusters: (filter?: string) => void
  drillToAllPods: () => void
  drillToAllNodes: () => void
  navigate: (to: string) => void
}

export function useDashboardStats({
  clusters,
  globalSelectedClusters,
  isAllClustersSelected,
  drillToAllClusters,
  drillToAllPods,
  drillToAllNodes,
  navigate,
}: DashboardStatsDeps) {
  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])

  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  const {
    clusterCount,
    healthyClusters,
    unhealthyClusters,
    healthyNodes,
    totalPods,
    totalNamespaces,
    totalNodes,
  } = useMemo(() => {
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
  }, [filteredClusters])

  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: clusterCount, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: clusterCount > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNamespaces, sublabel: 'namespaces', onClick: () => navigate(ROUTES.NAMESPACES), isClickable: totalNamespaces > 0 }
      case 'nodes':
        return { value: totalNodes, progressValue: healthyNodes, max: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }, [clusterCount, drillToAllClusters, drillToAllNodes, drillToAllPods, healthyClusters, healthyNodes, navigate, totalNamespaces, totalNodes, totalPods, unhealthyClusters])

  return { filteredClusters, getStatValue }
}
