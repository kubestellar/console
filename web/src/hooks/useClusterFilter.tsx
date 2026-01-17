import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useClusters } from './useMCP'

interface ClusterFilterContextType {
  selectedClusters: string[]
  setSelectedClusters: (clusters: string[]) => void
  toggleCluster: (cluster: string) => void
  selectAll: () => void
  clearAll: () => void
  isAllSelected: boolean
  isFiltered: boolean
  availableClusters: string[]
}

const ClusterFilterContext = createContext<ClusterFilterContextType | null>(null)

const STORAGE_KEY = 'clusterFilter'

export function ClusterFilterProvider({ children }: { children: ReactNode }) {
  const { clusters } = useClusters()
  const availableClusters = clusters.map(c => c.name)

  // Initialize from localStorage or default to all clusters (empty array means all)
  const [selectedClusters, setSelectedClustersState] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore parse errors
    }
    return [] // Empty means all clusters
  })

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedClusters))
  }, [selectedClusters])

  const setSelectedClusters = useCallback((clusters: string[]) => {
    setSelectedClustersState(clusters)
  }, [])

  const toggleCluster = useCallback((cluster: string) => {
    setSelectedClustersState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        return availableClusters.filter(c => c !== cluster)
      }

      if (prev.includes(cluster)) {
        // Remove cluster
        const newSelection = prev.filter(c => c !== cluster)
        // If no clusters selected, revert to all
        return newSelection.length === 0 ? [] : newSelection
      } else {
        // Add cluster
        const newSelection = [...prev, cluster]
        // If all clusters are now selected, switch to "all" mode
        if (newSelection.length === availableClusters.length) {
          return []
        }
        return newSelection
      }
    })
  }, [availableClusters])

  const selectAll = useCallback(() => {
    setSelectedClustersState([])
  }, [])

  const clearAll = useCallback(() => {
    // Select just the first cluster if available
    if (availableClusters.length > 0) {
      setSelectedClustersState([availableClusters[0]])
    }
  }, [availableClusters])

  // Empty array means all clusters are selected
  const isAllSelected = selectedClusters.length === 0
  const isFiltered = !isAllSelected

  return (
    <ClusterFilterContext.Provider
      value={{
        selectedClusters: isAllSelected ? availableClusters : selectedClusters,
        setSelectedClusters,
        toggleCluster,
        selectAll,
        clearAll,
        isAllSelected,
        isFiltered,
        availableClusters,
      }}
    >
      {children}
    </ClusterFilterContext.Provider>
  )
}

export function useClusterFilter() {
  const context = useContext(ClusterFilterContext)
  if (!context) {
    throw new Error('useClusterFilter must be used within a ClusterFilterProvider')
  }
  return context
}
