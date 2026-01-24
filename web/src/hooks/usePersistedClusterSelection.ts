import { useState, useEffect, useCallback, useMemo } from 'react'
import { useClusters } from './useMCP'
import { useGlobalFilters } from './useGlobalFilters'

const STORAGE_PREFIX = 'kubestellar-card-cluster:'

interface UsePersistedClusterSelectionOptions {
  /** Unique storage key for this card instance */
  storageKey: string
  /** Initial/default value from card config */
  defaultValue?: string
  /** Whether 'all' is a valid option (default: true) */
  allowAll?: boolean
}

interface UsePersistedClusterSelectionReturn {
  /** Currently selected cluster */
  selectedCluster: string
  /** Set the selected cluster (persisted to localStorage) */
  setSelectedCluster: (cluster: string) => void
  /** Clusters available for selection (respects global filter) */
  availableClusters: Array<{ name: string }>
  /** Whether the current selection is outside the global filter */
  isOutsideGlobalFilter: boolean
  /** Reset selection to default/all */
  resetSelection: () => void
}

/**
 * Hook for persisting single cluster selection in cards.
 *
 * Key behaviors:
 * - Persists selection to localStorage
 * - Does NOT auto-reset when global filter changes
 * - Tracks if selection is outside current global filter
 * - Card can show indicator when selection doesn't match global filter
 */
export function usePersistedClusterSelection(
  options: UsePersistedClusterSelectionOptions
): UsePersistedClusterSelectionReturn {
  const { storageKey, defaultValue = '', allowAll = true } = options
  const { clusters: rawClusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Load initial value from localStorage or use default
  const [selectedCluster, setSelectedClusterState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
      if (stored !== null) return stored
    } catch {
      // Ignore localStorage errors
    }
    return defaultValue
  })

  // Persist to localStorage when selection changes
  const setSelectedCluster = useCallback((cluster: string) => {
    setSelectedClusterState(cluster)
    try {
      if (cluster === '' || (allowAll && cluster === 'all')) {
        localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`)
      } else {
        localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, cluster)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [storageKey, allowAll])

  // Get available clusters (respects global filter, only reachable)
  const availableClusters = useMemo(() => {
    const reachable = rawClusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => globalSelectedClusters.includes(c.name))
  }, [rawClusters, globalSelectedClusters, isAllClustersSelected])

  // Check if current selection is outside the global filter
  const isOutsideGlobalFilter = useMemo(() => {
    // 'all' or empty is never outside
    if (selectedCluster === 'all' || selectedCluster === '') return false
    // If global is 'all', nothing is outside
    if (isAllClustersSelected) return false
    // Check if selected cluster is in global selection
    return !globalSelectedClusters.includes(selectedCluster)
  }, [selectedCluster, globalSelectedClusters, isAllClustersSelected])

  // Reset selection to default
  const resetSelection = useCallback(() => {
    setSelectedCluster(allowAll ? 'all' : '')
  }, [setSelectedCluster, allowAll])

  // Auto-select first available cluster if current selection is invalid and not persisted
  // Only do this on initial mount, not on global filter changes
  useEffect(() => {
    const hasStoredValue = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`) !== null
    if (!hasStoredValue && selectedCluster === '' && availableClusters.length > 0 && !allowAll) {
      setSelectedCluster(availableClusters[0].name)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    selectedCluster,
    setSelectedCluster,
    availableClusters,
    isOutsideGlobalFilter,
    resetSelection,
  }
}
