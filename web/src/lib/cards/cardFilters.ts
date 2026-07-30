import { useState, useMemo, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/mcp/clusters'
import type { ClusterErrorType } from '../errorClassifier'

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
  clusterFilterRef: RefObject<HTMLDivElement | null>
  /** Ref for cluster filter button (portal positioning) */
  clusterFilterBtnRef: RefObject<HTMLButtonElement | null>
  /** Computed fixed position for portaled cluster dropdown */
  dropdownStyle: { top: number; left: number } | null
}

export const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

/**
 * localStorage prefix for the per-card "show N items" dropdown selection.
 * Persisting this fixes #6070 — without it, the user picks "show 5" but on
 * remount the value resets to whatever `defaultLimit` the card passed in,
 * which (combined with cards that ignore their config prop entirely) made
 * cards render with way more rows than the user asked for.
 */
export const LOCAL_LIMIT_STORAGE_PREFIX = 'kubestellar-card-limit:'
export const SINGLE_SELECT_STORAGE_PREFIX = 'kubestellar-single-select:'

/** Read a persisted itemsPerPage value for a card. Returns null if missing,
 * unparseable, or no storageKey provided. Accepts the literal string
 * 'unlimited' as a valid value. */
export function readPersistedItemsPerPage(
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
export function writePersistedItemsPerPage(
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
