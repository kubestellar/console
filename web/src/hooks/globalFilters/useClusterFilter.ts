import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ClusterInfo } from '../mcp/types'
import { emitGlobalClusterFilterChanged } from '../../lib/analytics'
import {
  CLUSTER_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  NONE_SENTINEL,
} from './constants'
import type { ClusterGroup } from './types'
import {
  buildClusterInfoMap,
  loadStoredClusterGroups,
  loadStoredSelection,
} from './utils'

export interface UseClusterFilterReturn {
  rawSelectedClusters: string[]
  selectedClusters: string[]
  setSelectedClusters: (clusters: string[]) => void
  toggleCluster: (cluster: string) => void
  selectAllClusters: () => void
  deselectAllClusters: () => void
  isAllClustersSelected: boolean
  isClustersFiltered: boolean
  availableClusters: string[]
  clusterInfoMap: Record<string, ClusterInfo>
  effectiveSelectedClusters: string[]

  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: Omit<ClusterGroup, 'id'>) => void
  updateClusterGroup: (id: string, updates: Partial<ClusterGroup>) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (groupId: string) => void
}

export function useClusterFilter(deduplicatedClusters: ClusterInfo[]): UseClusterFilterReturn {
  const availableClusters = useMemo(
    () => deduplicatedClusters.map(c => c.name),
    [deduplicatedClusters]
  )
  const clusterInfoMap = useMemo(
    () => buildClusterInfoMap(deduplicatedClusters),
    [deduplicatedClusters]
  )

  const [selectedClusters, setSelectedClustersState] = useState<string[]>(
    () => loadStoredSelection(CLUSTER_STORAGE_KEY)
  )
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>(loadStoredClusterGroups)

  // Reconcile selected clusters against available clusters; drop stale entries
  useEffect(() => {
    if (selectedClusters.length === 0 || availableClusters.length === 0) return
    if (selectedClusters.includes(NONE_SENTINEL)) return
    const validSelections = selectedClusters.filter(c => availableClusters.includes(c))
    if (validSelections.length !== selectedClusters.length) {
      setSelectedClustersState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableClusters, selectedClusters])

  // Persist selections to localStorage
  useEffect(() => {
    localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(selectedClusters.length === 0 ? null : selectedClusters))
  }, [selectedClusters])

  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(clusterGroups))
  }, [clusterGroups])

  const setSelectedClusters = useCallback((clusters: string[]) => {
    setSelectedClustersState(clusters)
    emitGlobalClusterFilterChanged(clusters.length, availableClusters.length)
  }, [availableClusters.length])

  const toggleCluster = useCallback((cluster: string) => {
    setSelectedClustersState(prev => {
      if (prev.length === 0) {
        const next = availableClusters.filter(c => c !== cluster)
        emitGlobalClusterFilterChanged(next.length, availableClusters.length)
        return next
      }
      if (prev.includes(cluster)) {
        const newSelection = prev.filter(c => c !== cluster)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalClusterFilterChanged(result.length, availableClusters.length)
        return result
      } else {
        const newSelection = [...prev, cluster]
        if (newSelection.length === availableClusters.length) {
          emitGlobalClusterFilterChanged(0, availableClusters.length)
          return []
        }
        emitGlobalClusterFilterChanged(newSelection.length, availableClusters.length)
        return newSelection
      }
    })
  }, [availableClusters])

  const selectAllClusters = useCallback(() => setSelectedClustersState([]), [])
  const deselectAllClusters = useCallback(() => setSelectedClustersState([NONE_SENTINEL]), [])

  const isAllClustersSelected = selectedClusters.length === 0
  const isClustersFiltered = !isAllClustersSelected
  const effectiveSelectedClusters = isAllClustersSelected ? availableClusters : selectedClusters

  const addClusterGroup = useCallback((group: Omit<ClusterGroup, 'id'>) => {
    const id = `group-${Date.now()}`
    setClusterGroups(prev => [...prev, { ...group, id }])
  }, [])

  const updateClusterGroup = useCallback((id: string, updates: Partial<ClusterGroup>) => {
    setClusterGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])

  const deleteClusterGroup = useCallback((id: string) => {
    setClusterGroups(prev => prev.filter(g => g.id !== id))
  }, [])

  const selectClusterGroup = useCallback((groupId: string) => {
    const group = clusterGroups.find(g => g.id === groupId)
    if (group) setSelectedClustersState(group.clusters)
  }, [clusterGroups])

  return {
    // rawSelectedClusters is the underlying state ([] = all; [NONE_SENTINEL] = none; [...] = explicit)
    // Consumers that need to save/restore selections should use this.
    rawSelectedClusters: selectedClusters,
    selectedClusters: effectiveSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,
    effectiveSelectedClusters,
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
  }
}
