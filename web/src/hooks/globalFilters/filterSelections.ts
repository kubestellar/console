import {
  CLUSTER_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  DISTRIBUTION_STORAGE_KEY,
  SEVERITY_STORAGE_KEY,
  STATUS_STORAGE_KEY,
} from './constants'
import type { SavedFilterSet, SeverityLevel, StatusLevel } from './types'
import { haveSameSelections, loadStoredSelection, loadStoredText } from './utils'

// Combined selection state — updated atomically to prevent consecutive-setState
// flicker in clearAllFilters and applySavedFilterSet.
export type FilterSelections = {
  clusters: string[]
  severities: SeverityLevel[]
  statuses: StatusLevel[]
  distributions: string[]
  customText: string
}

export type FilterSelectionsAction =
  | Partial<FilterSelections>
  | ((state: FilterSelections) => Partial<FilterSelections>)

export type DispatchFilterSelections = (action: FilterSelectionsAction) => void

export function patchFilters(state: FilterSelections, action: FilterSelectionsAction): FilterSelections {
  const patch = typeof action === 'function' ? action(state) : action
  return { ...state, ...patch }
}

export function loadInitialFilterSelections(): FilterSelections {
  return {
    clusters: loadStoredSelection(CLUSTER_STORAGE_KEY),
    severities: loadStoredSelection<SeverityLevel>(SEVERITY_STORAGE_KEY),
    statuses: loadStoredSelection<StatusLevel>(STATUS_STORAGE_KEY),
    distributions: loadStoredSelection(DISTRIBUTION_STORAGE_KEY),
    customText: loadStoredText(CUSTOM_FILTER_STORAGE_KEY),
  }
}

/** Returns the id of the saved filter set that matches the current selections, or null. */
export function findActiveFilterSetId(
  savedFilterSets: SavedFilterSet[],
  selectedClusters: string[],
  selectedSeverities: SeverityLevel[],
  selectedStatuses: StatusLevel[],
  selectedDistributions: string[],
  customFilter: string,
): string | null {
  for (const fs of (savedFilterSets || [])) {
    const clustersMatch = haveSameSelections(fs.clusters, selectedClusters)
    const severitiesMatch = haveSameSelections(fs.severities, selectedSeverities as string[])
    const statusesMatch = haveSameSelections(fs.statuses, selectedStatuses as string[])
    const distributionsMatch = haveSameSelections(fs.distributions || [], selectedDistributions)
    const textMatch = fs.customText === customFilter
    if (clustersMatch && severitiesMatch && statusesMatch && distributionsMatch && textMatch) return fs.id
  }
  return null
}
