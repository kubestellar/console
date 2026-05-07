import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'
// Import directly from mcp/clusters to avoid pulling in the full MCP barrel
// (~254 KB). Only clusters.ts + shared.ts are needed here.
import { useClusters } from './mcp/clusters'
import type { ClusterInfo } from './mcp/types'
import { detectCloudProvider } from '../components/ui/CloudProviderIcon'
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
  info: { label: 'Info', color: 'text-blue-400', bgColor: 'bg-blue-500/10' } }

// Status levels
export type StatusLevel = 'pending' | 'failed' | 'running' | 'init' | 'bound'

export const STATUS_LEVELS: StatusLevel[] = ['pending', 'failed', 'running', 'init', 'bound']

export const STATUS_CONFIG: Record<StatusLevel, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  running: { label: 'Running', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  init: { label: 'Init', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  bound: { label: 'Bound', color: 'text-green-400', bgColor: 'bg-green-500/10' } }

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
  distributions: string[] // empty = all distributions
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

  // Distribution filtering
  selectedDistributions: string[]
  toggleDistribution: (distribution: string) => void
  selectAllDistributions: () => void
  deselectAllDistributions: () => void
  isAllDistributionsSelected: boolean
  isDistributionsFiltered: boolean
  availableDistributions: string[]

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
const DISTRIBUTION_STORAGE_KEY = 'globalFilter:distributions'
const CUSTOM_FILTER_STORAGE_KEY = 'globalFilter:customText'
const GROUPS_STORAGE_KEY = 'globalFilter:clusterGroups'
const SAVED_FILTER_SETS_KEY = 'globalFilter:savedFilterSets'

// Default cluster groups
const DEFAULT_GROUPS: ClusterGroup[] = []

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const { deduplicatedClusters } = useClusters()
  const availableClusters = useMemo(
    () => deduplicatedClusters.map(c => c.name),
    [deduplicatedClusters]
  )
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
        if (parsed === null) return []
        if (Array.isArray(parsed)) return parsed
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
        if (parsed === null) return []
        if (Array.isArray(parsed)) return parsed
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
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          groups = parsed
        }
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
                color: p.color })
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

  // Initialize distributions from localStorage or default to all
  const [selectedDistributions, setSelectedDistributionsState] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(DISTRIBUTION_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed === null ? [] : parsed
      }
    } catch {
      // Ignore parse errors
    }
    return [] // Empty means all distributions
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

  // Sentinel value used by deselectAll* to represent "no items selected".
  // Must be preserved during reconciliation so that filterBy* functions
  // can recognise the "select none" state and return an empty result set.
  const NONE_SENTINEL = '__none__'

  // Reconcile selected clusters against available clusters — drop any that no longer exist.
  // This prevents filters from getting stuck on clusters that have been removed from kubeconfig.
  // Skip reconciliation when the __none__ sentinel is present (user explicitly deselected all).
  useEffect(() => {
    if (selectedClusters.length === 0 || availableClusters.length === 0) return
    // Preserve the "select none" sentinel — it is not a real cluster name
    if (selectedClusters.includes(NONE_SENTINEL)) return
    const validSelections = selectedClusters.filter(c => availableClusters.includes(c))
    if (validSelections.length !== selectedClusters.length) {
      setSelectedClustersState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableClusters, selectedClusters])

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
    localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(selectedDistributions.length === 0 ? null : selectedDistributions))
  }, [selectedDistributions])

  useEffect(() => {
    localStorage.setItem(CUSTOM_FILTER_STORAGE_KEY, customFilter)
  }, [customFilter])

  useEffect(() => {
    localStorage.setItem(SAVED_FILTER_SETS_KEY, JSON.stringify(savedFilterSets))
  }, [savedFilterSets])

  // Cluster filtering — callbacks stabilized with useCallback
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
    setSelectedClustersState(['__none__'])
  }, [])

  const isAllClustersSelected = selectedClusters.length === 0
  const isClustersFiltered = !isAllClustersSelected

  // Get effective selected clusters (for filtering)
  const effectiveSelectedClusters = isAllClustersSelected ? availableClusters : selectedClusters

  // Cluster groups — stabilized with useCallback
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

  // Severity filtering — stabilized with useCallback
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
  // Status filtering — stabilized with useCallback
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

  // Distribution filtering — derives available distributions from clusters
  const availableDistributions = useMemo(() => {
    const distSet = new Set<string>()
    for (const c of deduplicatedClusters) {
      const dist = c.distribution || detectCloudProvider(c.name, c.server, c.namespaces, c.user) || 'unknown'
      distSet.add(dist)
    }
    return Array.from(distSet).sort()
  }, [deduplicatedClusters])

  // Reconcile selected distributions against available ones.
  // Skip when the __none__ sentinel is present (user explicitly deselected all).
  useEffect(() => {
    if (selectedDistributions.length === 0 || availableDistributions.length === 0) return
    if (selectedDistributions.includes(NONE_SENTINEL)) return
    const validSelections = selectedDistributions.filter(d => availableDistributions.includes(d))
    if (validSelections.length !== selectedDistributions.length) {
      setSelectedDistributionsState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableDistributions, selectedDistributions])

  const toggleDistribution = useCallback((distribution: string) => {
    setSelectedDistributionsState(prev => {
      if (prev.length === 0) {
        // Currently "all" → switch to all except this one
        return availableDistributions.filter(d => d !== distribution)
      }
      if (prev.includes(distribution)) {
        const next = prev.filter(d => d !== distribution)
        return next.length === 0 ? [] : next
      } else {
        const next = [...prev, distribution]
        return next.length === availableDistributions.length ? [] : next
      }
    })
  }, [availableDistributions])

  const selectAllDistributions = useCallback(() => setSelectedDistributionsState([]), [])
  const deselectAllDistributions = useCallback(() => setSelectedDistributionsState(['__none__']), [])

  const isAllDistributionsSelected = selectedDistributions.length === 0
  const isDistributionsFiltered = !isAllDistributionsSelected
  const effectiveSelectedDistributions = isAllDistributionsSelected ? availableDistributions : selectedDistributions

  // Custom text filter
  const setCustomFilter = useCallback((filter: string) => {
    setCustomFilterState(filter)
  }, [])

  const clearCustomFilter = useCallback(() => {
    setCustomFilterState('')
  }, [])

  const hasCustomFilter = customFilter.trim().length > 0

  // Combined filter state
  const isFiltered = isClustersFiltered || isSeveritiesFiltered || isStatusesFiltered || isDistributionsFiltered || hasCustomFilter

  const clearAllFilters = useCallback(() => {
    setSelectedClustersState([])
    setSelectedSeveritiesState([])
    setSelectedStatusesState([])
    setSelectedDistributionsState([])
    setCustomFilterState('')
  }, [])

  // Saved filter sets — stabilized with useCallback
  const saveCurrentFilters = useCallback((name: string, color: string) => {
    const id = `filterset-${Date.now()}`
    const newSet: SavedFilterSet = {
      id,
      name,
      color,
      clusters: [...selectedClusters],
      severities: [...selectedSeverities],
      statuses: [...selectedStatuses],
      distributions: [...selectedDistributions],
      customText: customFilter }
    setSavedFilterSets(prev => [...prev, newSet])
  }, [selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter])

  const applySavedFilterSet = useCallback((id: string) => {
    const filterSet = savedFilterSets.find(fs => fs.id === id)
    if (!filterSet) return
    setSelectedClustersState(filterSet.clusters)
    setSelectedSeveritiesState(filterSet.severities as SeverityLevel[])
    setSelectedStatusesState(filterSet.statuses as StatusLevel[])
    setSelectedDistributionsState(filterSet.distributions || [])
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
      const distributionsMatch = JSON.stringify([...(fs.distributions || [])].sort()) === JSON.stringify([...selectedDistributions].sort())
      const textMatch = fs.customText === customFilter
      if (clustersMatch && severitiesMatch && statusesMatch && distributionsMatch && textMatch) return fs.id
    }
    return null
  }, [savedFilterSets, selectedClusters, selectedSeverities, selectedStatuses, selectedDistributions, customFilter])

  // Filter functions for cards to use — stabilized with useCallback to prevent
  // context consumers from re-rendering on every provider render.
  const filterByCluster = useCallback(<T extends { cluster?: string }>(items: T[]): T[] => {
    if (isAllClustersSelected) return items
    if (selectedClusters.includes('__none__')) return []
    return items.filter(item => {
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
      return effectiveSelectedStatuses.includes(status as StatusLevel)
    })
  }, [isAllStatusesSelected, selectedStatuses, effectiveSelectedStatuses])

  const DEFAULT_SEARCH_FIELDS = useMemo(() => ['name', 'namespace', 'cluster', 'message'], [])

  const filterByCustomText = useCallback(<T extends Record<string, unknown>>(
    items: T[],
    searchFields: string[] = DEFAULT_SEARCH_FIELDS
  ): T[] => {
    if (!customFilter.trim()) return items
    const query = customFilter.toLowerCase()
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field]
        return typeof value === 'string' && value.toLowerCase().includes(query)
      })
    )
  }, [customFilter, DEFAULT_SEARCH_FIELDS])

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

    // Distribution filtering
    selectedDistributions: effectiveSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    availableDistributions,

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
    filterItems }), [
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
    effectiveSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    availableDistributions,
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

// Default returned when a consumer renders outside the provider — e.g. cards
// pulled into a LightweightShell route, or a brief mid-transition frame where
// `useLivePathname` flips the root <Routes> between FullDashboardApp and
// LightweightShell. Throwing would bubble up to AppErrorBoundary and show a
// crash screen on lightweight pages that don't need filtering at all. A
// no-op fallback lets those pages render while still behaving correctly
// (no clusters selected means "all", setters are no-ops, filter functions
// return items untouched).
const DEFAULT_GLOBAL_FILTERS: GlobalFiltersContextType = {
  selectedClusters: [],
  setSelectedClusters: () => {},
  toggleCluster: () => {},
  selectAllClusters: () => {},
  deselectAllClusters: () => {},
  isAllClustersSelected: true,
  isClustersFiltered: false,
  availableClusters: [],
  clusterInfoMap: {},

  clusterGroups: [],
  addClusterGroup: () => {},
  updateClusterGroup: () => {},
  deleteClusterGroup: () => {},
  selectClusterGroup: () => {},

  selectedSeverities: [],
  setSelectedSeverities: () => {},
  toggleSeverity: () => {},
  selectAllSeverities: () => {},
  deselectAllSeverities: () => {},
  isAllSeveritiesSelected: true,
  isSeveritiesFiltered: false,

  selectedStatuses: [],
  setSelectedStatuses: () => {},
  toggleStatus: () => {},
  selectAllStatuses: () => {},
  deselectAllStatuses: () => {},
  isAllStatusesSelected: true,
  isStatusesFiltered: false,

  selectedDistributions: [],
  toggleDistribution: () => {},
  selectAllDistributions: () => {},
  deselectAllDistributions: () => {},
  isAllDistributionsSelected: true,
  isDistributionsFiltered: false,
  availableDistributions: [],

  customFilter: '',
  setCustomFilter: () => {},
  clearCustomFilter: () => {},
  hasCustomFilter: false,

  isFiltered: false,
  clearAllFilters: () => {},

  savedFilterSets: [],
  saveCurrentFilters: () => {},
  applySavedFilterSet: () => {},
  deleteSavedFilterSet: () => {},
  activeFilterSetId: null,

  filterByCluster: items => items,
  filterBySeverity: items => items,
  filterByStatus: items => items,
  filterByCustomText: items => items,
  filterItems: items => items,
}

export function useGlobalFilters() {
  return useContext(GlobalFiltersContext) ?? DEFAULT_GLOBAL_FILTERS
}
