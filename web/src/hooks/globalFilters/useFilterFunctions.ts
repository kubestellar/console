import { useCallback } from 'react'
import { DEFAULT_SEARCH_FIELDS, NONE_SENTINEL } from './constants'
import type { SeverityLevel, StatusLevel } from './types'
import { matchesCustomText } from './utils'

interface FilterFunctionsInput {
  isAllClustersSelected: boolean
  selectedClusters: string[]
  effectiveSelectedClusters: string[]
  isAllSeveritiesSelected: boolean
  selectedSeverities: SeverityLevel[]
  effectiveSelectedSeverities: SeverityLevel[]
  isAllStatusesSelected: boolean
  selectedStatuses: StatusLevel[]
  effectiveSelectedStatuses: StatusLevel[]
  customFilter: string
}

/**
 * Filter functions for cards to use — stabilized with useCallback to prevent
 * context consumers from re-rendering on every provider render.
 */
export function useFilterFunctions({
  isAllClustersSelected,
  selectedClusters,
  effectiveSelectedClusters,
  isAllSeveritiesSelected,
  selectedSeverities,
  effectiveSelectedSeverities,
  isAllStatusesSelected,
  selectedStatuses,
  effectiveSelectedStatuses,
  customFilter,
}: FilterFunctionsInput) {
  const filterByCluster = useCallback(<T extends { cluster?: string }>(items: T[]): T[] => {
    if (isAllClustersSelected) return items
    if (selectedClusters.includes(NONE_SENTINEL)) return []
    return items.filter(item => {
      return item.cluster && effectiveSelectedClusters.includes(item.cluster)
    })
  }, [isAllClustersSelected, selectedClusters, effectiveSelectedClusters])

  const filterBySeverity = useCallback(<T extends { severity?: string }>(items: T[]): T[] => {
    if (isAllSeveritiesSelected) return items
    if ((selectedSeverities as string[]).includes(NONE_SENTINEL)) return []
    return items.filter(item => {
      const severity = (item.severity || 'info').toLowerCase()
      return effectiveSelectedSeverities.includes(severity as SeverityLevel)
    })
  }, [isAllSeveritiesSelected, selectedSeverities, effectiveSelectedSeverities])

  const filterByStatus = useCallback(<T extends { status?: string }>(items: T[]): T[] => {
    if (isAllStatusesSelected) return items
    if ((selectedStatuses as string[]).includes(NONE_SENTINEL)) return []
    return items.filter(item => {
      const status = (item.status || '').toLowerCase()
      return effectiveSelectedStatuses.includes(status as StatusLevel)
    })
  }, [isAllStatusesSelected, selectedStatuses, effectiveSelectedStatuses])

  const filterByCustomText = useCallback(<T extends Record<string, unknown>>(
    items: T[],
    searchFields: string[] = DEFAULT_SEARCH_FIELDS
  ): T[] => {
    if (!customFilter.trim()) return items
    const query = customFilter.toLowerCase()
    return items.filter(item => matchesCustomText(item, query, searchFields))
  }, [customFilter])

  const filterItems = useCallback(<T extends { cluster?: string; severity?: string; status?: string } & Record<string, unknown>>(items: T[]): T[] => {
    let filtered = items
    filtered = filterByCluster(filtered)
    filtered = filterBySeverity(filtered)
    filtered = filterByStatus(filtered)
    filtered = filterByCustomText(filtered)
    return filtered
  }, [filterByCluster, filterBySeverity, filterByStatus, filterByCustomText])

  return { filterByCluster, filterBySeverity, filterByStatus, filterByCustomText, filterItems }
}
