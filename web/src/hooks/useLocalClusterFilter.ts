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
  /** Unique ID for persisting this filter to localStorage */
  storageKey?: string
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
  /** Active local filter clusters (ones that are also in available clusters) */
  activeLocalFilter: string[]
}

const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-local-filter:'

/**
 * Hook for managing local cluster filtering within a card.
 * Respects global cluster selection and allows further filtering within those bounds.
 *
 * Local filters are now persisted to localStorage and are NOT cleared when global filter changes.
 * This allows users to maintain their card-specific filters independently of global filters.
 */
export function useLocalClusterFilter<T extends Cluster = Cluster>(
  options: UseLocalClusterFilterOptions = {}
): UseLocalClusterFilterReturn<T> {
  const { excludeUnreachable = true, storageKey } = options
  const { clusters: rawClusters } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Initialize from localStorage if storageKey provided
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

  // Persist to localStorage when local filter changes
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

  // Available clusters for dropdown display (includes unreachable, respects global filter)
  const availableClusters = useMemo(() => {
    const all = rawClusters as unknown as T[]
    if (isAllClustersSelected) return all
    return all.filter(c => selectedClusters.includes(c.name))
  }, [rawClusters, selectedClusters, isAllClustersSelected])

  // Reachable clusters for data filtering
  const reachableClusters = useMemo(() => {
    if (!excludeUnreachable) return availableClusters
    return availableClusters.filter(c => (c as unknown as Cluster).reachable !== false)
  }, [availableClusters, excludeUnreachable])

  // Compute which local filter selections are still valid (exist in available clusters)
  const activeLocalFilter = useMemo(() => {
    if (localClusterFilter.length === 0) return []
    const availableNames = new Set(availableClusters.map(c => c.name))
    return localClusterFilter.filter(name => availableNames.has(name))
  }, [localClusterFilter, availableClusters])

  // Filter clusters based on global selection AND local filter (reachable only for data)
  const clusters = useMemo(() => {
    if (activeLocalFilter.length === 0) return reachableClusters
    return reachableClusters.filter(c => activeLocalFilter.includes(c.name))
  }, [reachableClusters, activeLocalFilter])

  const toggleClusterFilter = (clusterName: string) => {
    if (localClusterFilter.includes(clusterName)) {
      setLocalClusterFilter(localClusterFilter.filter(c => c !== clusterName))
    } else {
      setLocalClusterFilter([...localClusterFilter, clusterName])
    }
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
    activeLocalFilter,
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
