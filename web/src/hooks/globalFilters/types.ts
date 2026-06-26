import type { ClusterInfo } from '../mcp/types'

export type SeverityLevel = 'critical' | 'warning' | 'high' | 'medium' | 'low' | 'info'

export type StatusLevel = 'pending' | 'failed' | 'running' | 'init' | 'bound'

export interface ClusterGroup {
  id: string
  name: string
  clusters: string[]
  color?: string
  labelSelector?: Record<string, string>
}

export interface SavedFilterSet {
  id: string
  name: string
  color: string
  clusters: string[]
  severities: string[]
  statuses: string[]
  distributions: string[]
  customText: string
}

export interface GlobalFiltersContextType {
  selectedClusters: string[]
  setSelectedClusters: (clusters: string[]) => void
  toggleCluster: (cluster: string) => void
  selectAllClusters: () => void
  deselectAllClusters: () => void
  isAllClustersSelected: boolean
  isClustersFiltered: boolean
  availableClusters: string[]
  clusterInfoMap: Record<string, ClusterInfo>

  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: Omit<ClusterGroup, 'id'>) => void
  updateClusterGroup: (id: string, group: Partial<ClusterGroup>) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (groupId: string) => void

  selectedSeverities: SeverityLevel[]
  setSelectedSeverities: (severities: SeverityLevel[]) => void
  toggleSeverity: (severity: SeverityLevel) => void
  selectAllSeverities: () => void
  deselectAllSeverities: () => void
  isAllSeveritiesSelected: boolean
  isSeveritiesFiltered: boolean

  selectedStatuses: StatusLevel[]
  setSelectedStatuses: (statuses: StatusLevel[]) => void
  toggleStatus: (status: StatusLevel) => void
  selectAllStatuses: () => void
  deselectAllStatuses: () => void
  isAllStatusesSelected: boolean
  isStatusesFiltered: boolean

  selectedDistributions: string[]
  toggleDistribution: (distribution: string) => void
  selectAllDistributions: () => void
  deselectAllDistributions: () => void
  isAllDistributionsSelected: boolean
  isDistributionsFiltered: boolean
  availableDistributions: string[]

  customFilter: string
  setCustomFilter: (filter: string) => void
  clearCustomFilter: () => void
  hasCustomFilter: boolean

  isFiltered: boolean
  clearAllFilters: () => void

  savedFilterSets: SavedFilterSet[]
  saveCurrentFilters: (name: string, color: string) => void
  applySavedFilterSet: (id: string) => void
  deleteSavedFilterSet: (id: string) => void
  activeFilterSetId: string | null

  filterByCluster: <T extends { cluster?: string }>(items: T[]) => T[]
  filterBySeverity: <T extends { severity?: string }>(items: T[]) => T[]
  filterByStatus: <T extends { status?: string }>(items: T[]) => T[]
  filterByCustomText: <T extends Record<string, unknown>>(items: T[], searchFields?: string[]) => T[]
  filterItems: <T extends { cluster?: string; severity?: string; status?: string } & Record<string, unknown>>(items: T[]) => T[]
}
