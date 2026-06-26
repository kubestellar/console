import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/mcp/clusters'
import { LOCAL_FILTER_STORAGE_PREFIX, SINGLE_SELECT_STORAGE_PREFIX } from './cardFilters'
import type { ClusterWithHealth } from './cardFilters'

// ============================================================================
// VARIANT 1: useCardDataSingleSelect - Single-select cluster dropdown pattern
// ============================================================================

export interface SingleSelectConfig<T> {
  /** Unique ID for persisting selection to localStorage */
  storageKey: string
  /** Field that contains the cluster name */
  clusterField: keyof T
  /** Fields to search when using text filter */
  searchFields: (keyof T)[]
  /** Allow "All" option (empty selection shows all) */
  allowAll?: boolean
}

export interface UseSingleSelectResult<T> {
  /** Selected cluster name (empty string = all) */
  selectedCluster: string
  /** Set selected cluster */
  setSelectedCluster: (cluster: string) => void
  /** Available clusters for selection (respects global filter) */
  availableClusters: { name: string }[]
  /** Whether current selection is outside the global filter */
  isOutsideGlobalFilter: boolean
  /** Filtered items based on selection and global filters */
  filtered: T[]
  /** Local search query */
  search: string
  /** Set local search query */
  setSearch: (s: string) => void
}

/**
 * Hook for cards that use a single-select cluster dropdown.
 * Persists selection across page reloads and handles global filter sync.
 *
 * Used by: PVCStatus, CRDHealth, HelmReleaseStatus, OperatorStatus,
 * OperatorSubscriptions, ResourceUsage
 */
export function useSingleSelectCluster<T>(
  items: T[],
  config: SingleSelectConfig<T>
): UseSingleSelectResult<T> {
  const { storageKey, clusterField, searchFields, allowAll: _allowAll = true } = config
  const {
    filterByCluster,
    filterByStatus,
    customFilter: globalCustomFilter,
    selectedClusters,
    isAllClustersSelected } = useGlobalFilters()
  const { deduplicatedClusters } = useClusters()

  const [search, setSearch] = useState('')

  // Load persisted selection
  const [selectedCluster, setSelectedClusterState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}`)
      return stored || ''
    } catch {
      return ''
    }
  })

  // Persist selection to localStorage
  const setSelectedCluster = useCallback((cluster: string) => {
    setSelectedClusterState(cluster)
    try {
      if (cluster) {
        localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}`, cluster)
      } else {
        localStorage.removeItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}`)
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey])

  // Get reachable clusters (using deduplicated clusters)
  const reachableClusters = useMemo(() => {
    return deduplicatedClusters.filter(c => c.reachable !== false)
  }, [deduplicatedClusters])

  // Available clusters for selection (respects global filter)
  const availableClusters = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  // Check if current selection is outside global filter
  const isOutsideGlobalFilter = useMemo(() => {
    if (!selectedCluster) return false
    if (isAllClustersSelected) return false
    return !selectedClusters.includes(selectedCluster)
  }, [selectedCluster, selectedClusters, isAllClustersSelected])

  // Apply filters
  const filtered = useMemo(() => {
    let result = items

    // Apply global cluster filter
    result = filterByCluster(result as Array<{ cluster?: string }>) as T[]

    // Apply global status filter
    result = filterByStatus(result as Array<{ status?: string }>) as T[]

    // Apply local cluster selection
    if (selectedCluster) {
      result = result.filter(item => {
        const cluster = item[clusterField]
        return cluster === selectedCluster
      })
    }

    // Apply global custom text filter
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(item => {
        for (const field of searchFields) {
          const value = item[field]
          if (value && String(value).toLowerCase().includes(query)) {
            return true
          }
        }
        return false
      })
    }

    // Apply local search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item => {
        for (const field of searchFields) {
          const value = item[field]
          if (value && String(value).toLowerCase().includes(query)) {
            return true
          }
        }
        return false
      })
    }

    return result
  }, [
    items,
    filterByCluster,
    filterByStatus,
    selectedCluster,
    clusterField,
    globalCustomFilter,
    search,
    searchFields,
  ])

  return {
    selectedCluster,
    setSelectedCluster,
    availableClusters,
    isOutsideGlobalFilter,
    filtered,
    search,
    setSearch }
}

// ============================================================================
// VARIANT 2: useChartFilters - Chart cards without pagination
// ============================================================================

export interface ChartFilterConfig {
  /** Unique ID for persisting local filters to localStorage */
  storageKey?: string
}

export interface UseChartFiltersResult {
  /** Local cluster filter (additional to global) */
  localClusterFilter: string[]
  /** Toggle cluster in local filter */
  toggleClusterFilter: (cluster: string) => void
  /** Clear local cluster filter */
  clearClusterFilter: () => void
  /** Available clusters for filtering (respects global filter, includes health info) */
  availableClusters: ClusterWithHealth[]
  /** Filtered cluster list based on global + local filters */
  // cpuUsageCores/memoryUsageGB/metricsAvailable are needed so cards can
  // distinguish actual metrics-server usage from allocated requests (#6105).
  filteredClusters: { name: string; reachable?: boolean; cpuCores?: number; cpuRequestsCores?: number; memoryGB?: number; memoryRequestsGB?: number; podCount?: number; nodeCount?: number; cpuUsageCores?: number; memoryUsageGB?: number; metricsAvailable?: boolean }[]
  /** Whether cluster filter dropdown is showing */
  showClusterFilter: boolean
  /** Set cluster filter dropdown visibility */
  setShowClusterFilter: (show: boolean) => void
  /** Ref for cluster filter dropdown (for click outside handling) */
  clusterFilterRef: RefObject<HTMLDivElement | null>
  /** Ref for cluster filter button (portal positioning) */
  clusterFilterBtnRef: RefObject<HTMLButtonElement | null>
  /** Computed fixed position for portaled cluster dropdown */
  dropdownStyle: { top: number; left: number } | null
}

/**
 * Hook for chart cards that need cluster filtering but no pagination.
 *
 * Used by: ClusterMetrics, PodHealthTrend, ResourceTrend, GPUUsageTrend,
 * GPUUtilization, EventsTimeline
 */
export function useChartFilters(
  config: ChartFilterConfig = {}
): UseChartFiltersResult {
  const { storageKey } = config
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { deduplicatedClusters } = useClusters()

  const [localClusterFilter, setLocalClusterFilterState] = useState<string[]>(() => {
    if (!storageKey) return []
    try {
      const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}`)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const clusterFilterBtnRef = useRef<HTMLButtonElement>(null)
  const clusterDropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null)

  // Compute fixed position for portaled cluster dropdown
  useEffect(() => {
    if (showClusterFilter && clusterFilterBtnRef.current) {
      const rect = clusterFilterBtnRef.current.getBoundingClientRect()
      setDropdownStyle({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 192) })
    } else {
      setDropdownStyle(null)
    }
  }, [showClusterFilter])

  // Persist to localStorage
  const setLocalClusterFilter = useCallback((clusters: string[]) => {
    setLocalClusterFilterState(clusters)
    if (storageKey) {
      if (clusters.length === 0) {
        localStorage.removeItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}`)
      } else {
        localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}`, JSON.stringify(clusters))
      }
    }
  }, [storageKey])

  // Close dropdown when clicking outside (check both container and portaled dropdown)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        clusterFilterRef.current && !clusterFilterRef.current.contains(target) &&
        (!clusterDropdownRef.current || !clusterDropdownRef.current.contains(target))
      ) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Available clusters for filter dropdown (includes unreachable for display)
  const availableClusters = useMemo(() => {
    if (isAllClustersSelected) return deduplicatedClusters
    return deduplicatedClusters.filter(c => selectedClusters.includes(c.name))
  }, [deduplicatedClusters, selectedClusters, isAllClustersSelected])
  const availableClusterNames = useMemo(
    () => new Set(availableClusters.map(cluster => cluster.name)),
    [availableClusters],
  )

  // Drop any persisted local filter entries that no longer exist in the
  // current cluster set. When nothing valid remains, fall back to the
  // connected clusters instead of leaving chart cards stuck empty.
  useEffect(() => {
    if (localClusterFilter.length === 0) return
    const validSelections = localClusterFilter.filter(clusterName => availableClusterNames.has(clusterName))
    if (validSelections.length === localClusterFilter.length) return
    setLocalClusterFilter(validSelections)
  }, [availableClusterNames, localClusterFilter, setLocalClusterFilter])

  // Filtered clusters based on global + local filters (reachable only for data)
  const filteredClusters = useMemo(() => {
    let result = deduplicatedClusters.filter(c => c.reachable !== false)
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }
    return result
  }, [deduplicatedClusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const toggleClusterFilter = useCallback((clusterName: string) => {
    if (localClusterFilter.includes(clusterName)) {
      setLocalClusterFilter(localClusterFilter.filter(c => c !== clusterName))
    } else {
      setLocalClusterFilter([...localClusterFilter, clusterName])
    }
  }, [localClusterFilter, setLocalClusterFilter])

  const clearClusterFilter = useCallback(() => {
    setLocalClusterFilter([])
  }, [setLocalClusterFilter])

  return {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    filteredClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    clusterFilterBtnRef,
    dropdownStyle }
}

// ============================================================================
// VARIANT 3: useCascadingSelection - Two-level cascading selection
// ============================================================================

export interface CascadingSelectionConfig {
  /** Unique ID for persisting selection to localStorage */
  storageKey: string
}

export interface UseCascadingSelectionResult {
  /** Selected first-level value (e.g., cluster) */
  selectedFirst: string
  /** Set first-level selection */
  setSelectedFirst: (value: string) => void
  /** Selected second-level value (e.g., release/resource) */
  selectedSecond: string
  /** Set second-level selection */
  setSelectedSecond: (value: string) => void
  /** Available first-level options (respects global filter) */
  availableFirstLevel: { name: string }[]
  /** Reset both selections */
  resetSelection: () => void
}

/**
 * Hook for cards with two-level cascading selection (cluster -> resource).
 * Automatically clears second-level selection when first-level changes.
 * Syncs with global filter changes.
 *
 * Used by: HelmHistory, KustomizationStatus
 */
export function useCascadingSelection(
  config: CascadingSelectionConfig
): UseCascadingSelectionResult {
  const { storageKey } = config
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { deduplicatedClusters: allClusters } = useClusters()

  // Track local selection state for global filter sync
  const savedLocalFirst = useRef<string>('')
  const savedLocalSecond = useRef<string>('')
  const wasGlobalFilterActive = useRef(false)

  // Load persisted selection
  const [selectedFirst, setSelectedFirstState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-first`)
      return stored || ''
    } catch {
      return ''
    }
  })

  const [selectedSecond, setSelectedSecondState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-second`)
      return stored || ''
    } catch {
      return ''
    }
  })

  // Set first-level selection (clears second-level)
  const setSelectedFirst = useCallback((value: string) => {
    setSelectedFirstState(value)
    setSelectedSecondState('')
    try {
      if (value) {
        localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-first`, value)
      } else {
        localStorage.removeItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-first`)
      }
      localStorage.removeItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-second`)
    } catch {
      // Ignore storage errors
    }
  }, [storageKey])

  // Set second-level selection
  const setSelectedSecond = useCallback((value: string) => {
    setSelectedSecondState(value)
    try {
      if (value) {
        localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-second`, value)
      } else {
        localStorage.removeItem(`${SINGLE_SELECT_STORAGE_PREFIX}${storageKey}-second`)
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey])

  // Sync local selection with global filter changes
  useEffect(() => {
    const isGlobalFilterActive = !isAllClustersSelected && globalSelectedClusters.length > 0

    if (isGlobalFilterActive && !wasGlobalFilterActive.current) {
      // Global filter just became active - save current local selection
      savedLocalFirst.current = selectedFirst
      savedLocalSecond.current = selectedSecond
      // Auto-select first cluster from global filter if current selection is not in filter
      if (selectedFirst && !globalSelectedClusters.includes(selectedFirst)) {
        setSelectedFirst(globalSelectedClusters[0] || '')
      }
    } else if (!isGlobalFilterActive && wasGlobalFilterActive.current) {
      // Global filter just cleared - restore previous local selection
      if (savedLocalFirst.current) {
        setSelectedFirstState(savedLocalFirst.current)
        setSelectedSecondState(savedLocalSecond.current)
        savedLocalFirst.current = ''
        savedLocalSecond.current = ''
      }
    }

    wasGlobalFilterActive.current = isGlobalFilterActive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSelectedClusters, isAllClustersSelected])

  // Apply global filters to get available first-level options
  const availableFirstLevel = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  const resetSelection = useCallback(() => {
    setSelectedFirst('')
  }, [setSelectedFirst])

  return {
    selectedFirst,
    setSelectedFirst,
    selectedSecond,
    setSelectedSecond,
    availableFirstLevel,
    resetSelection }
}

// ============================================================================
// VARIANT 4: useStatusFilterChips - Status filter chips pattern
// ============================================================================

export interface StatusFilterConfig<S extends string> {
  /** Available status values */
  statuses: readonly S[]
  /** Default status (usually 'all') */
  defaultStatus: S
  /** Unique ID for persisting to localStorage */
  storageKey?: string
}

export interface UseStatusFilterResult<S extends string> {
  /** Current status filter */
  statusFilter: S
  /** Set status filter */
  setStatusFilter: (status: S) => void
}

/**
 * Hook for cards with status filter chips.
 *
 * Used by: DeploymentStatus
 */
export function useStatusFilter<S extends string>(
  config: StatusFilterConfig<S>
): UseStatusFilterResult<S> {
  const { statuses, defaultStatus, storageKey } = config

  const [statusFilter, setStatusFilterState] = useState<S>(() => {
    if (!storageKey) return defaultStatus
    try {
      const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}-status`)
      if (stored && statuses.includes(stored as S)) {
        return stored as S
      }
      return defaultStatus
    } catch {
      return defaultStatus
    }
  })

  const setStatusFilter = useCallback((status: S) => {
    setStatusFilterState(status)
    if (storageKey) {
      try {
        if (status === defaultStatus) {
          localStorage.removeItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}-status`)
        } else {
          localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}-status`, status)
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey, defaultStatus])

  return {
    statusFilter,
    setStatusFilter }
}
