import { useMemo } from 'react'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { isClusterUnreachable, isClusterHealthy } from './utils'
import { detectCloudProvider, getProviderLabel } from '../ui/CloudProviderIcon'

export interface ClusterFilteringParams {
  /** All clusters (typically deduplicatedClusters from useClusters) */
  clusters: ClusterInfo[]
  /** Health status filter tab */
  filter: 'all' | 'healthy' | 'unhealthy' | 'unreachable'
  /** Globally selected cluster names from useGlobalFilters */
  globalSelectedClusters: string[]
  /** Whether all clusters are selected in the global filter */
  isAllClustersSelected: boolean
  /** Custom text filter from the global filter search */
  customFilter: string
  /** Sort field */
  sortBy: 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'
  /** Sort ascending */
  sortAsc: boolean
  /** Custom drag-drop order (cluster names in order) */
  customOrder: string[]
}

export interface ClusterFilteringResult {
  /** Clusters after applying global filter, custom text filter, health filter, and sorting */
  filteredClusters: ClusterInfo[]
  /** Clusters after applying only global filter and custom text filter (before health filter) */
  globalFilteredClusters: ClusterInfo[]
}

/**
 * Custom hook that encapsulates the complex filtering and sorting logic
 * for the clusters page. Applies global cluster filter, custom text filter,
 * health status filter, and multi-field sorting.
 */
export function useClusterFiltering({
  clusters,
  filter,
  globalSelectedClusters,
  isAllClustersSelected,
  customFilter,
  sortBy,
  sortAsc,
  customOrder }: ClusterFilteringParams): ClusterFilteringResult {
  const filteredClusters = useMemo(() => {
    let result = clusters || []

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    // Apply local health filter
    if (filter === 'healthy') {
      result = result.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c))
    } else if (filter === 'unhealthy') {
      result = result.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c))
    } else if (filter === 'unreachable') {
      result = result.filter(c => isClusterUnreachable(c))
    }

    // Sort
    if (sortBy === 'custom' && customOrder.length > 0) {
      // Use custom order: items in customOrder come first in that order,
      // items not in customOrder are appended alphabetically
      const orderMap = new Map(customOrder.map((name, i) => [name, i]))
      result = [...result].sort((a, b) => {
        const aIdx = orderMap.get(a.name)
        const bIdx = orderMap.get(b.name)
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx
        if (aIdx !== undefined) return -1
        if (bIdx !== undefined) return 1
        return a.name.localeCompare(b.name)
      })
    } else {
      result = [...result].sort((a, b) => {
        let cmp = 0
        switch (sortBy) {
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'nodes':
            cmp = (a.nodeCount || 0) - (b.nodeCount || 0)
            break
          case 'pods':
            cmp = (a.podCount || 0) - (b.podCount || 0)
            break
          case 'health': {
            const aHealth = isClusterUnreachable(a) ? 0 : isClusterHealthy(a) ? 2 : 1
            const bHealth = isClusterUnreachable(b) ? 0 : isClusterHealthy(b) ? 2 : 1
            cmp = aHealth - bHealth
            break
          }
          case 'provider': {
            const aProvider = getProviderLabel((a.distribution as ReturnType<typeof detectCloudProvider>) || detectCloudProvider(a.name, a.server, a.namespaces, a.user))
            const bProvider = getProviderLabel((b.distribution as ReturnType<typeof detectCloudProvider>) || detectCloudProvider(b.name, b.server, b.namespaces, b.user))
            cmp = aProvider.localeCompare(bProvider)
            break
          }
        }
        return sortAsc ? cmp : -cmp
      })
    }

    return result
  }, [clusters, filter, globalSelectedClusters, isAllClustersSelected, customFilter, sortBy, sortAsc, customOrder])

  // Base clusters after global filter (before local health filter)
  const globalFilteredClusters = (() => {
    let result = clusters || []

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    return result
  })()

  return { filteredClusters, globalFilteredClusters }
}
