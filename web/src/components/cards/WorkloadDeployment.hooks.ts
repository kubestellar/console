import { useCallback, useEffect, useRef, useState } from 'react'

function loadPersistedClusters(storageKey: string): string[] {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function usePersistedClusterFilter(storageKey: string) {
  const [selectedClusters, setSelectedClusters] = useState<string[]>(() => loadPersistedClusters(storageKey))
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const persistClusters = useCallback((clusters: string[]) => {
    setSelectedClusters(clusters)

    try {
      if (clusters.length === 0) {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, JSON.stringify(clusters))
      }
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }, [storageKey])

  const toggleCluster = useCallback((cluster: string) => {
    persistClusters(
      selectedClusters.includes(cluster)
        ? selectedClusters.filter(selectedCluster => selectedCluster !== cluster)
        : [...selectedClusters, cluster],
    )
  }, [persistClusters, selectedClusters])

  const clearClusters = useCallback(() => {
    persistClusters([])
  }, [persistClusters])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return {
    selectedClusters,
    toggleCluster,
    clearClusters,
    isOpen,
    setIsOpen,
    containerRef,
  }
}
