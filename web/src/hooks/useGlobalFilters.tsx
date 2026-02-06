import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { useClusters, ClusterInfo } from './useMCP'

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

// Cluster group definition
export interface ClusterGroup {
  id: string
  name: string
  clusters: string[]
  color?: string
  // For label-based groups
  labelSelector?: Record<string, string>
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

  // Filter functions for cards to use
  filterByCluster: <T extends { cluster?: string }>(items: T[]) => T[]
  filterBySeverity: <T extends { severity?: string }>(items: T[]) => T[]
  filterByStatus: <T extends { status?: string }>(items: T[]) => T[]
  filterByCustomText: <T extends Record<string, unknown>>(items: T[], searchFields?: string[]) => T[]
  filterItems: <T extends { cluster?: string; severity?: string }>(items: T[]) => T[]
}

const GlobalFiltersContext = createContext<GlobalFiltersContextType | null>(null)

const CLUSTER_STORAGE_KEY = 'globalFilter:clusters'
const SEVERITY_STORAGE_KEY = 'globalFilter:severities'
const STATUS_STORAGE_KEY = 'globalFilter:statuses'
const CUSTOM_FILTER_STORAGE_KEY = 'globalFilter:customText'
const GROUPS_STORAGE_KEY = 'globalFilter:clusterGroups'

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

  // Initialize cluster groups from localStorage
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>(() => {
    try {
      const stored = localStorage.getItem(GROUPS_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_GROUPS
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

  // Cluster filtering
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
        // Remove cluster - if last one, revert to all
        const newSelection = prev.filter(c => c !== cluster)
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
  }, [])

  const toggleSeverity = useCallback((severity: SeverityLevel) => {
    setSelectedSeveritiesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        return SEVERITY_LEVELS.filter(s => s !== severity)
      }

      if (prev.includes(severity)) {
        // Remove severity - if last one, revert to all
        const newSelection = prev.filter(s => s !== severity)
        return newSelection.length === 0 ? [] : newSelection
      } else {
        // Add severity
        const newSelection = [...prev, severity]
        // If all severities are now selected, switch to "all" mode
        if (newSelection.length === SEVERITY_LEVELS.length) {
          return []
        }
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
  }, [])

  const toggleStatus = useCallback((status: StatusLevel) => {
    setSelectedStatusesState(prev => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        return STATUS_LEVELS.filter(s => s !== status)
      }

      if (prev.includes(status)) {
        // Remove status - if last one, revert to all
        const newSelection = prev.filter(s => s !== status)
        return newSelection.length === 0 ? [] : newSelection
      } else {
        // Add status
        const newSelection = [...prev, status]
        // If all statuses are now selected, switch to "all" mode
        if (newSelection.length === STATUS_LEVELS.length) {
          return []
        }
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

  const filterItems = useCallback(<T extends { cluster?: string; severity?: string }>(items: T[]): T[] => {
    let filtered = items
    filtered = filterByCluster(filtered)
    filtered = filterBySeverity(filtered)
    return filtered
  }, [filterByCluster, filterBySeverity])

  return (
    <GlobalFiltersContext.Provider
      value={{
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

        // Filter functions
        filterByCluster,
        filterBySeverity,
        filterByStatus,
        filterByCustomText,
        filterItems,
      }}
    >
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
