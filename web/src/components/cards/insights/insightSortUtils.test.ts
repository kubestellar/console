import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInsightSort, INSIGHT_SORT_OPTIONS } from './insightSortUtils'
import type { MultiClusterInsight } from '../../../types/insights'

function makeInsight(
  overrides: Partial<MultiClusterInsight> = {},
): MultiClusterInsight {
  return {
    id: 'test-1',
    category: 'config-drift',
    source: 'heuristic',
    severity: 'warning',
    title: 'Test insight',
    description: 'Test description',
    affectedClusters: ['cluster-1'],
    detectedAt: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

describe('INSIGHT_SORT_OPTIONS', () => {
  it('has 4 sort options', () => {
    expect(INSIGHT_SORT_OPTIONS).toHaveLength(4)
    expect(INSIGHT_SORT_OPTIONS.map((o) => o.value)).toEqual([
      'severity',
      'clusters',
      'time',
      'title',
    ])
  })
})

describe('useInsightSort', () => {
  const insights: MultiClusterInsight[] = [
    makeInsight({
      id: '1',
      severity: 'info',
      title: 'Charlie',
      affectedClusters: ['c1'],
      detectedAt: '2026-01-15T12:00:00Z',
    }),
    makeInsight({
      id: '2',
      severity: 'critical',
      title: 'Alpha',
      affectedClusters: ['c1', 'c2', 'c3'],
      detectedAt: '2026-01-15T08:00:00Z',
    }),
    makeInsight({
      id: '3',
      severity: 'warning',
      title: 'Bravo',
      affectedClusters: ['c1', 'c2'],
      detectedAt: '2026-01-15T10:00:00Z',
    }),
  ]

  it('sorts by severity ascending by default', () => {
    const { result } = renderHook(() => useInsightSort(insights))
    expect(result.current.sorted.map((i) => i.severity)).toEqual([
      'critical',
      'warning',
      'info',
    ])
  })

  it('sorts by severity descending', () => {
    const { result } = renderHook(() =>
      useInsightSort(insights, 'severity', 'desc'),
    )
    expect(result.current.sorted.map((i) => i.severity)).toEqual([
      'info',
      'warning',
      'critical',
    ])
  })

  it('sorts by cluster count ascending', () => {
    const { result } = renderHook(() =>
      useInsightSort(insights, 'clusters', 'asc'),
    )
    expect(result.current.sorted.map((i) => i.affectedClusters.length)).toEqual(
      [1, 2, 3],
    )
  })

  it('sorts by time ascending (oldest first)', () => {
    const { result } = renderHook(() =>
      useInsightSort(insights, 'time', 'asc'),
    )
    expect(result.current.sorted.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by title alphabetically', () => {
    const { result } = renderHook(() =>
      useInsightSort(insights, 'title', 'asc'),
    )
    expect(result.current.sorted.map((i) => i.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
  })

  it('applies default limit of 5', () => {
    const manyInsights = Array.from({ length: 10 }, (_, i) =>
      makeInsight({ id: String(i), title: `Insight ${i}` }),
    )
    const { result } = renderHook(() => useInsightSort(manyInsights))
    expect(result.current.sorted).toHaveLength(5)
    expect(result.current.limit).toBe(5)
  })

  it('allows setting unlimited', () => {
    const manyInsights = Array.from({ length: 10 }, (_, i) =>
      makeInsight({ id: String(i), title: `Insight ${i}` }),
    )
    const { result } = renderHook(() => useInsightSort(manyInsights))
    act(() => result.current.setLimit('unlimited'))
    expect(result.current.sorted).toHaveLength(10)
  })

  it('allows changing sort field', () => {
    const { result } = renderHook(() => useInsightSort(insights))
    act(() => result.current.setSortBy('title'))
    expect(result.current.sortBy).toBe('title')
    expect(result.current.sorted.map((i) => i.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
  })

  it('allows toggling sort direction', () => {
    const { result } = renderHook(() => useInsightSort(insights))
    act(() => result.current.setSortDirection('desc'))
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.sorted.map((i) => i.severity)).toEqual([
      'info',
      'warning',
      'critical',
    ])
  })
})
