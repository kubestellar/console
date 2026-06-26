import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useStablePageHeight } from './useStablePageHeight'
import {
  readPersistedItemsPerPage,
  useCardFilters,
  writePersistedItemsPerPage,
} from './cardFilters'
import type {
  CardDataConfig,
  SortConfig,
  SortDirection,
  UseCardFiltersResult,
} from './cardFilters'

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

  const sorted = useMemo(() => {
    const comparator = comparators?.[sortBy]
    if (!comparator) return [...(items || [])]

    return [...(items || [])].sort((a, b) => {
      const result = comparator(a, b)
      return sortDirection === 'asc' ? result : -result
    })
  }, [items, comparators, sortBy, sortDirection])

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
  containerRef: RefObject<HTMLDivElement | null>
  /** Style to apply to the paginated items container for stable height */
  containerStyle: CSSProperties | undefined
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
  // Uses functional setState to read the latest `currentPage` without including
  // it in the dep array — including it caused a feedback loop (#5762).
  // Previously the stale closure also meant a Next-click mid-refresh could
  // read a pre-click `currentPage` and clamp an in-flight page update back
  // down to `totalPages`, which looked like the page snapped back to 1 (#8381).
  // Functional setState + a totalPages ref (below) eliminate both stale reads.
  // `totalPages` is `Math.ceil(...) || 1`, so it is always >= 1 — no zero guard.
  useEffect(() => {
    setCurrentPage((prev) => (prev > totalPages ? totalPages : prev))
  }, [totalPages])

  // Paginate
  const paginatedItems = (() => {
    if (itemsPerPage === 'unlimited') return sorted
    const start = (currentPage - 1) * effectivePerPage
    return sorted.slice(start, start + effectivePerPage)
  })()

  // #8381: `goToPage` previously read `totalPages` from its render closure, so
  // a Next click dispatched while a background refresh was producing a new
  // `totalPages` could clamp against the *pre-render* value (e.g. 1) and
  // silently snap the user back to page 1. Reading from a ref guarantees
  // `goToPage` always clamps against the most recent totalPages. The ref is
  // synced in an effect (not during render) to satisfy React's
  // no-mutation-during-render rule.
  const totalPagesRef = useRef(totalPages)
  useEffect(() => {
    totalPagesRef.current = totalPages
  }, [totalPages])

  const goToPage = (page: number) => {
    const limit = totalPagesRef.current
    setCurrentPage(Math.max(1, Math.min(page, limit)))
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
