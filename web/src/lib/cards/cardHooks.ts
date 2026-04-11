import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/mcp/clusters'
import { FLASH_ANIMATION_MS } from '../constants/network'
import type { ClusterErrorType } from '../errorClassifier'
import { useStablePageHeight } from './useStablePageHeight'

// ============================================================================
// Cluster with health info for filter dropdowns
// ============================================================================

export interface ClusterWithHealth {
  name: string
  healthy?: boolean
  reachable?: boolean
  nodeCount?: number
  errorType?: ClusterErrorType
}

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
  /** Available clusters for filtering (respects global filter, includes health info) */
  availableClusters: ClusterWithHealth[]
  /** Whether cluster filter dropdown is showing */
  showClusterFilter: boolean
  /** Set cluster filter dropdown visibility */
  setShowClusterFilter: (show: boolean) => void
  /** Ref for cluster filter dropdown (for click outside handling) */
  clusterFilterRef: React.RefObject<HTMLDivElement | null>
  /** Ref for cluster filter button (portal positioning) */
  clusterFilterBtnRef: React.RefObject<HTMLButtonElement | null>
  /** Computed fixed position for portaled cluster dropdown */
  dropdownStyle: { top: number; left: number } | null
}

const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

/**
 * localStorage prefix for the per-card "show N items" dropdown selection.
 * Persisting this fixes #6070 — without it, the user picks "show 5" but on
 * remount the value resets to whatever `defaultLimit` the card passed in,
 * which (combined with cards that ignore their config prop entirely) made
 * cards render with way more rows than the user asked for.
 */
const LOCAL_LIMIT_STORAGE_PREFIX = 'kubestellar-card-limit:'

/** Read a persisted itemsPerPage value for a card. Returns null if missing,
 * unparseable, or no storageKey provided. Accepts the literal string
 * 'unlimited' as a valid value. */
function readPersistedItemsPerPage(
  storageKey: string | undefined,
): number | 'unlimited' | null {
  if (!storageKey) return null
  try {
    const raw = localStorage.getItem(`${LOCAL_LIMIT_STORAGE_PREFIX}${storageKey}`)
    if (raw == null) return null
    if (raw === 'unlimited') return 'unlimited'
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Persist an itemsPerPage value. No-op when storageKey is missing or
 * localStorage throws (private mode, quota, SSR). */
function writePersistedItemsPerPage(
  storageKey: string | undefined,
  value: number | 'unlimited',
): void {
  if (!storageKey) return
  try {
    localStorage.setItem(`${LOCAL_LIMIT_STORAGE_PREFIX}${storageKey}`, String(value))
  } catch {
    // Ignore — non-fatal.
  }
}

export function useCardFilters<T>(
  items: T[],
  config: FilterConfig<T>
): UseCardFiltersResult<T> {
  // Guard against undefined config — dynamic/custom cards may pass undefined at runtime
  const safeConfig = config ?? ({} as FilterConfig<T>)
  const { searchFields, clusterField, statusField, customPredicate, storageKey } = safeConfig
  const {
    filterByCluster,
    filterByStatus,
    customFilter: globalCustomFilter,
    selectedClusters,
    isAllClustersSelected } = useGlobalFilters()
  const { deduplicatedClusters } = useClusters()

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

  // Wrapper to persist to localStorage
  const setLocalClusterFilter = (clusters: string[]) => {
    setLocalClusterFilterState(clusters)
    if (storageKey) {
      if (clusters.length === 0) {
        localStorage.removeItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}`)
      } else {
        localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}${storageKey}`, JSON.stringify(clusters))
      }
    }
  }

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

  // Available clusters for local filter dropdown (includes unreachable for display)
  const availableClusters = (() => {
    if (isAllClustersSelected) return deduplicatedClusters
    return deduplicatedClusters.filter(c => selectedClusters.includes(c.name))
  })()

  const toggleClusterFilter = (clusterName: string) => {
    if (localClusterFilter.includes(clusterName)) {
      setLocalClusterFilter(localClusterFilter.filter(c => c !== clusterName))
    } else {
      setLocalClusterFilter([...localClusterFilter, clusterName])
    }
  }

  const clearClusterFilter = () => {
    setLocalClusterFilter([])
  }

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
        for (const field of (searchFields || [])) {
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
        for (const field of (searchFields || [])) {
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
    clusterFilterBtnRef,
    dropdownStyle }
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
  // Guard against undefined config — dynamic/custom cards may pass undefined at runtime
  const safeConfig = config ?? ({} as SortConfig<T, S>)
  const { defaultField, defaultDirection, comparators } = safeConfig
  const [sortBy, setSortBy] = useState<S>(defaultField)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection ?? 'asc')

  const toggleSortDirection = () => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sorted = (() => {
    const comparator = comparators?.[sortBy]
    if (!comparator) return items

    const sortedItems = [...items].sort((a, b) => {
      const result = comparator(a, b)
      return sortDirection === 'asc' ? result : -result
    })

    return sortedItems
  })()

  return {
    sorted,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    toggleSortDirection }
}

// ============================================================================
// useCardData - Combined filter + sort + pagination
// ============================================================================

export interface UseCardDataResult<T, S extends string> {
  /** Final processed items (filtered, sorted, paginated) */
  items: T[]
  /** All items after filtering and sorting, before pagination */
  allFilteredItems: T[]
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
  /** Ref for the paginated items container (attach to keep height stable across pages) */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Style to apply to the paginated items container for stable height */
  containerStyle: React.CSSProperties | undefined
}

/**
 * Canonical card data hook. Consolidates filtering, sorting, and pagination
 * for list-based cards.
 *
 * **Canonical destructuring pattern** (used by ~41 cards — please match this
 * for new cards so controls render consistently, see issue #6121):
 *
 * ```tsx
 * const {
 *   paginatedItems,
 *   currentPage,
 *   totalPages,
 *   itemsPerPage,
 *   goToPage,
 *   setItemsPerPage,
 *   needsPagination,
 *   filters,
 *   sorting,
 *   containerRef,
 *   containerStyle,
 * } = useCardData(items, {
 *   filter: { searchFields: ['name'] },
 *   sort: { defaultKey: 'name', comparators: { name: commonComparators.string(x => x.name) } },
 *   defaultLimit: 5,
 * })
 * ```
 *
 * Prefer this shape over ad-hoc destructuring; the order above matches
 * `<CardControlsRow>` + `<CardPaginationFooter>` prop layouts.
 */
export function useCardData<T, S extends string = string>(
  items: T[],
  config: CardDataConfig<T, S>
): UseCardDataResult<T, S> {
  // Guard against undefined config — dynamic/custom cards may pass undefined at runtime
  const safeConfig = config ?? ({} as CardDataConfig<T, S>)
  const { filter: filterConfig, sort: sortConfig, defaultLimit = 5 } = safeConfig
  // Persist the "show N" dropdown selection per card so it survives remounts
  // (#6070). The storageKey is the same identifier used by the cluster filter
  // persistence above, so each card type gets its own slot.
  const limitStorageKey = filterConfig?.storageKey
  const [itemsPerPage, setItemsPerPageState] = useState<number | 'unlimited'>(
    () => readPersistedItemsPerPage(limitStorageKey) ?? defaultLimit,
  )
  const setItemsPerPage = useCallback(
    (limit: number | 'unlimited') => {
      setItemsPerPageState(limit)
      writePersistedItemsPerPage(limitStorageKey, limit)
    },
    [limitStorageKey],
  )
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

  // Reset page when filter inputs change (but not on data updates or sort changes).
  // Previously included `filtered` in deps, which caused page resets on progressive
  // data loading (e.g., per-cluster OPA checks updating statuses) (#5664).
  useEffect(() => {
    setCurrentPage(1)
  }, [filterResult.search, filterResult.localClusterFilter])

  // Ensure current page is valid when total pages shrinks (e.g., data errors).
  // Only depend on totalPages — including currentPage causes an infinite loop
  // when totalPages=0 because Math.max(1,0)=1 and 1>0 is always true (#5762).
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Paginate
  const paginatedItems = (() => {
    if (itemsPerPage === 'unlimited') return sorted
    const start = (currentPage - 1) * effectivePerPage
    return sorted.slice(start, start + effectivePerPage)
  })()

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  // Stable height for paginated container
  const { containerRef, containerStyle } = useStablePageHeight(effectivePerPage, sorted.length)

  // Extract filter controls (without 'filtered')
  const { filtered: _filtered, ...filters } = filterResult
  // Extract sort controls (without 'sorted')
  const { sorted: _sorted, ...sorting } = sortResult

  return {
    items: paginatedItems,
    /** All items after filtering and sorting, before pagination */
    allFilteredItems: sorted,
    totalItems: sorted.length,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
    containerRef,
    containerStyle }
}

// ============================================================================
// Common comparators for reuse
// ============================================================================

// ============================================================================
// useCardCollapse - Manage card collapsed state with persistence
// ============================================================================

const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'

/**
 * Module-level subscriber set so multiple `useCardCollapse` instances for the
 * same `cardId` stay in sync when one of them toggles. Without this, calling
 * the hook from both `SortableCard` (for grid layout) and `CardWrapper`
 * (for the actual collapse UI) would leave them out of sync — collapsing the
 * card via the chevron button would not update the grid row span (#6072).
 */
const collapseSubscribers = new Set<() => void>()

function subscribeToCollapseChanges(listener: () => void): () => void {
  collapseSubscribers.add(listener)
  return () => { collapseSubscribers.delete(listener) }
}

function notifyCollapseSubscribers() {
  collapseSubscribers.forEach((listener) => listener())
}

/**
 * Get all collapsed card IDs from localStorage
 */
function getCollapsedCards(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Save collapsed card IDs to localStorage and notify all hook subscribers so
 * that components reading the same card's collapse state stay in sync.
 */
function saveCollapsedCards(collapsed: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]))
  } catch {
    // Silently ignore quota errors or private browsing restrictions
  }
  notifyCollapseSubscribers()
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

  // Subscribe to module-level collapse changes so multiple hook instances
  // for the same cardId stay in sync (#6072 — grid row span needs to react
  // when the chevron button inside CardWrapper toggles collapse). Only the
  // persisted localStorage value drives this sync — `defaultCollapsed` is
  // intentionally not consulted here so that an explicit user expand/collapse
  // is never overwritten by the seed default after the first toggle.
  useEffect(() => {
    const sync = () => {
      const collapsed = getCollapsedCards()
      const next = collapsed.has(cardId)
      setIsCollapsedState((prev) => (prev === next ? prev : next))
    }
    return subscribeToCollapseChanges(sync)
  }, [cardId])

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    const collapsedCards = getCollapsedCards()
    if (collapsed) {
      collapsedCards.add(cardId)
    } else {
      collapsedCards.delete(cardId)
    }
    saveCollapsedCards(collapsedCards)
  }

  const toggleCollapsed = () => {
    setCollapsed(!isCollapsed)
  }

  const expand = () => setCollapsed(false)
  const collapse = () => setCollapsed(true)

  return {
    isCollapsed,
    toggleCollapsed,
    setCollapsed,
    expand,
    collapse }
}

/**
 * Hook to manage collapse state for multiple cards at once.
 * Useful for "collapse all" / "expand all" functionality.
 */
export function useCardCollapseAll(cardIds: string[]) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => getCollapsedCards())

  const collapseAll = () => {
    const newSet = new Set([...collapsedSet, ...cardIds])
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const expandAll = () => {
    const newSet = new Set([...collapsedSet].filter(id => !cardIds.includes(id)))
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const isCardCollapsed = (cardId: string) => {
    return collapsedSet.has(cardId)
  }

  const toggleCard = (cardId: string) => {
    const newSet = new Set(collapsedSet)
    if (newSet.has(cardId)) {
      newSet.delete(cardId)
    } else {
      newSet.add(cardId)
    }
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const allCollapsed = cardIds.every(id => collapsedSet.has(id))
  const allExpanded = cardIds.every(id => !collapsedSet.has(id))

  return {
    collapseAll,
    expandAll,
    isCardCollapsed,
    toggleCard,
    allCollapsed,
    allExpanded,
    collapsedCount: cardIds.filter(id => collapsedSet.has(id)).length }
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

  /** Compare dates (ISO strings or Date objects).
   * Invalid dates (NaN) are sorted to the END of the list in ascending order
   * so valid, chronological data stays front-loaded. We use
   * Number.MAX_SAFE_INTEGER as the sentinel rather than 0 so that legitimate
   * epoch-zero timestamps still sort before invalid values. */
  date: <T>(field: keyof T) => (a: T, b: T) => {
    const INVALID_DATE_SENTINEL = Number.MAX_SAFE_INTEGER
    const aRaw = new Date(a[field] as string | Date).getTime()
    const bRaw = new Date(b[field] as string | Date).getTime()
    const aDate = Number.isNaN(aRaw) ? INVALID_DATE_SENTINEL : aRaw
    const bDate = Number.isNaN(bRaw) ? INVALID_DATE_SENTINEL : bRaw
    return aDate - bDate
  } }

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
    decreaseType = 'info' } = options

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
      setTimeout(() => setFlashType('none'), FLASH_ANIMATION_MS)
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
  clusterFilterRef: React.RefObject<HTMLDivElement | null>
  /** Ref for cluster filter button (portal positioning) */
  clusterFilterBtnRef: React.RefObject<HTMLButtonElement | null>
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
