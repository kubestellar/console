import { describe, expect, it } from 'vitest'
import {
  FILTER_SENTINEL_ALL,
  FILTER_SENTINEL_SOURCE_ALL,
  NO_MIN_MATCH_PERCENT,
  computeActiveFilterCount,
  filterDirectoryEntries,
} from '../missionBrowserFilterState'
import type { BrowseEntry } from '../../../lib/missions/types'

describe('missionBrowserFilterState', () => {
  it('returns zero for default recommendation filter state', () => {
    const count = computeActiveFilterCount({
      minMatchPercent: NO_MIN_MATCH_PERCENT,
      categoryFilter: FILTER_SENTINEL_ALL,
      matchSourceFilter: FILTER_SENTINEL_SOURCE_ALL,
      maturityFilter: FILTER_SENTINEL_ALL,
      missionClassFilter: FILTER_SENTINEL_ALL,
      difficultyFilter: FILTER_SENTINEL_ALL,
      selectedTags: new Set(),
      cncfFilter: '',
    })

    expect(count).toBe(0)
  })

  it('counts each non-default filter as active', () => {
    const count = computeActiveFilterCount({
      minMatchPercent: 25,
      categoryFilter: 'Deploy',
      matchSourceFilter: 'cluster',
      maturityFilter: 'sandbox',
      missionClassFilter: 'installer',
      difficultyFilter: 'advanced',
      selectedTags: new Set(['security']),
      cncfFilter: 'istio',
    })

    expect(count).toBe(8)
  })

  it('filters directory entries by case-insensitive name and description', () => {
    const entries: BrowseEntry[] = [
      { name: 'Install Istio', path: '/a', type: 'file', description: 'Service mesh setup' },
      { name: 'Debug DNS', path: '/b', type: 'file', description: 'Troubleshoot CoreDNS' },
      { name: 'Upgrade Cluster', path: '/c', type: 'file' },
    ]

    expect(filterDirectoryEntries(entries, 'istio')).toHaveLength(1)
    expect(filterDirectoryEntries(entries, 'coredns')).toHaveLength(1)
    expect(filterDirectoryEntries(entries, 'UPGRADE')).toHaveLength(1)
  })

  it('returns all entries unchanged when query is empty', () => {
    const entries: BrowseEntry[] = [
      { name: 'A', path: '/a', type: 'file' },
      { name: 'B', path: '/b', type: 'directory' },
    ]

    expect(filterDirectoryEntries(entries, '')).toBe(entries)
  })
})
