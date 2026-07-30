import { describe, it, expect } from 'vitest'
import {
  SEVERITY_LEVELS,
  SEVERITY_CONFIG,
  STATUS_LEVELS,
  STATUS_CONFIG,
  CLUSTER_STORAGE_KEY,
  SEVERITY_STORAGE_KEY,
  STATUS_STORAGE_KEY,
  DISTRIBUTION_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  SAVED_FILTER_SETS_KEY,
  LEGACY_PROJECT_DEFINITIONS_KEY,
  LEGACY_PROJECT_SELECTED_KEY,
  DEFAULT_GROUPS,
  NONE_SENTINEL,
  DEFAULT_SEARCH_FIELDS,
  DEFAULT_GLOBAL_FILTERS,
} from '../constants'

describe('globalFilters/constants', () => {
  it('exports expected severity and status levels', () => {
    expect(SEVERITY_LEVELS).toEqual(['critical', 'warning', 'high', 'medium', 'low', 'info'])
    expect(STATUS_LEVELS).toEqual(['pending', 'failed', 'running', 'init', 'bound'])
  })

  it('defines config entries for every severity and status level', () => {
    for (const level of SEVERITY_LEVELS) {
      expect(SEVERITY_CONFIG[level].label.length).toBeGreaterThan(0)
      expect(SEVERITY_CONFIG[level].color.startsWith('text-')).toBe(true)
    }
    for (const level of STATUS_LEVELS) {
      expect(STATUS_CONFIG[level].label.length).toBeGreaterThan(0)
      expect(STATUS_CONFIG[level].bgColor.startsWith('bg-')).toBe(true)
    }
  })

  it('uses stable localStorage keys', () => {
    expect(CLUSTER_STORAGE_KEY).toBe('globalFilter:clusters')
    expect(SEVERITY_STORAGE_KEY).toBe('globalFilter:severities')
    expect(STATUS_STORAGE_KEY).toBe('globalFilter:statuses')
    expect(DISTRIBUTION_STORAGE_KEY).toBe('globalFilter:distributions')
    expect(CUSTOM_FILTER_STORAGE_KEY).toBe('globalFilter:customText')
    expect(GROUPS_STORAGE_KEY).toBe('globalFilter:clusterGroups')
    expect(SAVED_FILTER_SETS_KEY).toBe('globalFilter:savedFilterSets')
    expect(LEGACY_PROJECT_DEFINITIONS_KEY).toBe('projects:definitions')
    expect(LEGACY_PROJECT_SELECTED_KEY).toBe('projects:selected')
  })

  it('exports expected defaults', () => {
    expect(DEFAULT_GROUPS).toEqual([])
    expect(NONE_SENTINEL).toBe('__none__')
    expect(DEFAULT_SEARCH_FIELDS).toEqual(['name', 'namespace', 'cluster', 'message'])
  })

  it('default context is safe no-op passthrough outside provider', () => {
    const items = [{ id: 1 }, { id: 2 }]
    expect(DEFAULT_GLOBAL_FILTERS.isAllClustersSelected).toBe(true)
    expect(DEFAULT_GLOBAL_FILTERS.isFiltered).toBe(false)
    expect(DEFAULT_GLOBAL_FILTERS.activeFilterSetId).toBeNull()
    expect(DEFAULT_GLOBAL_FILTERS.filterByCluster(items)).toBe(items)
    expect(DEFAULT_GLOBAL_FILTERS.filterBySeverity(items)).toBe(items)
    expect(DEFAULT_GLOBAL_FILTERS.filterByStatus(items)).toBe(items)
    expect(DEFAULT_GLOBAL_FILTERS.filterByCustomText(items)).toBe(items)
    expect(DEFAULT_GLOBAL_FILTERS.filterItems(items)).toBe(items)
  })
})
