import { createContext, useContext, useState, useReducer, useEffect, useMemo, useCallback, ReactNode } from 'react'
// Import directly from mcp/clusters to avoid pulling in the full MCP barrel
// (~254 KB). Only clusters.ts + shared.ts are needed here.
import { useClusters } from './mcp/clusters'
import { emitGlobalClusterFilterChanged } from '../lib/analytics'
import { DEFAULT_GLOBAL_FILTERS, NONE_SENTINEL, SAVED_FILTER_SETS_KEY } from './globalFilters/constants'
import type {
  ClusterGroup,
  GlobalFiltersContextType,
  SavedFilterSet,
  SeverityLevel,
  StatusLevel,
} from './globalFilters/types'
import {
  buildClusterInfoMap,
  getAvailableDistributions,
  loadStoredClusterGroups,
  loadStoredSavedFilterSets,
} from './globalFilters/utils'
import { findActiveFilterSetId, loadInitialFilterSelections, patchFilters } from './globalFilters/filterSelections'
import { useFilterPersistence } from './globalFilters/useFilterPersistence'
import { useSeverityStatusFilters } from './globalFilters/useSeverityStatusFilters'
import { useFilterFunctions } from './globalFilters/useFilterFunctions'

export { SEVERITY_CONFIG, SEVERITY_LEVELS, STATUS_CONFIG, STATUS_LEVELS } from './globalFilters/constants'
export type { ClusterGroup, SavedFilterSet, SeverityLevel, StatusLevel } from './globalFilters/types'

const GlobalFiltersContext = createContext<GlobalFiltersContextType | null>(null)

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const { deduplicatedClusters } = useClusters()
  const availableClusters = useMemo(
    () => deduplicatedClusters.map(c => c.name),
    [deduplicatedClusters]
  )
  const clusterInfoMap = useMemo(
    () => buildClusterInfoMap(deduplicatedClusters),
    [deduplicatedClusters]
  )

  // Combine all selection states into a single atom to prevent consecutive
  // setState calls in clearAllFilters and applySavedFilterSet.
  const [filters, dispatchFilters] = useReducer(patchFilters, undefined, loadInitialFilterSelections)
  const {
    clusters: selectedClusters,
    severities: selectedSeverities,
    statuses: selectedStatuses,
    distributions: selectedDistributions,
    customText: customFilter,
  } = filters

  // Initialize cluster groups from localStorage (+ migrate legacy projects)
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>(loadStoredClusterGroups)

  // Initialize saved filter sets from localStorage
  const [savedFilterSets, setSavedFilterSets] = useState<SavedFilterSet[]>(() => loadStoredSavedFilterSets(SAVED_FILTER_SETS_KEY))

  // Reconcile selected clusters against available clusters — drop any that no longer exist.
  // This prevents filters from getting stuck on clusters that have been removed from kubeconfig.
  // Skip reconciliation when the __none__ sentinel is present (user explicitly deselected all).
  useEffect(() => {
    if (selectedClusters.length === 0 || availableClusters.length === 0) return
    // Preserve the "select none" sentinel — it is not a real cluster name
    if (selectedClusters.includes(NONE_SENTINEL)) return
    const validSelections = selectedClusters.filter(c => availableClusters.includes(c))
    if (validSelections.length !== selectedClusters.length) {
      dispatchFilters({ clusters: validSelections.length === 0 ? [] : validSelections })
    }
  }, [availableClusters, selectedClusters])

  useFilterPersistence(filters, clusterGroups, savedFilterSets)

  // Cluster filtering — callbacks stabilized with useCallback
  const setSelectedClusters = useCallback((clusters: string[]) => {
    dispatchFilters({ clusters })
    emitGlobalClusterFilterChanged(clusters.length, availableClusters.length)
  }, [availableClusters.length])

  const toggleCluster = useCallback((cluster: string) => {
    dispatchFilters(({ clusters: prev }) => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = availableClusters.filter(c => c !== cluster)
        emitGlobalClusterFilterChanged(next.length, availableClusters.length)
        return { clusters: next }
      }

      if (prev.includes(cluster)) {
        // Remove cluster - if last one, revert to all
        const newSelection = prev.filter(c => c !== cluster)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalClusterFilterChanged(result.length, availableClusters.length)
        return { clusters: result }
      } else {
        // Add cluster
        const newSelection = [...prev, cluster]
        // If all clusters are now selected, switch to "all" mode
        if (newSelection.length === availableClusters.length) {
          emitGlobalClusterFilterChanged(0, availableClusters.length)
          return { clusters: [] }
        }
        emitGlobalClusterFilterChanged(newSelection.length, availableClusters.length)
        return { clusters: newSelection }
      }
    })
  }, [availableClusters])

  const selectAllClusters = useCallback(() => {
    dispatchFilters({ clusters: [] })
  }, [])

  const deselectAllClusters = useCallback(() => {
    dispatchFilters({ clusters: [NONE_SENTINEL] })
  }, [])

  const isAllClustersSelected = selectedClusters.length === 0
  const isClustersFiltered = !isAllClustersSelected

  // Get effective selected clusters (for filtering)
  const effectiveSelectedClusters = isAllClustersSelected ? availableClusters : selectedClusters

  // Cluster groups — stabilized with useCallback
  const addClusterGroup = useCallback((group: Omit<ClusterGroup, 'id'>) => {
    const id = `group-${Date.now()}`
    setClusterGroups(prev => [...prev, { ...group, id }])
  }, [])

  const updateClusterGroup = useCallback((id: string, updates: Partial<ClusterGroup>) => {
    setClusterGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])

  const deleteClusterGroup = useCallback((id: string) => {
    setClusterGroups(prev => prev.filter(g => g.id !== id))
  }, [])

  const selectClusterGroup = useCallback((groupId: string) => {
    const group = clusterGroups.find(g => g.id === groupId)
    if (group) {
      dispatchFilters({ clusters: group.clusters })
    }
  }, [clusterGroups])

  const {
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedSeverities,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    effectiveSelectedStatuses,
  } = useSeverityStatusFilters(dispatchFilters, selectedSeverities, selectedStatuses)

  // Distribution filtering — derives available distributions from clusters
  const availableDistributions = useMemo(
    () => getAvailableDistributions(deduplicatedClusters),
    [deduplicatedClusters]
  )

  // Reconcile selected distributions against available ones.
  // Skip when the __none__ sentinel is present (user explicitly deselected all).
  useEffect(() => {
    if (selectedDistributions.length === 0 || availableDistributions.length === 0) return
    if (selectedDistributions.includes(NONE_SENTINEL)) return
    const validSelections = selectedDistributions.filter(d => availableDistributions.includes(d))
    if (validSelections.length !== selectedDistributions.length) {
      dispatchFilters({ distributions: validSelections.length === 0 ? [] : validSelections })
    }
  }, [availableDistributions, selectedDistributions])

  const toggleDistribution = useCallback((distribution: string) => {
    dispatchFilters(({ distributions: prev }) => {
      if (prev.length === 0) {
        // Currently "all" → switch to all except this one
        return { distributions: availableDistributions.filter(d => d !== distribution) }
      }
      if (prev.includes(distribution)) {
        const next = prev.filter(d => d !== distribution)
        return { distributions: next.length === 0 ? [] : next }
      } else {
        const next = [...prev, distribution]
        return { distributions: next.length === availableDistributions.length ? [] : next }
      }
    })
  }, [availableDistributions])

  const selectAllDistributions = useCallback(() => dispatchFilters({ distributions: [] }), [])
  const deselectAllDistributions = useCallback(() => dispatchFilters({ distributions: [NONE_SENTINEL] }), [])

  const isAllDistributionsSelected = selectedDistributions.length === 0
  const isDistributionsFiltered = !isAllDistributionsSelected
  const effectiveSelectedDistributions = isAllDistributionsSelected ? availableDistributions : selectedDistributions

  // Custom text filter
  const setCustomFilter = useCallback((filter: string) => {
    dispatchFilters({ customText: filter })
  }, [])

  const clearCustomFilter = useCallback(() => {
    dispatchFilters({ customText: '' })
  }, [])

  const hasCustomFilter = customFilter.trim().length > 0

  // Combined filter state
  const isFiltered = isClustersFiltered || isSeveritiesFiltered || isStatusesFiltered || isDistributionsFiltered || hasCustomFilter

  const clearAllFilters = useCallback(() => {
    dispatchFilters({ clusters: [], severities: [], statuses: [], distributions: [], customText: '' })
  }, [])

  // Saved filter sets — stabilized with useCallback
  const saveCurrentFilters = useCallback((name: string, color: string) => {
    const id = `filterset-${Date.now()}`
    const newSet: SavedFilterSet = {
      id,
      name,
      color,
      clusters: [...selectedClusters],
      severities: [...selectedSeverities],
      statuses: [...selectedStatuses],
      distributions: [...selectedDistributions],
      customText: customFilter }
    setSavedFilterSets(prev => [...prev, newSet])
  }, [selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter])

  const applySavedFilterSet = useCallback((id: string) => {
    const filterSet = savedFilterSets.find(fs => fs.id === id)
    if (!filterSet) return
    dispatchFilters({
      clusters: filterSet.clusters,
      severities: filterSet.severities as SeverityLevel[],
      statuses: filterSet.statuses as StatusLevel[],
      distributions: filterSet.distributions || [],
      customText: filterSet.customText,
    })
  }, [savedFilterSets])

  const deleteSavedFilterSet = useCallback((id: string) => {
    setSavedFilterSets(prev => prev.filter(fs => fs.id !== id))
  }, [])

  // Detect which saved filter set matches the current state
  const activeFilterSetId = useMemo(
    () => findActiveFilterSetId(savedFilterSets, selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter),
    [savedFilterSets, selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter]
  )

  const { filterByCluster, filterBySeverity, filterByStatus, filterByCustomText, filterItems } = useFilterFunctions({
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
  })

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
    filterItems }), [
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
