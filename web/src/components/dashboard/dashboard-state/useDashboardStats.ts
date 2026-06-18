import { useCallback, useMemo, useState } from 'react'
import { ROUTES } from '../../../config/routes'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../../lib/constants'
import { safeGetItem, safeSetItem } from '../../../lib/utils/localStorage'
import { setAutoRefreshPaused } from '../../../lib/cache'
import { isClusterHealthy } from '../../clusters/utils'
import type { StatBlockValue } from '../../ui/StatsOverview'

interface ClusterLike {
  name: string
  nodeCount?: number
  podCount?: number
  namespaces?: unknown[]
}

interface UseDashboardStatsParams {
  clusters: ClusterLike[]
  globalSelectedClusters: string[]
  isAllClustersSelected: boolean
  navigate: (path: string) => void
  drillToAllClusters: (status?: 'healthy' | 'unhealthy') => void
  drillToAllPods: () => void
  drillToAllNodes: () => void
}

export function useDashboardStats({
  clusters,
  globalSelectedClusters,
  isAllClustersSelected,
  navigate,
  drillToAllClusters,
  drillToAllPods,
  drillToAllNodes,
}: UseDashboardStatsParams) {
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])
  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  const stats = useMemo(() => {
    return filteredClusters.reduce((acc, cluster) => {
      acc.clusterCount += 1
      if (isClusterHealthy(cluster)) {
        acc.healthyClusters += 1
        acc.healthyNodes += cluster.nodeCount || 0
      } else {
        acc.unhealthyClusters += 1
      }
      acc.totalPods += cluster.podCount || 0
      acc.totalNamespaces += cluster.namespaces?.length || 0
      acc.totalNodes += cluster.nodeCount || 0
      return acc
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
        return { value: stats.clusterCount, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: stats.clusterCount > 0 }
      case 'healthy':
        return { value: stats.healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: stats.healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: stats.unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: stats.unhealthyClusters > 0 }
      case 'namespaces':
        return { value: stats.totalNamespaces, sublabel: 'namespaces', onClick: () => navigate(ROUTES.NAMESPACES), isClickable: stats.totalNamespaces > 0 }
      case 'nodes':
        return { value: stats.totalNodes, progressValue: stats.healthyNodes, max: stats.totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: stats.totalNodes > 0 }
      case 'pods':
        return { value: stats.totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: stats.totalPods > 0 }
      default:
        return { value: '-' }
    }
  }, [drillToAllClusters, drillToAllNodes, drillToAllPods, navigate, stats])

  const persistAutoRefresh = useCallback((enabled: boolean) => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(enabled))
    setAutoRefreshPaused(!enabled)
  }, [])

  return {
    autoRefresh,
    filteredClusters,
    getStatValue,
    persistAutoRefresh,
    setAutoRefresh,
  }
}
