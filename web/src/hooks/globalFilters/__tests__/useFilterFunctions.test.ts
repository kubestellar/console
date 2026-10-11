import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFilterFunctions } from '../useFilterFunctions'
import { NONE_SENTINEL, SEVERITY_LEVELS, STATUS_LEVELS } from '../constants'
import type { SeverityLevel, StatusLevel } from '../types'

type Input = Parameters<typeof useFilterFunctions>[0]

function makeInput(overrides: Partial<Input> = {}): Input {
  return {
    isAllClustersSelected: true,
    selectedClusters: [],
    effectiveSelectedClusters: [],
    isAllSeveritiesSelected: true,
    selectedSeverities: [],
    effectiveSelectedSeverities: SEVERITY_LEVELS,
    isAllStatusesSelected: true,
    selectedStatuses: [],
    effectiveSelectedStatuses: STATUS_LEVELS,
    customFilter: '',
    ...overrides,
  }
}

function setup(overrides: Partial<Input> = {}) {
  return renderHook(() => useFilterFunctions(makeInput(overrides))).result.current
}

describe('filterByCluster', () => {
  const items = [{ cluster: 'a' }, { cluster: 'b' }, {}]

  it('returns all items when all clusters selected', () => {
    expect(setup().filterByCluster(items)).toBe(items)
  })

  it('returns empty when NONE_SENTINEL selected', () => {
    const f = setup({ isAllClustersSelected: false, selectedClusters: [NONE_SENTINEL] })
    expect(f.filterByCluster(items)).toEqual([])
  })

  it('keeps only items in selected clusters and drops items without a cluster', () => {
    const f = setup({ isAllClustersSelected: false, selectedClusters: ['a'], effectiveSelectedClusters: ['a'] })
    expect(f.filterByCluster(items)).toEqual([{ cluster: 'a' }])
  })
})

describe('filterBySeverity', () => {
  const items = [{ severity: 'Critical' }, { severity: 'low' }, {}]

  it('returns all items when all severities selected', () => {
    expect(setup().filterBySeverity(items)).toBe(items)
  })

  it('returns empty when NONE_SENTINEL selected', () => {
    const f = setup({ isAllSeveritiesSelected: false, selectedSeverities: [NONE_SENTINEL as SeverityLevel] })
    expect(f.filterBySeverity(items)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const f = setup({ isAllSeveritiesSelected: false, selectedSeverities: ['critical'], effectiveSelectedSeverities: ['critical'] })
    expect(f.filterBySeverity(items)).toEqual([{ severity: 'Critical' }])
  })

  it('treats missing severity as info', () => {
    const f = setup({ isAllSeveritiesSelected: false, selectedSeverities: ['info'], effectiveSelectedSeverities: ['info'] })
    expect(f.filterBySeverity(items)).toEqual([{}])
  })
})

describe('filterByStatus', () => {
  const items = [{ status: 'Running' }, { status: 'failed' }, {}]

  it('returns all items when all statuses selected', () => {
    expect(setup().filterByStatus(items)).toBe(items)
  })

  it('returns empty when NONE_SENTINEL selected', () => {
    const f = setup({ isAllStatusesSelected: false, selectedStatuses: [NONE_SENTINEL as StatusLevel] })
    expect(f.filterByStatus(items)).toEqual([])
  })

  it('matches case-insensitively and drops items without status', () => {
    const f = setup({ isAllStatusesSelected: false, selectedStatuses: ['running'], effectiveSelectedStatuses: ['running'] })
    expect(f.filterByStatus(items)).toEqual([{ status: 'Running' }])
  })
})

describe('filterByCustomText', () => {
  const items = [
    { name: 'Alpha', namespace: 'default' },
    { name: 'beta', namespace: 'kube-system' },
  ]

  it('returns all items for empty or whitespace filter', () => {
    expect(setup({ customFilter: '' }).filterByCustomText(items)).toBe(items)
    expect(setup({ customFilter: '   ' }).filterByCustomText(items)).toBe(items)
  })

  it('matches default search fields case-insensitively', () => {
    expect(setup({ customFilter: 'ALPHA' }).filterByCustomText(items)).toEqual([items[0]])
  })

  it('honors custom search fields', () => {
    const f = setup({ customFilter: 'kube' })
    expect(f.filterByCustomText(items, ['name'])).toEqual([])
    expect(f.filterByCustomText(items, ['namespace'])).toEqual([items[1]])
  })
})

describe('filterItems', () => {
  it('applies cluster, severity, status and text filters together', () => {
    const items = [
      { cluster: 'a', severity: 'critical', status: 'failed', name: 'x-one' },
      { cluster: 'b', severity: 'critical', status: 'failed', name: 'x-two' },
      { cluster: 'a', severity: 'low', status: 'failed', name: 'x-three' },
      { cluster: 'a', severity: 'critical', status: 'running', name: 'x-four' },
      { cluster: 'a', severity: 'critical', status: 'failed', name: 'other' },
    ]
    const f = setup({
      isAllClustersSelected: false,
      selectedClusters: ['a'],
      effectiveSelectedClusters: ['a'],
      isAllSeveritiesSelected: false,
      selectedSeverities: ['critical'],
      effectiveSelectedSeverities: ['critical'],
      isAllStatusesSelected: false,
      selectedStatuses: ['failed'],
      effectiveSelectedStatuses: ['failed'],
      customFilter: 'x-',
    })
    expect(f.filterItems(items)).toEqual([items[0]])
  })
})

describe('callback stability', () => {
  it('keeps function identities across rerenders with unchanged inputs', () => {
    const input = makeInput()
    const { result, rerender } = renderHook(() => useFilterFunctions(input))
    const first = result.current
    rerender()
    expect(result.current.filterItems).toBe(first.filterItems)
    expect(result.current.filterByCluster).toBe(first.filterByCluster)
  })
})
