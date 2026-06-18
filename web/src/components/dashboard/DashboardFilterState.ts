/**
 * DashboardFilterState.ts — Filter state management for dashboard.
 * Extracted from DashboardState.ts per issue #19014.
 * Manages cluster filtering and filtered cluster list computation.
 */
import { useMemo } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import type { ClusterInfo } from '../../hooks/useMCP'

interface UseDashboardFilterStateProps {
  clusters: ClusterInfo[] | null
}

export function useDashboardFilterState({ clusters }: UseDashboardFilterStateProps) {
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])

  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  return {
    globalSelectedClusters,
    isAllClustersSelected,
    selectedClusterSet,
    filteredClusters,
  }
}
