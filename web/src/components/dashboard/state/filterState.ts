import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../config/routes'
import { isClusterHealthy } from '../../clusters/utils'
import type { StatBlockValue } from '../../ui/StatsOverview'

type DashboardCluster = Parameters<typeof isClusterHealthy>[0]

interface UseDashboardFilterStateProps {
  clusters: DashboardCluster[]
  globalSelectedClusters: string[]
  isAllClustersSelected: boolean
  drillToAllClusters: (status?: string) => void
  drillToAllPods: () => void
  drillToAllNodes: () => void
}

export function useDashboardFilterState({
  clusters,
  globalSelectedClusters,
  isAllClustersSelected,
  drillToAllClusters,
  drillToAllPods,
  drillToAllNodes,
}: UseDashboardFilterStateProps) {
  const navigate = useNavigate()

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])
  const filteredClusters = useMemo(() => {
    const allClusters = clusters || []
    if (isAllClustersSelected) {
      return allClusters
    }
    return allClusters.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  const stats = useMemo(() => {
    return filteredClusters.reduce((result, cluster) => {
      result.clusterCount += 1
      if (isClusterHealthy(cluster)) {
        result.healthyClusters += 1
        result.healthyNodes += cluster.nodeCount || 0
      } else {
        result.unhealthyClusters += 1
      }
      result.totalPods += cluster.podCount || 0
      result.totalNamespaces += cluster.namespaces?.length || 0
      result.totalNodes += cluster.nodeCount || 0
      return result
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
        return {
          value: stats.clusterCount,
          sublabel: 'total clusters',
          onClick: () => drillToAllClusters(),
          isClickable: stats.clusterCount > 0,
        }
      case 'healthy':
        return {
          value: stats.healthyClusters,
          sublabel: 'healthy',
          onClick: () => drillToAllClusters('healthy'),
          isClickable: stats.healthyClusters > 0,
        }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return {
          value: stats.unhealthyClusters,
          sublabel: 'unhealthy',
          onClick: () => drillToAllClusters('unhealthy'),
          isClickable: stats.unhealthyClusters > 0,
        }
      case 'namespaces':
        return {
          value: stats.totalNamespaces,
          sublabel: 'namespaces',
          onClick: () => navigate(ROUTES.NAMESPACES),
          isClickable: stats.totalNamespaces > 0,
        }
      case 'nodes':
        return {
          value: stats.totalNodes,
          progressValue: stats.healthyNodes,
          max: stats.totalNodes,
          sublabel: 'total nodes',
          onClick: () => drillToAllNodes(),
          isClickable: stats.totalNodes > 0,
        }
      case 'pods':
        return {
          value: stats.totalPods,
          sublabel: 'pods',
          onClick: () => drillToAllPods(),
          isClickable: stats.totalPods > 0,
        }
      default:
        return { value: '-' }
    }
  }, [drillToAllClusters, drillToAllNodes, drillToAllPods, navigate, stats])

  return {
    filteredClusters,
    getStatValue,
  }
}
