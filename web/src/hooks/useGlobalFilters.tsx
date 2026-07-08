import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'
// Import directly from mcp/clusters to avoid pulling in the full MCP barrel
// (~254 KB). Only clusters.ts + shared.ts are needed here.
import { useClusters } from './mcp/clusters'
import {
  CUSTOM_FILTER_STORAGE_KEY,
  DEFAULT_GLOBAL_FILTERS,
  DEFAULT_SEARCH_FIELDS,
  NONE_SENTINEL,
  SAVED_FILTER_SETS_KEY,
} from './globalFilters/constants'
import type {
  GlobalFiltersContextType,
  SavedFilterSet,
  SeverityLevel,
  StatusLevel,
} from './globalFilters/types'
import {
  getAvailableDistributions,
  haveSameSelections,
  loadStoredSavedFilterSets,
  loadStoredText,
  matchesCustomText,
} from './globalFilters/utils'
import { useClusterFilter } from './globalFilters/useClusterFilter'
import { useSeverityFilter } from './globalFilters/useSeverityFilter'
import { useStatusFilter } from './globalFilters/useStatusFilter'
import { useDistributionFilter } from './globalFilters/useDistributionFilter'

export type { ClusterGroup, SavedFilterSet, SeverityLevel, StatusLevel } from './globalFilters/types'

const GlobalFiltersContext = createContext<GlobalFiltersContextType | null>(null)

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const { deduplicatedClusters } = useClusters()

  // --- Cluster + cluster-groups filter ---
  const {
    rawSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,
    effectiveSelectedClusters,
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
  } = useClusterFilter(deduplicatedClusters)

  // --- Severity filter ---
  const {
    rawSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedSeverities,
  } = useSeverityFilter()

  // --- Status filter ---
  const {
    rawSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    effectiveSelectedStatuses,
  } = useStatusFilter()

  // --- Distribution filter ---
  const availableDistributions = useMemo(
    () => getAvailableDistributions(deduplicatedClusters),
    [deduplicatedClusters]
  )
  const {
    rawSelectedDistributions,
    setSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    effectiveSelectedDistributions,
  } = useDistributionFilter(availableDistributions)

  // --- Custom text filter ---
  const [customFilter, setCustomFilterState] = useState<string>(() => loadStoredText(CUSTOM_FILTER_STORAGE_KEY))

  useEffect(() => {
    localStorage.setItem(CUSTOM_FILTER_STORAGE_KEY, customFilter)
  }, [customFilter])

  const setCustomFilter = useCallback((filter: string) => setCustomFilterState(filter), [])
  const clearCustomFilter = useCallback(() => setCustomFilterState(''), [])
  const hasCustomFilter = customFilter.trim().length > 0

  // --- Combined filter state ---
  const isFiltered = isClustersFiltered || isSeveritiesFiltered || isStatusesFiltered || isDistributionsFiltered || hasCustomFilter

  const clearAllFilters = useCallback(() => {
    selectAllClusters()
    selectAllSeverities()
    selectAllStatuses()
    selectAllDistributions()
    clearCustomFilter()
  }, [selectAllClusters, selectAllSeverities, selectAllStatuses, selectAllDistributions, clearCustomFilter])

  // --- Saved filter sets ---
  const [savedFilterSets, setSavedFilterSets] = useState<SavedFilterSet[]>(() => loadStoredSavedFilterSets(SAVED_FILTER_SETS_KEY))

  useEffect(() => {
    localStorage.setItem(SAVED_FILTER_SETS_KEY, JSON.stringify(savedFilterSets))
  }, [savedFilterSets])

  const saveCurrentFilters = useCallback((name: string, color: string) => {
    const id = `filterset-${Date.now()}`
    const newSet: SavedFilterSet = {
      id,
      name,
      color,
      clusters: [...rawSelectedClusters],
      severities: [...rawSelectedSeverities],
      statuses: [...rawSelectedStatuses],
      distributions: [...rawSelectedDistributions],
      customText: customFilter }
    setSavedFilterSets(prev => [...prev, newSet])
  }, [rawSelectedClusters, rawSelectedSeverities, rawSelectedStatuses, rawSelectedDistributions, customFilter])

  const applySavedFilterSet = useCallback((id: string) => {
    const filterSet = savedFilterSets.find(fs => fs.id === id)
    if (!filterSet) return
    setSelectedClusters(filterSet.clusters)
    setSelectedSeverities(filterSet.severities as SeverityLevel[])
    setSelectedStatuses(filterSet.statuses as StatusLevel[])
    setSelectedDistributions(filterSet.distributions || [])
    setCustomFilterState(filterSet.customText)
  }, [savedFilterSets, setSelectedClusters, setSelectedSeverities, setSelectedStatuses, setSelectedDistributions])

  const deleteSavedFilterSet = useCallback((id: string) => {
    setSavedFilterSets(prev => prev.filter(fs => fs.id !== id))
  }, [])

  const activeFilterSetId = useMemo(() => {
    for (const fs of (savedFilterSets || [])) {
      const clustersMatch = haveSameSelections(fs.clusters, rawSelectedClusters)
      const severitiesMatch = haveSameSelections(fs.severities, rawSelectedSeverities as string[])
      const statusesMatch = haveSameSelections(fs.statuses, rawSelectedStatuses as string[])
      const distributionsMatch = haveSameSelections(fs.distributions || [], rawSelectedDistributions)
      const textMatch = fs.customText === customFilter
      if (clustersMatch && severitiesMatch && statusesMatch && distributionsMatch && textMatch) return fs.id
    }
    return null
  }, [savedFilterSets, rawSelectedClusters, rawSelectedSeverities, rawSelectedStatuses, rawSelectedDistributions, customFilter])

  // --- Filter functions ---
  const filterByCluster = useCallback(<T extends { cluster?: string }>(items: T[]): T[] => {
    if (isAllClustersSelected) return items
    if (rawSelectedClusters.includes(NONE_SENTINEL)) return []
    return items.filter(item => item.cluster && effectiveSelectedClusters.includes(item.cluster))
  }, [isAllClustersSelected, rawSelectedClusters, effectiveSelectedClusters])

  const filterBySeverity = useCallback(<T extends { severity?: string }>(items: T[]): T[] => {
    if (isAllSeveritiesSelected) return items
    if ((rawSelectedSeverities as string[]).includes(NONE_SENTINEL)) return []
    return items.filter(item => {
      const severity = (item.severity || 'info').toLowerCase()
      return effectiveSelectedSeverities.includes(severity as SeverityLevel)
    })
  }, [isAllSeveritiesSelected, rawSelectedSeverities, effectiveSelectedSeverities])

  const filterByStatus = useCallback(<T extends { status?: string }>(items: T[]): T[] => {
    if (isAllStatusesSelected) return items
    if ((rawSelectedStatuses as string[]).includes(NONE_SENTINEL)) return []
    return items.filter(item => {
      const status = (item.status || '').toLowerCase()
      return effectiveSelectedStatuses.includes(status as StatusLevel)
    })
  }, [isAllStatusesSelected, rawSelectedStatuses, effectiveSelectedStatuses])

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

  const contextValue = useMemo(() => ({
    // Cluster filtering
    selectedClusters: effectiveSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,

    // Cluster groups
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,

    // Severity filtering
    selectedSeverities: effectiveSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,

    // Status filtering
    selectedStatuses: effectiveSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,

    // Distribution filtering
    selectedDistributions: effectiveSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    availableDistributions,

    // Custom text filter
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,

    // Combined filter helpers
    isFiltered,
    clearAllFilters,

    // Saved filter sets
    savedFilterSets,
    saveCurrentFilters,
    applySavedFilterSet,
    deleteSavedFilterSet,
    activeFilterSetId,

    // Filter functions
    filterByCluster,
    filterBySeverity,
    filterByStatus,
    filterByCustomText,
    filterItems,
  }), [
    effectiveSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    effectiveSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    effectiveSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    availableDistributions,
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,
    isFiltered,
    clearAllFilters,
    filterByCluster,
    filterBySeverity,
    filterByStatus,
    filterByCustomText,
    filterItems,
    savedFilterSets,
    saveCurrentFilters,
    applySavedFilterSet,
    deleteSavedFilterSet,
    activeFilterSetId,
  ])

  return (
    <GlobalFiltersContext.Provider value={contextValue}>
      {children}
    </GlobalFiltersContext.Provider>
  )
}


export function useGlobalFilters() {
  return useContext(GlobalFiltersContext) ?? DEFAULT_GLOBAL_FILTERS
}
