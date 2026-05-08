import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'
// Import directly from mcp/clusters to avoid pulling in the full MCP barrel
// (~254 KB). Only clusters.ts + shared.ts are needed here.
import { useClusters } from './mcp/clusters'
import { emitGlobalClusterFilterChanged, emitGlobalSeverityFilterChanged, emitGlobalStatusFilterChanged } from '../lib/analytics'
import {
  CLUSTER_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  DEFAULT_GLOBAL_FILTERS,
  DEFAULT_SEARCH_FIELDS,
  DISTRIBUTION_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  NONE_SENTINEL,
  SAVED_FILTER_SETS_KEY,
  SEVERITY_LEVELS,
  SEVERITY_STORAGE_KEY,
  STATUS_LEVELS,
  STATUS_STORAGE_KEY,
} from './globalFilters/constants'
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
  haveSameSelections,
  loadStoredClusterGroups,
  loadStoredSavedFilterSets,
  loadStoredSelection,
  loadStoredText,
  matchesCustomText,
} from './globalFilters/utils'

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

  // Initialize clusters from localStorage or default to all
  const [selectedClusters, setSelectedClustersState] = useState<string[]>(() => loadStoredSelection(CLUSTER_STORAGE_KEY))

  // Initialize severities from localStorage or default to all
  const [selectedSeverities, setSelectedSeveritiesState] = useState<SeverityLevel[]>(() => loadStoredSelection<SeverityLevel>(SEVERITY_STORAGE_KEY))

  // Initialize cluster groups from localStorage (+ migrate legacy projects)
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>(loadStoredClusterGroups)

  // Initialize statuses from localStorage or default to all
  const [selectedStatuses, setSelectedStatusesState] = useState<StatusLevel[]>(() => loadStoredSelection<StatusLevel>(STATUS_STORAGE_KEY))

  // Initialize distributions from localStorage or default to all
  const [selectedDistributions, setSelectedDistributionsState] = useState<string[]>(() => loadStoredSelection(DISTRIBUTION_STORAGE_KEY))

  // Initialize custom text filter from localStorage
  const [customFilter, setCustomFilterState] = useState<string>(() => loadStoredText(CUSTOM_FILTER_STORAGE_KEY))

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
      setSelectedClustersState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableClusters, selectedClusters])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(selectedClusters.length === 0 ? null : selectedClusters))
  }, [selectedClusters])

  useEffect(() => {
    localStorage.setItem(SEVERITY_STORAGE_KEY, JSON.stringify(selectedSeverities.length === 0 ? null : selectedSeverities))
  }, [selectedSeverities])

  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(clusterGroups))
  }, [clusterGroups])

  useEffect(() => {
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(selectedStatuses.length === 0 ? null : selectedStatuses))
  }, [selectedStatuses])

  useEffect(() => {
    localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(selectedDistributions.length === 0 ? null : selectedDistributions))
  }, [selectedDistributions])

  useEffect(() => {
    localStorage.setItem(CUSTOM_FILTER_STORAGE_KEY, customFilter)
  }, [customFilter])

  useEffect(() => {
    localStorage.setItem(SAVED_FILTER_SETS_KEY, JSON.stringify(savedFilterSets))
  }, [savedFilterSets])

  // Cluster filtering — callbacks stabilized with useCallback
  const setSelectedClusters = useCallback((clusters: string[]) => {
    setSelectedClustersState(clusters)
    emitGlobalClusterFilterChanged(clusters.length, availableClusters.length)
  }, [availableClusters.length])

  const toggleCluster = useCallback((cluster: string) => {
    setSelectedClustersState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = availableClusters.filter(c => c !== cluster)
        emitGlobalClusterFilterChanged(next.length, availableClusters.length)
        return next
      }

      if (prev.includes(cluster)) {
        // Remove cluster - if last one, revert to all
        const newSelection = prev.filter(c => c !== cluster)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalClusterFilterChanged(result.length, availableClusters.length)
        return result
      } else {
        // Add cluster
        const newSelection = [...prev, cluster]
        // If all clusters are now selected, switch to "all" mode
        if (newSelection.length === availableClusters.length) {
          emitGlobalClusterFilterChanged(0, availableClusters.length)
          return []
        }
        emitGlobalClusterFilterChanged(newSelection.length, availableClusters.length)
        return newSelection
      }
    })
  }, [availableClusters])

  const selectAllClusters = useCallback(() => {
    setSelectedClustersState([])
  }, [])

  const deselectAllClusters = useCallback(() => {
    setSelectedClustersState([NONE_SENTINEL])
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
      setSelectedClustersState(group.clusters)
    }
  }, [clusterGroups])

  // Severity filtering — stabilized with useCallback
  const setSelectedSeverities = useCallback((severities: SeverityLevel[]) => {
    setSelectedSeveritiesState(severities)
    emitGlobalSeverityFilterChanged(severities.length)
  }, [])

  const toggleSeverity = useCallback((severity: SeverityLevel) => {
    setSelectedSeveritiesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = SEVERITY_LEVELS.filter(s => s !== severity)
        emitGlobalSeverityFilterChanged(next.length)
        return next
      }

      if (prev.includes(severity)) {
        // Remove severity - if last one, revert to all
        const newSelection = prev.filter(s => s !== severity)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalSeverityFilterChanged(result.length)
        return result
      } else {
        // Add severity
        const newSelection = [...prev, severity]
        // If all severities are now selected, switch to "all" mode
        if (newSelection.length === SEVERITY_LEVELS.length) {
          emitGlobalSeverityFilterChanged(0)
          return []
        }
        emitGlobalSeverityFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllSeverities = useCallback(() => {
    setSelectedSeveritiesState([])
  }, [])

  const deselectAllSeverities = useCallback(() => {
    setSelectedSeveritiesState([NONE_SENTINEL as SeverityLevel])
  }, [])

  const isAllSeveritiesSelected = selectedSeverities.length === 0
  const isSeveritiesFiltered = !isAllSeveritiesSelected

  // Get effective selected severities (for filtering)
  const effectiveSelectedSeverities = isAllSeveritiesSelected ? SEVERITY_LEVELS : selectedSeverities

  // Status filtering
  // Status filtering — stabilized with useCallback
  const setSelectedStatuses = useCallback((statuses: StatusLevel[]) => {
    setSelectedStatusesState(statuses)
    emitGlobalStatusFilterChanged(statuses.length)
  }, [])

  const toggleStatus = useCallback((status: StatusLevel) => {
    setSelectedStatusesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = STATUS_LEVELS.filter(s => s !== status)
        emitGlobalStatusFilterChanged(next.length)
        return next
      }

      if (prev.includes(status)) {
        // Remove status - if last one, revert to all
        const newSelection = prev.filter(s => s !== status)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalStatusFilterChanged(result.length)
        return result
      } else {
        // Add status
        const newSelection = [...prev, status]
        // If all statuses are now selected, switch to "all" mode
        if (newSelection.length === STATUS_LEVELS.length) {
          emitGlobalStatusFilterChanged(0)
          return []
        }
        emitGlobalStatusFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllStatuses = useCallback(() => {
    setSelectedStatusesState([])
  }, [])

  const deselectAllStatuses = useCallback(() => {
    setSelectedStatusesState([NONE_SENTINEL as StatusLevel])
  }, [])

  const isAllStatusesSelected = selectedStatuses.length === 0
  const isStatusesFiltered = !isAllStatusesSelected

  // Get effective selected statuses (for filtering)
  const effectiveSelectedStatuses = isAllStatusesSelected ? STATUS_LEVELS : selectedStatuses

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
      setSelectedDistributionsState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableDistributions, selectedDistributions])

  const toggleDistribution = useCallback((distribution: string) => {
    setSelectedDistributionsState(prev => {
      if (prev.length === 0) {
        // Currently "all" → switch to all except this one
        return availableDistributions.filter(d => d !== distribution)
      }
      if (prev.includes(distribution)) {
        const next = prev.filter(d => d !== distribution)
        return next.length === 0 ? [] : next
      } else {
        const next = [...prev, distribution]
        return next.length === availableDistributions.length ? [] : next
      }
    })
  }, [availableDistributions])

  const selectAllDistributions = useCallback(() => setSelectedDistributionsState([]), [])
  const deselectAllDistributions = useCallback(() => setSelectedDistributionsState([NONE_SENTINEL]), [])

  const isAllDistributionsSelected = selectedDistributions.length === 0
  const isDistributionsFiltered = !isAllDistributionsSelected
  const effectiveSelectedDistributions = isAllDistributionsSelected ? availableDistributions : selectedDistributions

  // Custom text filter
  const setCustomFilter = useCallback((filter: string) => {
    setCustomFilterState(filter)
  }, [])

  const clearCustomFilter = useCallback(() => {
    setCustomFilterState('')
  }, [])

  const hasCustomFilter = customFilter.trim().length > 0

  // Combined filter state
  const isFiltered = isClustersFiltered || isSeveritiesFiltered || isStatusesFiltered || isDistributionsFiltered || hasCustomFilter

  const clearAllFilters = useCallback(() => {
    setSelectedClustersState([])
    setSelectedSeveritiesState([])
    setSelectedStatusesState([])
    setSelectedDistributionsState([])
    setCustomFilterState('')
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
    setSelectedClustersState(filterSet.clusters)
    setSelectedSeveritiesState(filterSet.severities as SeverityLevel[])
    setSelectedStatusesState(filterSet.statuses as StatusLevel[])
    setSelectedDistributionsState(filterSet.distributions || [])
    setCustomFilterState(filterSet.customText)
  }, [savedFilterSets])

  const deleteSavedFilterSet = useCallback((id: string) => {
    setSavedFilterSets(prev => prev.filter(fs => fs.id !== id))
  }, [])

  // Detect which saved filter set matches the current state
  const activeFilterSetId = useMemo(() => {
    for (const fs of savedFilterSets) {
      const clustersMatch = haveSameSelections(fs.clusters, selectedClusters)
      const severitiesMatch = haveSameSelections(fs.severities, selectedSeverities as string[])
      const statusesMatch = haveSameSelections(fs.statuses, selectedStatuses as string[])
      const distributionsMatch = haveSameSelections(fs.distributions || [], selectedDistributions)
      const textMatch = fs.customText === customFilter
      if (clustersMatch && severitiesMatch && statusesMatch && distributionsMatch && textMatch) return fs.id
    }
    return null
  }, [savedFilterSets, selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter])

  // Filter functions for cards to use — stabilized with useCallback to prevent
  // context consumers from re-rendering on every provider render.
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
