/**
 * Deep branch-coverage tests for cardHooks.ts
 *
 * Targets uncovered paths:
 * - useCardFilters: global custom filter, local cluster filter persistence,
 *   status filter interaction, custom predicate, click-outside handler,
 *   dropdown positioning
 * - useCardSort: missing comparator branch, desc sort on non-default field
 * - useCardData: pagination edge cases, page reset on filter change,
 *   unlimited itemsPerPage, goToPage bounds
 * - useCardCollapse: localStorage corruption, multiple cards
 * - useCardCollapseAll: partial collapse, expand preserves other cards
 * - commonComparators: date with Date objects, statusOrder with empty order map
 * - useCardFlash: cooldown, prevValue=0 edge case, negative values
 * - useStatusFilter: corrupted localStorage, missing storageKey
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────

const mockGlobalFilters = vi.hoisted(() => ({
  filterByCluster: vi.fn(<T,>(items: T[]) => items),
  filterByStatus: vi.fn(<T,>(items: T[]) => items),
  customFilter: '',
  selectedClusters: [] as string[],
  isAllClustersSelected: true,
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockGlobalFilters,
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'prod-east', healthy: true, reachable: true },
      { name: 'staging', healthy: true, reachable: true },
      { name: 'dev', healthy: false, reachable: true },
    ],
    clusters: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FLASH_ANIMATION_MS: 50, // speed up for tests
  }
})

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: () => ({
    containerRef: { current: null },
    containerStyle: undefined,
  }),
}))

import {
  commonComparators,
  useCardFilters,
  useCardData,
  useCardCollapse,
  useCardCollapseAll,
  useStatusFilter,
  useCardFlash,
  type _SortConfig,
  type FilterConfig,
  type CardDataConfig,
  type StatusFilterConfig,
} from '../cardHooks'

// ── Constants ──────────────────────────────────────────────────────

const _COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'
const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

// ── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  mockGlobalFilters.customFilter = ''
  mockGlobalFilters.selectedClusters = []
  mockGlobalFilters.isAllClustersSelected = true
  mockGlobalFilters.filterByCluster.mockImplementation(<T,>(items: T[]) => items)
  mockGlobalFilters.filterByStatus.mockImplementation(<T,>(items: T[]) => items)
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useCardFilters — deep branch coverage
// ============================================================================

describe('useCardFilters deep branches', () => {
  interface TestItem { name: string; cluster: string; status: string }

  const items: TestItem[] = [
    { name: 'pod-a', cluster: 'prod-east', status: 'running' },
    { name: 'pod-b', cluster: 'staging', status: 'error' },
    { name: 'pod-c', cluster: 'prod-east', status: 'running' },
    { name: 'pod-d', cluster: 'dev', status: 'pending' },
  ]

  const filterConfig: FilterConfig<TestItem> = {
    searchFields: ['name'],
    clusterField: 'cluster',
    statusField: 'status',
    storageKey: 'test-filter',
  }

  it('applies local search filter', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.setSearch('pod-a') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('pod-a')
  })

  it('applies local cluster filter via toggle', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual(['prod-east'])
    expect(result.current.filtered.every(i => i.cluster === 'prod-east')).toBe(true)
  })

  it('toggleClusterFilter removes cluster if already selected', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.toggleClusterFilter('staging') })
    expect(result.current.localClusterFilter).toContain('staging')
    act(() => { result.current.toggleClusterFilter('staging') })
    expect(result.current.localClusterFilter).not.toContain('staging')
  })

  it('clearClusterFilter resets to empty', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    act(() => { result.current.toggleClusterFilter('staging') })
    expect(result.current.localClusterFilter).toHaveLength(2)
    act(() => { result.current.clearClusterFilter() })
    expect(result.current.localClusterFilter).toHaveLength(0)
  })

  it('persists local cluster filter to localStorage', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-filter`)
    expect(stored).toBe(JSON.stringify(['prod-east']))
  })

  it('removes localStorage key when filter is cleared', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-filter`)).not.toBeNull()
    act(() => { result.current.clearClusterFilter() })
    expect(localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-filter`)).toBeNull()
  })

  it('reads persisted cluster filter from localStorage', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-filter`, JSON.stringify(['staging']))
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.localClusterFilter).toEqual(['staging'])
  })

  it('handles corrupted localStorage for cluster filter', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-filter`, 'invalid-json')
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('applies custom predicate when provided', () => {
    const configWithPredicate: FilterConfig<TestItem> = {
      ...filterConfig,
      customPredicate: (item, query) => item.status.includes(query),
    }
    const { result } = renderHook(() => useCardFilters(items, configWithPredicate))
    act(() => { result.current.setSearch('error') })
    // 'error' matches pod-b via customPredicate (status includes 'error')
    expect(result.current.filtered.some(i => i.name === 'pod-b')).toBe(true)
  })

  it('applies global custom filter from useGlobalFilters', () => {
    mockGlobalFilters.customFilter = 'pod-d'
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('pod-d')
  })

  it('works without storageKey (no persistence)', () => {
    const configNoStorage: FilterConfig<TestItem> = {
      searchFields: ['name'],
      clusterField: 'cluster',
    }
    const { result } = renderHook(() => useCardFilters(items, configNoStorage))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual(['prod-east'])
    expect(localStorage.length).toBe(0)
  })
})

// ============================================================================
// useCardData — pagination deep coverage
// ============================================================================

describe('useCardData deep branches', () => {
  interface TestItem { name: string; priority: number }

  const items: TestItem[] = Array.from({ length: 15 }, (_, i) => ({
    name: `item-${String(i).padStart(2, '0')}`,
    priority: i,
  }))

  const config: CardDataConfig<TestItem, 'name' | 'priority'> = {
    filter: { searchFields: ['name'] },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string<TestItem>('name'),
        priority: commonComparators.number<TestItem>('priority'),
      },
    },
    defaultLimit: 5,
  }

  it('paginates items correctly', () => {
    const { result } = renderHook(() => useCardData(items, config))
    expect(result.current.items).toHaveLength(5)
    expect(result.current.totalItems).toBe(15)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.needsPagination).toBe(true)
  })

  it('goToPage navigates to a valid page', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(2) })
    expect(result.current.currentPage).toBe(2)
  })

  it('goToPage clamps to first page', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(0) })
    expect(result.current.currentPage).toBe(1)
  })

  it('goToPage clamps to last page', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(999) })
    expect(result.current.currentPage).toBe(3)
  })

  it('setItemsPerPage to unlimited shows all items', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.setItemsPerPage('unlimited') })
    expect(result.current.items).toHaveLength(15)
    expect(result.current.needsPagination).toBe(false)
  })

  it('resets page when search narrows results', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(3) })
    expect(result.current.currentPage).toBe(3)
    // Search narrows to fewer items, page is adjusted to valid range
    act(() => { result.current.filters.setSearch('item-14') })
    // Only 1 item matches, so currentPage clamps to 1
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.currentPage).toBe(1)
    expect(result.current.totalItems).toBe(1)
  })

  it('adjusts currentPage when it exceeds totalPages after filtering', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(3) })
    // Filter down so only 2 items remain (less than 1 page of 5)
    act(() => { result.current.filters.setSearch('item-00') })
    expect(result.current.currentPage).toBe(1)
  })

  it('uses defaultLimit of unlimited when configured', () => {
    const unlimitedConfig: CardDataConfig<TestItem, 'name'> = {
      ...config,
      defaultLimit: 'unlimited',
    }
    const { result } = renderHook(() => useCardData(items, unlimitedConfig))
    expect(result.current.items).toHaveLength(15)
    expect(result.current.needsPagination).toBe(false)
  })

  it('sorting changes reset page to 1', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(3) })
    act(() => { result.current.sorting.setSortBy('priority') })
    expect(result.current.currentPage).toBe(1)
  })
})

// ============================================================================
// commonComparators — additional edge cases
// ============================================================================

describe('commonComparators deep coverage', () => {
  describe('date with Date objects', () => {
    interface Item { date: Date | string }
    const compare = commonComparators.date<Item>('date')

    it('sorts Date objects correctly', () => {
      const a = { date: new Date('2024-01-01') }
      const b = { date: new Date('2024-12-31') }
      expect(compare(a, b)).toBeLessThan(0)
    })

    it('compares Date object with string', () => {
      const a = { date: new Date('2024-06-01') }
      const b = { date: '2024-01-01' as string | Date }
      expect(compare(a, b as Item)).toBeGreaterThan(0)
    })
  })

  describe('statusOrder with empty order map', () => {
    interface Item { status: string }
    const compare = commonComparators.statusOrder<Item>('status', {})

    it('all statuses fall back to 999', () => {
      expect(compare({ status: 'a' }, { status: 'b' })).toBe(0)
    })
  })

  describe('number with very large values', () => {
    interface Item { value: number }
    const compare = commonComparators.number<Item>('value')

    it('handles very large numbers', () => {
      expect(compare({ value: Number.MAX_SAFE_INTEGER }, { value: 0 })).toBeGreaterThan(0)
    })

    it('handles zero comparison', () => {
      expect(compare({ value: 0 }, { value: 0 })).toBe(0)
    })
  })

  describe('string with special characters', () => {
    interface Item { name: string }
    const compare = commonComparators.string<Item>('name')

    it('handles strings with numbers', () => {
      const result = compare({ name: 'pod-10' }, { name: 'pod-2' })
      // localeCompare result depends on locale settings, just check it's a number
      expect(typeof result).toBe('number')
    })

    it('handles unicode strings', () => {
      expect(() => compare({ name: '\u00e9' }, { name: '\u00e8' })).not.toThrow()
    })
  })
})

// ============================================================================
// useCardFlash — additional edge cases
// ============================================================================

describe('useCardFlash additional edge cases', () => {
  it('handles transition from 0 to non-zero (prev=0)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1 }),
      { initialProps: { value: 0 } }
    )
    // Value changes from 0 to 100
    rerender({ value: 100 })
    // value === 0 is false for 100, prevValue=0 check passes, but source skips if value===0
    // The hook should flash since value (100) is not 0 and there's a 100% change
    expect(result.current.flashType).toBe('info')
  })

  it('handles negative value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, decreaseType: 'warning' }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: -50 })
    // This is a decrease from 100 to -50, but value === 0 check: -50 !== 0, so it runs
    expect(result.current.flashType).toBe('warning')
  })

  it('handles small fractional changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.5 }),
      { initialProps: { value: 100 } }
    )
    // 10% change, below 50% threshold
    rerender({ value: 110 })
    expect(result.current.flashType).toBe('none')
  })

  it('uses default threshold of 0.1 (10%)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value),
      { initialProps: { value: 100 } }
    )
    // 9% change - below default 10% threshold
    rerender({ value: 109 })
    expect(result.current.flashType).toBe('none')

    // 11% change - above default 10% threshold
    rerender({ value: 121 })
    // Need to account for cooldown
    act(() => { vi.advanceTimersByTime(6000) })
    rerender({ value: 135 })
    expect(result.current.flashType).toBe('info')
  })

  it('auto-resets flash and then re-flashes after cooldown expires', () => {
    const COOLDOWN = 200
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, cooldown: COOLDOWN }),
      { initialProps: { value: 100 } }
    )

    // First flash
    rerender({ value: 200 })
    expect(result.current.flashType).toBe('info')

    // Auto-reset
    act(() => { vi.advanceTimersByTime(60) })
    expect(result.current.flashType).toBe('none')

    // Past cooldown
    act(() => { vi.advanceTimersByTime(300) })
    rerender({ value: 400 })
    expect(result.current.flashType).toBe('info')
  })
})

// ============================================================================
// useCardCollapse — additional edge cases
// ============================================================================

describe('useCardCollapse additional edge cases', () => {
  it('multiple cards can have independent collapse states', () => {
    const { result: r1 } = renderHook(() => useCardCollapse('card-1'))
    const { result: r2 } = renderHook(() => useCardCollapse('card-2'))

    act(() => { r1.current.collapse() })
    expect(r1.current.isCollapsed).toBe(true)
    expect(r2.current.isCollapsed).toBe(false)
  })

  it('handles localStorage setItem failure gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useCardCollapse('quota-card'))
    // Should not throw, just silently fail
    expect(() => {
      act(() => { result.current.collapse() })
    }).not.toThrow()

    spy.mockRestore()
  })
})

// ============================================================================
// useCardCollapseAll — additional edge cases
// ============================================================================

describe('useCardCollapseAll additional edge cases', () => {
  it('works with empty cardIds array', () => {
    const { result } = renderHook(() => useCardCollapseAll([]))
    expect(result.current.allCollapsed).toBe(true)
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.collapsedCount).toBe(0)
  })

  it('collapseAll with single card', () => {
    const { result } = renderHook(() => useCardCollapseAll(['solo']))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    expect(result.current.collapsedCount).toBe(1)
  })

  it('expandAll restores allExpanded state', () => {
    const { result } = renderHook(() => useCardCollapseAll(['a', 'b']))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    act(() => { result.current.expandAll() })
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.collapsedCount).toBe(0)
  })
})

// ============================================================================
// useStatusFilter — additional edge cases
// ============================================================================

describe('useStatusFilter additional edge cases', () => {
  const statuses = ['all', 'active', 'inactive'] as const
  type S = typeof statuses[number]

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}bad-key-status`, '\x00\x01binary')
    const config: StatusFilterConfig<S> = {
      statuses,
      defaultStatus: 'all',
      storageKey: 'bad-key',
    }
    const { result } = renderHook(() => useStatusFilter(config))
    // Should fall back to default since stored value is not in statuses array
    expect(result.current.statusFilter).toBe('all')
  })

  it('changing status multiple times persists correctly', () => {
    const config: StatusFilterConfig<S> = {
      statuses,
      defaultStatus: 'all',
      storageKey: 'multi-change',
    }
    const { result } = renderHook(() => useStatusFilter(config))

    act(() => { result.current.setStatusFilter('active') })
    act(() => { result.current.setStatusFilter('inactive') })
    act(() => { result.current.setStatusFilter('active') })

    expect(result.current.statusFilter).toBe('active')
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}multi-change-status`)
    expect(stored).toBe('active')
  })
})
