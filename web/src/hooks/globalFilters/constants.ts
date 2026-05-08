import type { ClusterGroup, GlobalFiltersContextType, SeverityLevel, StatusLevel } from './types'

export const SEVERITY_LEVELS: SeverityLevel[] = ['critical', 'warning', 'high', 'medium', 'low', 'info']

export const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-500', bgColor: 'bg-red-500/20' },
  warning: { label: 'Warning', color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
  high: { label: 'High', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  medium: { label: 'Medium', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  low: { label: 'Low', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  info: { label: 'Info', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
}

export const STATUS_LEVELS: StatusLevel[] = ['pending', 'failed', 'running', 'init', 'bound']

export const STATUS_CONFIG: Record<StatusLevel, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  running: { label: 'Running', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  init: { label: 'Init', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  bound: { label: 'Bound', color: 'text-green-400', bgColor: 'bg-green-500/10' },
}

export const CLUSTER_STORAGE_KEY = 'globalFilter:clusters'
export const SEVERITY_STORAGE_KEY = 'globalFilter:severities'
export const STATUS_STORAGE_KEY = 'globalFilter:statuses'
export const DISTRIBUTION_STORAGE_KEY = 'globalFilter:distributions'
export const CUSTOM_FILTER_STORAGE_KEY = 'globalFilter:customText'
export const GROUPS_STORAGE_KEY = 'globalFilter:clusterGroups'
export const SAVED_FILTER_SETS_KEY = 'globalFilter:savedFilterSets'
export const LEGACY_PROJECT_DEFINITIONS_KEY = 'projects:definitions'
export const LEGACY_PROJECT_SELECTED_KEY = 'projects:selected'

export const DEFAULT_GROUPS: ClusterGroup[] = []
export const NONE_SENTINEL = '__none__'
export const DEFAULT_SEARCH_FIELDS: string[] = ['name', 'namespace', 'cluster', 'message']

// Default returned when a consumer renders outside the provider — e.g. cards
// pulled into a LightweightShell route, or a brief mid-transition frame where
// `useLivePathname` flips the root <Routes> between FullDashboardApp and
// LightweightShell. Throwing would bubble up to AppErrorBoundary and show a
// crash screen on lightweight pages that don't need filtering at all. A
// no-op fallback lets those pages render while still behaving correctly
// (no clusters selected means "all", setters are no-ops, filter functions
// return items untouched).
export const DEFAULT_GLOBAL_FILTERS: GlobalFiltersContextType = {
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
