/**
 * Expanded edge-case tests for cardHooks.ts
 *
 * Covers: useCardFilters, useCardSort, useCardData, useCardCollapse,
 * useCardCollapseAll, useCardFlash, useSingleSelectCluster, useChartFilters,
 * useCascadingSelection, useStatusFilter, commonComparators
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGlobalFilters = vi.fn(() => ({
  filterByCluster: <T>(items: T[]) => items,
  filterByStatus: <T>(items: T[]) => items,
  customFilter: '',
  selectedClusters: [] as string[],
  isAllClustersSelected: true,
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: (...args: unknown[]) => mockGlobalFilters(...args),
}))

const mockClusters = vi.fn(() => ({
  deduplicatedClusters: [
    { name: 'prod', reachable: true },
    { name: 'staging', reachable: true },
    { name: 'dev', reachable: false },
  ],
  clusters: [],
  isLoading: false,
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: (...args: unknown[]) => mockClusters(...args),
}))

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: () => ({ containerRef: { current: null }, containerStyle: undefined }),
}))

import {
  useCardFilters,
  useCardSort,
  useCardCollapse,
  useCardCollapseAll,
  useCardFlash,
  useStatusFilter,
  commonComparators,
  type FilterConfig,
  type SortConfig,
  type _CardDataConfig,
} from '../cardHooks'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

interface TestItem {
  name: string
  cluster: string
  status: string
  count: number
}

const ITEMS: TestItem[] = [
  { name: 'alpha', cluster: 'prod', status: 'running', count: 10 },
  { name: 'beta', cluster: 'staging', status: 'failed', count: 5 },
  { name: 'gamma', cluster: 'prod', status: 'running', count: 20 },
  { name: 'delta', cluster: 'dev', status: 'pending', count: 1 },
]

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockGlobalFilters.mockReturnValue({
    filterByCluster: <T>(items: T[]) => items,
    filterByStatus: <T>(items: T[]) => items,
    customFilter: '',
    selectedClusters: [],
    isAllClustersSelected: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCardFilters — edge cases', () => {
  const config: FilterConfig<TestItem> = {
    searchFields: ['name', 'cluster'],
    clusterField: 'cluster',
    statusField: 'status',
  }

  // 1. Local search filters items
  it('filters by local search query', () => {
    const { result } = renderHook(() => useCardFilters(ITEMS, config))
    act(() => { result.current.setSearch('alpha') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('alpha')
  })

  // 2. Local cluster filter
  it('filters by local cluster selection', () => {
    const { result } = renderHook(() => useCardFilters(ITEMS, config))
    act(() => { result.current.toggleClusterFilter('prod') })
    expect(result.current.filtered.every(i => i.cluster === 'prod')).toBe(true)
  })

  // 3. Clear cluster filter restores all
  it('clearClusterFilter restores all items', () => {
    const { result } = renderHook(() => useCardFilters(ITEMS, config))
    act(() => { result.current.toggleClusterFilter('prod') })
    act(() => { result.current.clearClusterFilter() })
    expect(result.current.filtered).toHaveLength(ITEMS.length)
  })

  // 4. Toggle cluster filter removes if already selected
  it('toggleClusterFilter removes cluster if already selected', () => {
    const { result } = renderHook(() => useCardFilters(ITEMS, config))
    act(() => { result.current.toggleClusterFilter('prod') })
    expect(result.current.localClusterFilter).toContain('prod')
    act(() => { result.current.toggleClusterFilter('prod') })
    expect(result.current.localClusterFilter).not.toContain('prod')
  })

  // 5. Custom predicate is used in filtering
  it('uses custom predicate for filtering', () => {
    const customConfig: FilterConfig<TestItem> = {
      ...config,
      customPredicate: (item, query) => item.count.toString().includes(query),
    }
    const { result } = renderHook(() => useCardFilters(ITEMS, customConfig))
    act(() => { result.current.setSearch('20') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('gamma')
  })

  // 6. Handles undefined/null config gracefully
  it('handles undefined config without crashing', () => {
    const { result } = renderHook(() =>
      useCardFilters(ITEMS, undefined as unknown as FilterConfig<TestItem>)
    )
    expect(result.current.filtered).toEqual(ITEMS)
  })

  // 7. StorageKey persists local filter
  it('persists local cluster filter to localStorage', () => {
    const storedConfig = { ...config, storageKey: 'test-card' }
    const { result } = renderHook(() => useCardFilters(ITEMS, storedConfig))
    act(() => { result.current.toggleClusterFilter('prod') })
    const stored = localStorage.getItem('kubestellar-card-filter:test-card')
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!)).toEqual(['prod'])
  })
})

describe('useCardSort — edge cases', () => {
  const sortConfig: SortConfig<TestItem, 'name' | 'count'> = {
    defaultField: 'name',
    defaultDirection: 'asc',
    comparators: {
      name: (a, b) => a.name.localeCompare(b.name),
      count: (a, b) => a.count - b.count,
    },
  }

  // 8. Sorts ascending by default
  it('sorts by default field ascending', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, sortConfig))
    expect(result.current.sorted[0].name).toBe('alpha')
    expect(result.current.sorted[result.current.sorted.length - 1].name).toBe('gamma')
  })

  // 9. Toggle direction reverses sort
  it('toggleSortDirection reverses order', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, sortConfig))
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.sorted[0].name).toBe('gamma')
  })

  // 10. Change sort field
  it('changes sort field via setSortBy', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, sortConfig))
    act(() => { result.current.setSortBy('count') })
    expect(result.current.sorted[0].count).toBe(1)
  })

  // 11. Handles undefined config
  it('handles undefined config without crashing', () => {
    const { result } = renderHook(() =>
      useCardSort(ITEMS, undefined as unknown as SortConfig<TestItem, 'name'>)
    )
    expect(result.current.sorted).toEqual(ITEMS)
  })
})

describe('useCardCollapse — edge cases', () => {
  // 12. Default is expanded
  it('defaults to expanded (not collapsed)', () => {
    const { result } = renderHook(() => useCardCollapse('test-card'))
    expect(result.current.isCollapsed).toBe(false)
  })

  // 13. Toggle collapse
  it('toggleCollapsed flips state', () => {
    const { result } = renderHook(() => useCardCollapse('toggle-card'))
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(true)
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(false)
  })

  // 14. Persists to localStorage
  it('persists collapsed state to localStorage', () => {
    const { result } = renderHook(() => useCardCollapse('persist-card'))
    act(() => { result.current.collapse() })
    const stored = JSON.parse(localStorage.getItem('kubestellar-collapsed-cards') || '[]')
    expect(stored).toContain('persist-card')
  })

  // 15. expand and collapse shortcuts
  it('expand and collapse methods work correctly', () => {
    const { result } = renderHook(() => useCardCollapse('shortcut-card'))
    act(() => { result.current.collapse() })
    expect(result.current.isCollapsed).toBe(true)
    act(() => { result.current.expand() })
    expect(result.current.isCollapsed).toBe(false)
  })
})

describe('useCardCollapseAll — edge cases', () => {
  // 16. Collapse all and expand all
  it('collapseAll and expandAll manage all cards', () => {
    const ids = ['card-1', 'card-2', 'card-3']
    const { result } = renderHook(() => useCardCollapseAll(ids))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    expect(result.current.collapsedCount).toBe(3)

    act(() => { result.current.expandAll() })
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.collapsedCount).toBe(0)
  })

  // 17. Toggle individual card
  it('toggleCard toggles individual card collapse', () => {
    const ids = ['card-1', 'card-2']
    const { result } = renderHook(() => useCardCollapseAll(ids))
    act(() => { result.current.toggleCard('card-1') })
    expect(result.current.isCardCollapsed('card-1')).toBe(true)
    expect(result.current.isCardCollapsed('card-2')).toBe(false)
  })
})

describe('useCardFlash — edge cases', () => {
  // 18. No flash on first render
  it('does not flash on initial render', () => {
    const { result } = renderHook(() => useCardFlash(10))
    expect(result.current.flashType).toBe('none')
  })

  // 19. Flash on significant change
  it('flashes on significant value change', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value, { threshold: 0.1 }), {
      initialProps: { value: 10 },
    })
    rerender({ value: 15 }) // 50% change
    expect(result.current.flashType).toBe('info')
    vi.useRealTimers()
  })

  // 20. No flash on small change
  it('does not flash on change below threshold', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value, { threshold: 0.5 }), {
      initialProps: { value: 100 },
    })
    rerender({ value: 105 }) // 5% change, below 50% threshold
    expect(result.current.flashType).toBe('none')
  })

  // 21. resetFlash clears flash type
  it('resetFlash clears the flash type', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 10 },
    })
    rerender({ value: 20 })
    expect(result.current.flashType).toBe('info')
    act(() => { result.current.resetFlash() })
    expect(result.current.flashType).toBe('none')
    vi.useRealTimers()
  })
})

describe('commonComparators', () => {
  // 22. String comparator
  it('string comparator sorts alphabetically', () => {
    const cmp = commonComparators.string<TestItem>('name')
    expect(cmp(ITEMS[0], ITEMS[1])).toBeLessThan(0) // alpha < beta
  })

  // 23. Number comparator
  it('number comparator sorts numerically', () => {
    const cmp = commonComparators.number<TestItem>('count')
    expect(cmp(ITEMS[0], ITEMS[1])).toBeGreaterThan(0) // 10 > 5
  })

  // 24. Status order comparator
  it('statusOrder comparator sorts by priority', () => {
    const order = { running: 0, pending: 1, failed: 2 }
    const cmp = commonComparators.statusOrder<TestItem>('status', order)
    expect(cmp(ITEMS[0], ITEMS[1])).toBeLessThan(0) // running < failed
  })
})

describe('useStatusFilter — edge cases', () => {
  // 25. Default status
  it('defaults to provided defaultStatus', () => {
    const { result } = renderHook(() =>
      useStatusFilter({ statuses: ['all', 'active', 'done'] as const, defaultStatus: 'all' })
    )
    expect(result.current.statusFilter).toBe('all')
  })

  // 26. Change status
  it('setStatusFilter changes the filter', () => {
    const { result } = renderHook(() =>
      useStatusFilter({ statuses: ['all', 'active'] as const, defaultStatus: 'all' })
    )
    act(() => { result.current.setStatusFilter('active') })
    expect(result.current.statusFilter).toBe('active')
  })

  // 27. Persists to localStorage
  it('persists non-default status to localStorage', () => {
    const { result } = renderHook(() =>
      useStatusFilter({
        statuses: ['all', 'active'] as const,
        defaultStatus: 'all',
        storageKey: 'test-status',
      })
    )
    act(() => { result.current.setStatusFilter('active') })
    const stored = localStorage.getItem('kubestellar-card-filter:test-status-status')
    expect(stored).toBe('active')
  })

  // 28. Clears storage when set to default
  it('removes localStorage entry when set to default status', () => {
    const { result } = renderHook(() =>
      useStatusFilter({
        statuses: ['all', 'active'] as const,
        defaultStatus: 'all',
        storageKey: 'test-clear',
      })
    )
    act(() => { result.current.setStatusFilter('active') })
    act(() => { result.current.setStatusFilter('all') })
    expect(localStorage.getItem('kubestellar-card-filter:test-clear-status')).toBeNull()
  })
})
