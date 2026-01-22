import { useState, useMemo, useEffect, useRef } from 'react'
import { useClusters } from './useMCP'
import { useGlobalFilters } from './useGlobalFilters'

interface Cluster {
  name: string
  reachable?: boolean
  [key: string]: unknown
}

interface UseLocalClusterFilterOptions {
  /** Whether to exclude unreachable clusters (default: true) */
  excludeUnreachable?: boolean
  /** Whether to restore local filter when global filter is cleared (default: true) */
  restoreOnGlobalClear?: boolean
}

interface UseLocalClusterFilterReturn<T extends Cluster> {
  /** All clusters after applying global and local filters */
  clusters: T[]
  /** Clusters available for the local filter (respects global filter) */
  availableClusters: T[]
  /** Currently selected local cluster names */
  localClusterFilter: string[]
  /** Set the local cluster filter */
  setLocalClusterFilter: (clusters: string[]) => void
  /** Toggle a single cluster in the filter */
  toggleClusterFilter: (clusterName: string) => void
  /** Clear the local filter (show all) */
  clearLocalFilter: () => void
  /** Whether the dropdown is open */
  showClusterFilter: boolean
  /** Set dropdown visibility */
  setShowClusterFilter: (show: boolean) => void
  /** Ref for the filter dropdown container (for click-outside handling) */
  clusterFilterRef: React.RefObject<HTMLDivElement>
  /** Whether any local filter is applied */
  hasLocalFilter: boolean
  /** Whether the global filter is currently overriding local filter */
  isGlobalOverride: boolean
}

/**
 * Hook for managing local cluster filtering within a card.
 * Respects global cluster selection and allows further filtering within those bounds.
 *
 * When a global filter is applied, saves the local filter and clears it.
 * When the global filter is cleared, restores the previous local filter.
 */
export function useLocalClusterFilter<T extends Cluster = Cluster>(
  options: UseLocalClusterFilterOptions = {}
): UseLocalClusterFilterReturn<T> {
  const { excludeUnreachable = true, restoreOnGlobalClear = true } = options
  const { clusters: rawClusters } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Track previous local filter for restoration when global filter is cleared
  const previousLocalFilterRef = useRef<string[]>([])
  const wasGlobalFilterActiveRef = useRef(false)

  // Handle global filter changes - save/restore local filter
  useEffect(() => {
    if (!restoreOnGlobalClear) return

    const isGlobalFilterActive = !isAllClustersSelected

    if (isGlobalFilterActive && !wasGlobalFilterActiveRef.current) {
      // Global filter just became active - save current local filter
      previousLocalFilterRef.current = localClusterFilter
      // Clear local filter so global filter takes full effect
      if (localClusterFilter.length > 0) {
        setLocalClusterFilter([])
      }
    } else if (!isGlobalFilterActive && wasGlobalFilterActiveRef.current) {
      // Global filter just cleared - restore previous local filter
      if (previousLocalFilterRef.current.length > 0) {
        setLocalClusterFilter(previousLocalFilterRef.current)
        previousLocalFilterRef.current = []
      }
    }

    wasGlobalFilterActiveRef.current = isGlobalFilterActive
  }, [isAllClustersSelected, restoreOnGlobalClear, localClusterFilter])

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
    if (!excludeUnreachable) return rawClusters as unknown as T[]
    return rawClusters.filter(c => c.reachable !== false) as unknown as T[]
  }, [rawClusters, excludeUnreachable])

  // Get available clusters for local filter (respects global filter)
  const availableClusters = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  // Filter clusters based on global selection AND local filter
  const clusters = useMemo(() => {
    let filtered = availableClusters
    // Apply local cluster filter if any selected
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }
    return filtered
  }, [availableClusters, localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  const clearLocalFilter = () => {
    setLocalClusterFilter([])
  }

  return {
    clusters,
    availableClusters,
    localClusterFilter,
    setLocalClusterFilter,
    toggleClusterFilter,
    clearLocalFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    hasLocalFilter: localClusterFilter.length > 0,
    isGlobalOverride: !isAllClustersSelected && previousLocalFilterRef.current.length > 0,
  }
}

/**
 * Reusable ClusterFilterDropdown component props
 */
export interface ClusterFilterDropdownProps {
  availableClusters: Array<{ name: string }>
  localClusterFilter: string[]
  toggleClusterFilter: (name: string) => void
  clearLocalFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (show: boolean) => void
  clusterFilterRef: React.RefObject<HTMLDivElement>
}
