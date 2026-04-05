import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
// Import directly from mcp/clusters to avoid pulling in the full MCP barrel
// (~254 KB). Only clusters.ts + shared.ts are needed here.
import { useClusters } from './mcp/clusters'
import type { ClusterInfo } from './mcp/types'
import { emitGlobalClusterFilterChanged, emitGlobalSeverityFilterChanged, emitGlobalStatusFilterChanged } from '../lib/analytics'

// Severity levels
export type SeverityLevel = 'critical' | 'warning' | 'high' | 'medium' | 'low' | 'info'

export const SEVERITY_LEVELS: SeverityLevel[] = ['critical', 'warning', 'high', 'medium', 'low', 'info']

export const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-500', bgColor: 'bg-red-500/20' },
  warning: { label: 'Warning', color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
  high: { label: 'High', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  medium: { label: 'Medium', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  low: { label: 'Low', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  info: { label: 'Info', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
}

// Status levels
export type StatusLevel = 'pending' | 'failed' | 'running' | 'init' | 'bound'

export const STATUS_LEVELS: StatusLevel[] = ['pending', 'failed', 'running', 'init', 'bound']

export const STATUS_CONFIG: Record<StatusLevel, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  running: { label: 'Running', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  init: { label: 'Init', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  bound: { label: 'Bound', color: 'text-green-400', bgColor: 'bg-green-500/10' },
}

// Cluster group definition (used by Clusters page ClusterGroupsSection)
export interface ClusterGroup {
  id: string
  name: string
  clusters: string[]
  color?: string
  // For label-based groups
  labelSelector?: Record<string, string>
}

/** A saved filter set — snapshots ALL active filter state for quick recall */
export interface SavedFilterSet {
  id: string
  name: string
  color: string
  clusters: string[]      // empty = all clusters
  severities: string[]    // empty = all severities
  statuses: string[]      // empty = all statuses
  customText: string
}

interface GlobalFiltersContextType {
  // Cluster filtering
  selectedClusters: string[]
  setSelectedClusters: (clusters: string[]) => void
  toggleCluster: (cluster: string) => void
  selectAllClusters: () => void
  deselectAllClusters: () => void
  isAllClustersSelected: boolean
  isClustersFiltered: boolean
  availableClusters: string[]
  clusterInfoMap: Record<string, ClusterInfo> // Map of cluster name to info for status display

  // Cluster groups
  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: Omit<ClusterGroup, 'id'>) => void
  updateClusterGroup: (id: string, group: Partial<ClusterGroup>) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (groupId: string) => void

  // Severity filtering
  selectedSeverities: SeverityLevel[]
  setSelectedSeverities: (severities: SeverityLevel[]) => void
  toggleSeverity: (severity: SeverityLevel) => void
  selectAllSeverities: () => void
  deselectAllSeverities: () => void
  isAllSeveritiesSelected: boolean
  isSeveritiesFiltered: boolean

  // Status filtering
  selectedStatuses: StatusLevel[]
  setSelectedStatuses: (statuses: StatusLevel[]) => void
  toggleStatus: (status: StatusLevel) => void
  selectAllStatuses: () => void
  deselectAllStatuses: () => void
  isAllStatusesSelected: boolean
  isStatusesFiltered: boolean

  // Custom text filter
  customFilter: string
  setCustomFilter: (filter: string) => void
  clearCustomFilter: () => void
  hasCustomFilter: boolean

  // Combined filter helpers
  isFiltered: boolean
  clearAllFilters: () => void

  // Saved filter sets
  savedFilterSets: SavedFilterSet[]
  saveCurrentFilters: (name: string, color: string) => void
  applySavedFilterSet: (id: string) => void
  deleteSavedFilterSet: (id: string) => void
  activeFilterSetId: string | null

  // Filter functions for cards to use
  filterByCluster: <T extends { cluster?: string }>(items: T[]) => T[]
  filterBySeverity: <T extends { severity?: string }>(items: T[]) => T[]
  filterByStatus: <T extends { status?: string }>(items: T[]) => T[]
  filterByCustomText: <T extends Record<string, unknown>>(items: T[], searchFields?: string[]) => T[]
  filterItems: <T extends { cluster?: string; severity?: string; status?: string } & Record<string, unknown>>(items: T[]) => T[]
}

const GlobalFiltersContext = createContext<GlobalFiltersContextType | null>(null)

const CLUSTER_STORAGE_KEY = 'globalFilter:clusters'
const SEVERITY_STORAGE_KEY = 'globalFilter:severities'
const STATUS_STORAGE_KEY = 'globalFilter:statuses'
const CUSTOM_FILTER_STORAGE_KEY = 'globalFilter:customText'
const GROUPS_STORAGE_KEY = 'globalFilter:clusterGroups'
const SAVED_FILTER_SETS_KEY = 'globalFilter:savedFilterSets'

// Default cluster groups
const DEFAULT_GROUPS: ClusterGroup[] = []

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const { deduplicatedClusters } = useClusters()
  const availableClusters = useMemo(() => deduplicatedClusters.map(c => c.name), [deduplicatedClusters])
  const clusterInfoMap = useMemo(() => {
    const map: Record<string, ClusterInfo> = {}
    deduplicatedClusters.forEach(c => { map[c.name] = c })
    return map
  }, [deduplicatedClusters])

  // Initialize clusters from localStorage or default to all
  const [selectedClusters, setSelectedClustersState] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CLUSTER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // null means all clusters
        return parsed === null ? [] : parsed
      }
    } catch {
      // Ignore parse errors
    }
    return [] // Empty means all clusters
  })

  // Initialize severities from localStorage or default to all
  const [selectedSeverities, setSelectedSeveritiesState] = useState<SeverityLevel[]>(() => {
    try {
      const stored = localStorage.getItem(SEVERITY_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed === null ? [] : parsed
      }
    } catch {
      // Ignore parse errors
    }
    return [] // Empty means all severities
  })

  // Initialize cluster groups from localStorage (+ migrate legacy projects)
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>(() => {
    let groups: ClusterGroup[] = DEFAULT_GROUPS
    try {
      const stored = localStorage.getItem(GROUPS_STORAGE_KEY)
      if (stored) {
        groups = JSON.parse(stored)
      }
    } catch {
      // Ignore parse errors
    }

    // One-time migration: convert legacy projects → cluster groups
    try {
      const oldProjects = localStorage.getItem('projects:definitions')
      if (oldProjects) {
        const projects = JSON.parse(oldProjects) as Array<{
          id: string; name: string; clusters: string[]; color?: string
        }>
        if (Array.isArray(projects) && projects.length > 0) {
          const existingNames = new Set(groups.map(g => g.name))
          for (const p of projects) {
            if (!existingNames.has(p.name)) {
              groups.push({
                id: `migrated-${p.id}`,
                name: p.name,
                clusters: p.clusters || [],
                color: p.color,
              })
            }
          }
          localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups))
        }
        localStorage.removeItem('projects:definitions')
        localStorage.removeItem('projects:selected')
      }
    } catch {
      // Migration failed — not critical
    }

    return groups
  })

  // Initialize statuses from localStorage or default to all
  const [selectedStatuses, setSelectedStatusesState] = useState<StatusLevel[]>(() => {
    try {
      const stored = localStorage.getItem(STATUS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed === null ? [] : parsed
      }
    } catch {
      // Ignore parse errors
    }
    return [] // Empty means all statuses
  })

  // Initialize custom text filter from localStorage
  const [customFilter, setCustomFilterState] = useState<string>(() => {
    try {
      return localStorage.getItem(CUSTOM_FILTER_STORAGE_KEY) || ''
    } catch {
      // Ignore errors
    }
    return ''
  })

  // Initialize saved filter sets from localStorage
  const [savedFilterSets, setSavedFilterSets] = useState<SavedFilterSet[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_FILTER_SETS_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return []
  })

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(selectedClusters.length === 0 ? null : selectedClusters))
  }, [selectedClusters])

  useEffect(() => {
    localStorage.setItem(SEVERITY_STORAGE_KEY, JSON.stringify(selectedSeverities.length === 0 ? null : selectedSeverities))
  }, [selectedSeverities])

  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(clusterGroups))
  }, [clusterGroups])

  useEffect(() => {
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(selectedStatuses.length === 0 ? null : selectedStatuses))
  }, [selectedStatuses])

  useEffect(() => {
    localStorage.setItem(CUSTOM_FILTER_STORAGE_KEY, customFilter)
  }, [customFilter])

  useEffect(() => {
    localStorage.setItem(SAVED_FILTER_SETS_KEY, JSON.stringify(savedFilterSets))
  }, [savedFilterSets])

  // Cluster filtering
  const setSelectedClusters = useCallback((clusters: string[]) => {
    setSelectedClustersState(clusters)
    emitGlobalClusterFilterChanged(clusters.length, availableClusters.length)
  }, [availableClusters.length])

  const toggleCluster = useCallback((cluster: string) => {
    setSelectedClustersState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = availableClusters.filter(c => c !== cluster)
        emitGlobalClusterFilterChanged(next.length, availableClusters.length)
        return next
      }

      if (prev.includes(cluster)) {
        // Remove cluster - if last one, revert to all
        const newSelection = prev.filter(c => c !== cluster)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalClusterFilterChanged(result.length, availableClusters.length)
        return result
      } else {
        // Add cluster
        const newSelection = [...prev, cluster]
        // If all clusters are now selected, switch to "all" mode
        if (newSelection.length === availableClusters.length) {
          emitGlobalClusterFilterChanged(0, availableClusters.length)
          return []
        }
        emitGlobalClusterFilterChanged(newSelection.length, availableClusters.length)
        return newSelection
      }
    })
  }, [availableClusters])

  const selectAllClusters = useCallback(() => {
    setSelectedClustersState([])
  }, [])

  const deselectAllClusters = useCallback(() => {
    // Select none (but we need at least one, so this actually clears to show nothing)
    setSelectedClustersState(['__none__'])
  }, [])

  const isAllClustersSelected = selectedClusters.length === 0
  const isClustersFiltered = !isAllClustersSelected

  // Get effective selected clusters (for filtering)
  const effectiveSelectedClusters = isAllClustersSelected ? availableClusters : selectedClusters

  // Cluster groups
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
    if (group) {
      setSelectedClustersState(group.clusters)
    }
  }, [clusterGroups])

  // Severity filtering
  const setSelectedSeverities = useCallback((severities: SeverityLevel[]) => {
    setSelectedSeveritiesState(severities)
    emitGlobalSeverityFilterChanged(severities.length)
  }, [])

  const toggleSeverity = useCallback((severity: SeverityLevel) => {
    setSelectedSeveritiesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = SEVERITY_LEVELS.filter(s => s !== severity)
        emitGlobalSeverityFilterChanged(next.length)
        return next
      }

      if (prev.includes(severity)) {
        // Remove severity - if last one, revert to all
        const newSelection = prev.filter(s => s !== severity)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalSeverityFilterChanged(result.length)
        return result
      } else {
        // Add severity
        const newSelection = [...prev, severity]
        // If all severities are now selected, switch to "all" mode
        if (newSelection.length === SEVERITY_LEVELS.length) {
          emitGlobalSeverityFilterChanged(0)
          return []
        }
        emitGlobalSeverityFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllSeverities = useCallback(() => {
    setSelectedSeveritiesState([])
  }, [])

  const deselectAllSeverities = useCallback(() => {
    setSelectedSeveritiesState(['__none__' as SeverityLevel])
  }, [])

  const isAllSeveritiesSelected = selectedSeverities.length === 0
  const isSeveritiesFiltered = !isAllSeveritiesSelected

  // Get effective selected severities (for filtering)
  const effectiveSelectedSeverities = isAllSeveritiesSelected ? SEVERITY_LEVELS : selectedSeverities

  // Status filtering
  const setSelectedStatuses = useCallback((statuses: StatusLevel[]) => {
    setSelectedStatusesState(statuses)
    emitGlobalStatusFilterChanged(statuses.length)
  }, [])

  const toggleStatus = useCallback((status: StatusLevel) => {
    setSelectedStatusesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = STATUS_LEVELS.filter(s => s !== status)
        emitGlobalStatusFilterChanged(next.length)
        return next
      }

      if (prev.includes(status)) {
        // Remove status - if last one, revert to all
        const newSelection = prev.filter(s => s !== status)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalStatusFilterChanged(result.length)
        return result
      } else {
        // Add status
        const newSelection = [...prev, status]
        // If all statuses are now selected, switch to "all" mode
        if (newSelection.length === STATUS_LEVELS.length) {
          emitGlobalStatusFilterChanged(0)
          return []
        }
        emitGlobalStatusFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllStatuses = useCallback(() => {
    setSelectedStatusesState([])
  }, [])

  const deselectAllStatuses = useCallback(() => {
    setSelectedStatusesState(['__none__' as StatusLevel])
  }, [])

  const isAllStatusesSelected = selectedStatuses.length === 0
  const isStatusesFiltered = !isAllStatusesSelected

  // Get effective selected statuses (for filtering)
  const effectiveSelectedStatuses = isAllStatusesSelected ? STATUS_LEVELS : selectedStatuses

  // Custom text filter
  const setCustomFilter = useCallback((filter: string) => {
    setCustomFilterState(filter)
  }, [])

  const clearCustomFilter = useCallback(() => {
    setCustomFilterState('')
  }, [])

  const hasCustomFilter = customFilter.trim().length > 0

  // Combined filter state
  const isFiltered = isClustersFiltered || isSeveritiesFiltered || isStatusesFiltered || hasCustomFilter

  const clearAllFilters = useCallback(() => {
    setSelectedClustersState([])
    setSelectedSeveritiesState([])
    setSelectedStatusesState([])
    setCustomFilterState('')
  }, [])

  // Saved filter sets
  const saveCurrentFilters = useCallback((name: string, color: string) => {
    const id = `filterset-${Date.now()}`
    const newSet: SavedFilterSet = {
      id,
      name,
      color,
      clusters: [...selectedClusters],
      severities: [...selectedSeverities],
      statuses: [...selectedStatuses],
      customText: customFilter,
    }
    setSavedFilterSets(prev => [...prev, newSet])
  }, [selectedClusters, selectedSeverities, selectedStatuses, customFilter])

  const applySavedFilterSet = useCallback((id: string) => {
    const filterSet = savedFilterSets.find(fs => fs.id === id)
    if (!filterSet) return
    setSelectedClustersState(filterSet.clusters)
    setSelectedSeveritiesState(filterSet.severities as SeverityLevel[])
    setSelectedStatusesState(filterSet.statuses as StatusLevel[])
    setCustomFilterState(filterSet.customText)
  }, [savedFilterSets])

  const deleteSavedFilterSet = useCallback((id: string) => {
    setSavedFilterSets(prev => prev.filter(fs => fs.id !== id))
  }, [])

  // Detect which saved filter set matches the current state
  const activeFilterSetId = useMemo(() => {
    for (const fs of savedFilterSets) {
      const clustersMatch = JSON.stringify([...fs.clusters].sort()) === JSON.stringify([...selectedClusters].sort())
      const severitiesMatch = JSON.stringify([...fs.severities].sort()) === JSON.stringify([...selectedSeverities].sort())
      const statusesMatch = JSON.stringify([...fs.statuses].sort()) === JSON.stringify([...selectedStatuses].sort())
      const textMatch = fs.customText === customFilter
      if (clustersMatch && severitiesMatch && statusesMatch && textMatch) return fs.id
    }
    return null
  }, [savedFilterSets, selectedClusters, selectedSeverities, selectedStatuses, customFilter])

  // Filter functions for cards to use
  const filterByCluster = useCallback(<T extends { cluster?: string }>(items: T[]): T[] => {
    if (isAllClustersSelected) return items
    if (selectedClusters.includes('__none__')) return []
    return items.filter(item => {
      // Only include items that have a cluster defined and match the selected clusters
      return item.cluster && effectiveSelectedClusters.includes(item.cluster)
    })
  }, [isAllClustersSelected, selectedClusters, effectiveSelectedClusters])

  const filterBySeverity = useCallback(<T extends { severity?: string }>(items: T[]): T[] => {
    if (isAllSeveritiesSelected) return items
    if ((selectedSeverities as string[]).includes('__none__')) return []
    return items.filter(item => {
      const severity = (item.severity || 'info').toLowerCase()
      return effectiveSelectedSeverities.includes(severity as SeverityLevel)
    })
  }, [isAllSeveritiesSelected, selectedSeverities, effectiveSelectedSeverities])

  const filterByStatus = useCallback(<T extends { status?: string }>(items: T[]): T[] => {
    if (isAllStatusesSelected) return items
    if ((selectedStatuses as string[]).includes('__none__')) return []
    return items.filter(item => {
      const status = (item.status || '').toLowerCase()
      // Use exact match instead of substring to avoid false positives
      return effectiveSelectedStatuses.includes(status as StatusLevel)
    })
  }, [isAllStatusesSelected, selectedStatuses, effectiveSelectedStatuses])

  const filterByCustomText = useCallback(<T extends Record<string, unknown>>(
    items: T[],
    searchFields: string[] = ['name', 'namespace', 'cluster', 'message']
  ): T[] => {
    if (!customFilter.trim()) return items
    const query = customFilter.toLowerCase()
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field]
        return typeof value === 'string' && value.toLowerCase().includes(query)
      })
    )
  }, [customFilter])

  const filterItems = useCallback(<T extends { cluster?: string; severity?: string; status?: string } & Record<string, unknown>>(items: T[]): T[] => {
    let filtered = items
    filtered = filterByCluster(filtered)
    filtered = filterBySeverity(filtered)
    filtered = filterByStatus(filtered)
    filtered = filterByCustomText(filtered)
    return filtered
  }, [filterByCluster, filterBySeverity, filterByStatus, filterByCustomText])

  const contextValue = useMemo(() => ({
    // Cluster filtering
    selectedClusters: effectiveSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,

    // Cluster groups
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,

    // Severity filtering
    selectedSeverities: effectiveSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,

    // Status filtering
    selectedStatuses: effectiveSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,

    // Custom text filter
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,

    // Combined filter helpers
    isFiltered,
    clearAllFilters,

    // Saved filter sets
    savedFilterSets,
    saveCurrentFilters,
    applySavedFilterSet,
    deleteSavedFilterSet,
    activeFilterSetId,

    // Filter functions
    filterByCluster,
    filterBySeverity,
    filterByStatus,
    filterByCustomText,
    filterItems,
  }), [
    effectiveSelectedClusters,
    setSelectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    isClustersFiltered,
    availableClusters,
    clusterInfoMap,
    clusterGroups,
    addClusterGroup,
    updateClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    effectiveSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,
    isFiltered,
    clearAllFilters,
    filterByCluster,
    filterBySeverity,
    filterByStatus,
    filterByCustomText,
    filterItems,
    savedFilterSets,
    saveCurrentFilters,
    applySavedFilterSet,
    deleteSavedFilterSet,
    activeFilterSetId,
  ])

  return (
    <GlobalFiltersContext.Provider value={contextValue}>
      {children}
    </GlobalFiltersContext.Provider>
  )
}

export function useGlobalFilters() {
  const context = useContext(GlobalFiltersContext)
  if (!context) {
    throw new Error('useGlobalFilters must be used within a GlobalFiltersProvider')
  }
  return context
}
