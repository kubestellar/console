import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'

// ============================================================================
// Types
// ============================================================================

export type SortDirection = 'asc' | 'desc'

export interface SortOption<T> {
  value: T
  label: string
}

export interface FilterConfig<T> {
  /** Fields to search when using text filter */
  searchFields: (keyof T)[]
  /** Field that contains the cluster name (for cluster filtering) */
  clusterField?: keyof T
  /** Field that contains the status (for status filtering) */
  statusField?: keyof T
  /** Additional filter predicate */
  customPredicate?: (item: T, query: string) => boolean
  /** Unique ID for persisting local filters to localStorage */
  storageKey?: string
}

export interface SortConfig<T, S extends string = string> {
  /** Default sort field */
  defaultField: S
  /** Default sort direction */
  defaultDirection: SortDirection
  /** Compare function for each sortable field */
  comparators: Record<S, (a: T, b: T) => number>
}

export interface CardDataConfig<T, S extends string = string> {
  filter: FilterConfig<T>
  sort: SortConfig<T, S>
  /** Default items per page */
  defaultLimit?: number | 'unlimited'
}

// ============================================================================
// useCardFilters - Generic filtering hook
// ============================================================================

export interface UseCardFiltersResult<T> {
  /** Filtered items */
  filtered: T[]
  /** Local search query */
  search: string
  /** Set local search query */
  setSearch: (s: string) => void
  /** Local cluster filter (additional to global) */
  localClusterFilter: string[]
  /** Toggle cluster in local filter */
  toggleClusterFilter: (cluster: string) => void
  /** Clear local cluster filter */
  clearClusterFilter: () => void
  /** Available clusters for filtering (respects global filter) */
  availableClusters: { name: string }[]
  /** Whether cluster filter dropdown is showing */
  showClusterFilter: boolean
  /** Set cluster filter dropdown visibility */
  setShowClusterFilter: (show: boolean) => void
  /** Ref for cluster filter dropdown (for click outside handling) */
  clusterFilterRef: React.RefObject<HTMLDivElement>
}

const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

export function useCardFilters<T>(
  items: T[],
  config: FilterConfig<T>
): UseCardFiltersResult<T> {
  const { searchFields, clusterField, statusField, customPredicate, storageKey } = config
  const {
    filterByCluster,
    filterByStatus,
    customFilter: globalCustomFilter,
    selectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { clusters } = useClusters()

  // Local state with localStorage persistence for cluster filter
  const [search, setSearch] = useState('')
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

  // Wrapper to persist to localStorage
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Available clusters for local filter (respects global filter)
  const availableClusters = useMemo(() => {
    const reachable = clusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

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

  // Apply all filters
  const filtered = useMemo(() => {
    let result = items

    // Apply global cluster filter (if clusterField specified)
    if (clusterField) {
      result = filterByCluster(result as Array<{ cluster?: string }>) as T[]
    }

    // Apply global status filter (if statusField specified)
    if (statusField) {
      result = filterByStatus(result as Array<{ status?: string }>) as T[]
    }

    // Apply local cluster filter (on top of global)
    if (localClusterFilter.length > 0 && clusterField) {
      result = result.filter(item => {
        const cluster = item[clusterField]
        return cluster && localClusterFilter.includes(String(cluster))
      })
    }

    // Apply global custom text filter
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(item => {
        // Check searchFields
        for (const field of searchFields) {
          const value = item[field]
          if (value && String(value).toLowerCase().includes(query)) {
            return true
          }
        }
        // Check custom predicate
        if (customPredicate && customPredicate(item, query)) {
          return true
        }
        return false
      })
    }

    // Apply local search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item => {
        // Check searchFields
        for (const field of searchFields) {
          const value = item[field]
          if (value && String(value).toLowerCase().includes(query)) {
            return true
          }
        }
        // Check custom predicate
        if (customPredicate && customPredicate(item, query)) {
          return true
        }
        return false
      })
    }

    return result
  }, [
    items,
    filterByCluster,
    filterByStatus,
    globalCustomFilter,
    search,
    localClusterFilter,
    searchFields,
    clusterField,
    statusField,
    customPredicate,
  ])

  return {
    filtered,
    search,
    setSearch,
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  }
}

// ============================================================================
// useCardSort - Generic sorting hook
// ============================================================================

export interface UseCardSortResult<T, S extends string> {
  /** Sorted items */
  sorted: T[]
  /** Current sort field */
  sortBy: S
  /** Set sort field */
  setSortBy: (field: S) => void
  /** Current sort direction */
  sortDirection: SortDirection
  /** Set sort direction */
  setSortDirection: (dir: SortDirection) => void
  /** Toggle sort direction */
  toggleSortDirection: () => void
}

export function useCardSort<T, S extends string>(
  items: T[],
  config: SortConfig<T, S>
): UseCardSortResult<T, S> {
  const { defaultField, defaultDirection, comparators } = config
  const [sortBy, setSortBy] = useState<S>(defaultField)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection)

  const toggleSortDirection = useCallback(() => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }, [])

  const sorted = useMemo(() => {
    const comparator = comparators[sortBy]
    if (!comparator) return items

    const sortedItems = [...items].sort((a, b) => {
      const result = comparator(a, b)
      return sortDirection === 'asc' ? result : -result
    })

    return sortedItems
  }, [items, sortBy, sortDirection, comparators])

  return {
    sorted,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    toggleSortDirection,
  }
}

// ============================================================================
// useCardData - Combined filter + sort + pagination
// ============================================================================

export interface UseCardDataResult<T, S extends string> {
  /** Final processed items (filtered, sorted, paginated) */
  items: T[]
  /** Total items before pagination */
  totalItems: number
  /** Current page */
  currentPage: number
  /** Total pages */
  totalPages: number
  /** Items per page */
  itemsPerPage: number | 'unlimited'
  /** Go to specific page */
  goToPage: (page: number) => void
  /** Whether pagination is needed */
  needsPagination: boolean
  /** Set items per page */
  setItemsPerPage: (limit: number | 'unlimited') => void
  /** All filter controls */
  filters: Omit<UseCardFiltersResult<T>, 'filtered'>
  /** All sort controls */
  sorting: Omit<UseCardSortResult<T, S>, 'sorted'>
}

export function useCardData<T, S extends string = string>(
  items: T[],
  config: CardDataConfig<T, S>
): UseCardDataResult<T, S> {
  const { filter: filterConfig, sort: sortConfig, defaultLimit = 5 } = config
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(defaultLimit)
  const [currentPage, setCurrentPage] = useState(1)

  // Apply filters
  const filterResult = useCardFilters(items, filterConfig)
  const { filtered } = filterResult

  // Apply sorting
  const sortResult = useCardSort(filtered, sortConfig)
  const { sorted } = sortResult

  // Calculate pagination
  const effectivePerPage = itemsPerPage === 'unlimited' ? sorted.length : itemsPerPage
  const totalPages = Math.ceil(sorted.length / effectivePerPage) || 1
  const needsPagination = itemsPerPage !== 'unlimited' && sorted.length > effectivePerPage

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterResult.search, filterResult.localClusterFilter, sortResult.sortBy])

  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages))
    }
  }, [currentPage, totalPages])

  // Paginate
  const paginatedItems = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sorted
    const start = (currentPage - 1) * effectivePerPage
    return sorted.slice(start, start + effectivePerPage)
  }, [sorted, currentPage, effectivePerPage, itemsPerPage])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }, [totalPages])

  // Extract filter controls (without 'filtered')
  const { filtered: _filtered, ...filters } = filterResult
  // Extract sort controls (without 'sorted')
  const { sorted: _sorted, ...sorting } = sortResult

  return {
    items: paginatedItems,
    totalItems: sorted.length,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
  }
}

// ============================================================================
// Common comparators for reuse
// ============================================================================

// ============================================================================
// useCardCollapse - Manage card collapsed state with persistence
// ============================================================================

const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'

/**
 * Get all collapsed card IDs from localStorage
 */
function getCollapsedCards(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Save collapsed card IDs to localStorage
 */
function saveCollapsedCards(collapsed: Set<string>) {
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]))
}

export interface UseCardCollapseResult {
  /** Whether the card is collapsed */
  isCollapsed: boolean
  /** Toggle collapsed state */
  toggleCollapsed: () => void
  /** Set collapsed state explicitly */
  setCollapsed: (collapsed: boolean) => void
  /** Expand the card (shorthand for setCollapsed(false)) */
  expand: () => void
  /** Collapse the card (shorthand for setCollapsed(true)) */
  collapse: () => void
}

/**
 * Hook to manage card collapse state with localStorage persistence.
 * Each card remembers its collapsed state across page reloads.
 *
 * @param cardId - Unique identifier for the card
 * @param defaultCollapsed - Default collapsed state (defaults to false = expanded)
 */
export function useCardCollapse(
  cardId: string,
  defaultCollapsed: boolean = false
): UseCardCollapseResult {
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    const collapsed = getCollapsedCards()
    return collapsed.has(cardId) || defaultCollapsed
  })

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    const collapsedCards = getCollapsedCards()
    if (collapsed) {
      collapsedCards.add(cardId)
    } else {
      collapsedCards.delete(cardId)
    }
    saveCollapsedCards(collapsedCards)
  }, [cardId])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!isCollapsed)
  }, [isCollapsed, setCollapsed])

  const expand = useCallback(() => setCollapsed(false), [setCollapsed])
  const collapse = useCallback(() => setCollapsed(true), [setCollapsed])

  return {
    isCollapsed,
    toggleCollapsed,
    setCollapsed,
    expand,
    collapse,
  }
}

/**
 * Hook to manage collapse state for multiple cards at once.
 * Useful for "collapse all" / "expand all" functionality.
 */
export function useCardCollapseAll(cardIds: string[]) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => getCollapsedCards())

  const collapseAll = useCallback(() => {
    const newSet = new Set([...collapsedSet, ...cardIds])
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [cardIds, collapsedSet])

  const expandAll = useCallback(() => {
    const newSet = new Set([...collapsedSet].filter(id => !cardIds.includes(id)))
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [cardIds, collapsedSet])

  const isCardCollapsed = useCallback((cardId: string) => {
    return collapsedSet.has(cardId)
  }, [collapsedSet])

  const toggleCard = useCallback((cardId: string) => {
    const newSet = new Set(collapsedSet)
    if (newSet.has(cardId)) {
      newSet.delete(cardId)
    } else {
      newSet.add(cardId)
    }
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [collapsedSet])

  const allCollapsed = cardIds.every(id => collapsedSet.has(id))
  const allExpanded = cardIds.every(id => !collapsedSet.has(id))

  return {
    collapseAll,
    expandAll,
    isCardCollapsed,
    toggleCard,
    allCollapsed,
    allExpanded,
    collapsedCount: cardIds.filter(id => collapsedSet.has(id)).length,
  }
}

// ============================================================================
// Common comparators for reuse
// ============================================================================

export const commonComparators = {
  /** Compare strings alphabetically */
  string: <T>(field: keyof T) => (a: T, b: T) => {
    const aVal = String(a[field] || '')
    const bVal = String(b[field] || '')
    return aVal.localeCompare(bVal)
  },

  /** Compare numbers */
  number: <T>(field: keyof T) => (a: T, b: T) => {
    const aVal = Number(a[field]) || 0
    const bVal = Number(b[field]) || 0
    return aVal - bVal
  },

  /** Compare by status order (for priority sorting) */
  statusOrder: <T>(field: keyof T, order: Record<string, number>) => (a: T, b: T) => {
    const aStatus = String(a[field] || '')
    const bStatus = String(b[field] || '')
    return (order[aStatus] ?? 999) - (order[bStatus] ?? 999)
  },

  /** Compare dates (ISO strings or Date objects) */
  date: <T>(field: keyof T) => (a: T, b: T) => {
    const aDate = new Date(a[field] as string | Date).getTime()
    const bDate = new Date(b[field] as string | Date).getTime()
    return aDate - bDate
  },
}

// ============================================================================
// useCardFlash - Track significant data changes for card flash animation
// ============================================================================

export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

export interface UseCardFlashOptions {
  /** Threshold for considering a change "significant" (default: 0.1 = 10%) */
  threshold?: number
  /** Cooldown period in ms before allowing another flash (default: 5000) */
  cooldown?: number
  /** Flash type when value increases (default: 'info') */
  increaseType?: CardFlashType
  /** Flash type when value decreases (default: 'info') */
  decreaseType?: CardFlashType
}

export interface UseCardFlashResult {
  /** Current flash type to pass to CardWrapper */
  flashType: CardFlashType
  /** Reset the flash (call when animation ends) */
  resetFlash: () => void
}

/**
 * Hook to track significant numeric changes and trigger card flash animation.
 * Use this in card components to flash when important metrics change significantly.
 *
 * @param value - The numeric value to track
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { flashType } = useCardFlash(alertCount, {
 *   threshold: 0.2, // Flash if count changes by 20%
 *   increaseType: 'error', // Red flash when alerts increase
 *   decreaseType: 'info', // Purple flash when alerts decrease
 * })
 *
 * return (
 *   <CardWrapper flashType={flashType}>
 *     ...
 *   </CardWrapper>
 * )
 * ```
 */
export function useCardFlash(
  value: number,
  options: UseCardFlashOptions = {}
): UseCardFlashResult {
  const {
    threshold = 0.1,
    cooldown = 5000,
    increaseType = 'info',
    decreaseType = 'info',
  } = options

  const [flashType, setFlashType] = useState<CardFlashType>('none')
  const prevValueRef = useRef<number | null>(null)
  const lastFlashTimeRef = useRef<number>(0)

  useEffect(() => {
    // Skip first render (no previous value to compare)
    if (prevValueRef.current === null) {
      prevValueRef.current = value
      return
    }

    const prevValue = prevValueRef.current
    prevValueRef.current = value

    // Skip if value is zero or unchanged
    if (value === 0 || value === prevValue) return

    // Check cooldown
    const now = Date.now()
    if (now - lastFlashTimeRef.current < cooldown) return

    // Calculate percentage change
    const change = Math.abs(value - prevValue) / Math.max(prevValue, 1)

    // Check if change exceeds threshold
    if (change >= threshold) {
      const type = value > prevValue ? increaseType : decreaseType
      setFlashType(type)
      lastFlashTimeRef.current = now

      // Auto-reset after animation completes
      setTimeout(() => setFlashType('none'), 1100)
    }
  }, [value, threshold, cooldown, increaseType, decreaseType])

  const resetFlash = useCallback(() => {
    setFlashType('none')
  }, [])

  return { flashType, resetFlash }
}

// ============================================================================
// VARIANT 1: useCardDataSingleSelect - Single-select cluster dropdown pattern
// ============================================================================

const SINGLE_SELECT_STORAGE_PREFIX = 'kubestellar-single-select:'

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
    isAllClustersSelected,
  } = useGlobalFilters()
  const { clusters } = useClusters()

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

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return clusters.filter(c => c.reachable !== false)
  }, [clusters])

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
    setSearch,
  }
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
  /** Available clusters for filtering (respects global filter) */
  availableClusters: { name: string }[]
  /** Filtered cluster list based on global + local filters */
  filteredClusters: { name: string; reachable?: boolean; cpuCores?: number; memoryGB?: number; podCount?: number; nodeCount?: number }[]
  /** Whether cluster filter dropdown is showing */
  showClusterFilter: boolean
  /** Set cluster filter dropdown visibility */
  setShowClusterFilter: (show: boolean) => void
  /** Ref for cluster filter dropdown (for click outside handling) */
  clusterFilterRef: React.RefObject<HTMLDivElement>
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
  const { clusters } = useClusters()

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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return clusters.filter(c => c.reachable !== false)
  }, [clusters])

  // Available clusters for filtering (respects global filter)
  const availableClusters = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  // Filtered clusters based on global + local filters
  const filteredClusters = useMemo(() => {
    let result = reachableClusters
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }
    return result
  }, [reachableClusters, selectedClusters, isAllClustersSelected, localClusterFilter])

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
  }
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
  const { clusters: allClusters } = useClusters()

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
    resetSelection,
  }
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
    setStatusFilter,
  }
}
