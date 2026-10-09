import { useEffect } from 'react'
import {
  CLUSTER_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  DISTRIBUTION_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  SAVED_FILTER_SETS_KEY,
  SEVERITY_STORAGE_KEY,
  STATUS_STORAGE_KEY,
} from './constants'
import type { FilterSelections } from './filterSelections'
import type { ClusterGroup, SavedFilterSet } from './types'

/** Persists global filter selections, cluster groups and saved filter sets to localStorage. */
export function useFilterPersistence(
  filters: FilterSelections,
  clusterGroups: ClusterGroup[],
  savedFilterSets: SavedFilterSet[],
) {
  const {
    clusters: selectedClusters,
    severities: selectedSeverities,
    statuses: selectedStatuses,
    distributions: selectedDistributions,
    customText: customFilter,
  } = filters

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
}
