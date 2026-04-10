/**
 * cardHooks-variants.test.ts
 *
 * Expanded tests targeting uncovered statement branches in cardHooks.ts:
 *
 * - useSingleSelectCluster: localStorage persistence, cluster selection,
 *   global filter interaction, search filtering, isOutsideGlobalFilter
 * - useChartFilters: localStorage init, toggle/clear, dropdown positioning,
 *   click-outside handler, filteredClusters with global/local filters
 * - useCascadingSelection: two-level selection, localStorage persistence,
 *   global filter sync (save/restore), customFilter on available clusters,
 *   resetSelection
 * - useCardData: undefined config guard, page clamping, filter/sort reset
 * - useCardFilters: global customFilter + local search combined,
 *   statusField filtering, showClusterFilter / dropdown positioning
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGlobalFilters = vi.hoisted(() => ({
  filterByCluster: vi.fn(<T,>(items: T[]) => items),
  filterByStatus: vi.fn(<T,>(items: T[]) => items),
  customFilter: '' as string,
  selectedClusters: [] as string[],
  isAllClustersSelected: true,
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockGlobalFilters,
}))

const mockDeduplicatedClusters = vi.hoisted(() => ({
  value: [
    { name: 'prod-east', reachable: true, healthy: true, context: 'ctx-prod' },
    { name: 'staging', reachable: true, healthy: true, context: 'ctx-stg' },
    { name: 'dev', reachable: false, healthy: false, context: 'ctx-dev' },
    { name: 'gpu-cluster', reachable: true, healthy: true, context: 'ctx-gpu' },
  ] as Array<{ name: string; reachable: boolean; healthy: boolean; context?: string }>,
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockDeduplicatedClusters.value,
    clusters: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../constants/network', () => ({
  FLASH_ANIMATION_MS: 50,
}))

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: () => ({
    containerRef: { current: null },
    containerStyle: undefined,
  }),
}))

import {
  useSingleSelectCluster,
  useChartFilters,
  useCascadingSelection,
  useCardFilters,
  useCardData,
  useCardSort,
  commonComparators,
  type SingleSelectConfig,
  type _ChartFilterConfig,
  type CascadingSelectionConfig,
  type FilterConfig,
  type CardDataConfig,
} from '../cardHooks'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'
const SINGLE_SELECT_STORAGE_PREFIX = 'kubestellar-single-select:'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  mockGlobalFilters.customFilter = ''
  mockGlobalFilters.selectedClusters = []
  mockGlobalFilters.isAllClustersSelected = true
  mockGlobalFilters.filterByCluster.mockImplementation(<T,>(items: T[]) => items)
  mockGlobalFilters.filterByStatus.mockImplementation(<T,>(items: T[]) => items)
  mockDeduplicatedClusters.value = [
    { name: 'prod-east', reachable: true, healthy: true, context: 'ctx-prod' },
    { name: 'staging', reachable: true, healthy: true, context: 'ctx-stg' },
    { name: 'dev', reachable: false, healthy: false, context: 'ctx-dev' },
    { name: 'gpu-cluster', reachable: true, healthy: true, context: 'ctx-gpu' },
  ]
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

// ============================================================================
// useSingleSelectCluster
// ============================================================================

describe('useSingleSelectCluster', () => {
  interface TestItem { name: string; cluster: string; status: string }

  const items: TestItem[] = [
    { name: 'pod-a', cluster: 'prod-east', status: 'running' },
    { name: 'pod-b', cluster: 'staging', status: 'error' },
    { name: 'pod-c', cluster: 'prod-east', status: 'running' },
    { name: 'pod-d', cluster: 'gpu-cluster', status: 'pending' },
  ]

  const config: SingleSelectConfig<TestItem> = {
    storageKey: 'test-single',
    clusterField: 'cluster',
    searchFields: ['name', 'status'],
  }

  it('starts with no cluster selected (empty string)', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.selectedCluster).toBe('')
    expect(result.current.filtered).toHaveLength(items.length)
  })

  it('filters items by selected cluster', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('prod-east') })
    expect(result.current.selectedCluster).toBe('prod-east')
    expect(result.current.filtered.every(i => i.cluster === 'prod-east')).toBe(true)
  })

  it('persists selection to localStorage', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('staging') })
    const stored = localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`)
    expect(stored).toBe('staging')
  })

  it('reads persisted selection from localStorage', () => {
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`, 'gpu-cluster')
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.selectedCluster).toBe('gpu-cluster')
  })

  it('removes localStorage when cluster is cleared', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('prod-east') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`)).toBe('prod-east')
    act(() => { result.current.setSelectedCluster('') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`)).toBeNull()
  })

  it('only shows reachable clusters in availableClusters', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    // dev is reachable=false, should be excluded
    expect(result.current.availableClusters.some(c => c.name === 'dev')).toBe(false)
    expect(result.current.availableClusters.some(c => c.name === 'prod-east')).toBe(true)
  })

  it('respects global cluster filter for availableClusters', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.availableClusters).toHaveLength(1)
    expect(result.current.availableClusters[0].name).toBe('staging')
  })

  it('isOutsideGlobalFilter is true when selection is not in global filter', () => {
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`, 'prod-east')
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.isOutsideGlobalFilter).toBe(true)
  })

  it('isOutsideGlobalFilter is false when all clusters selected', () => {
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`, 'prod-east')
    mockGlobalFilters.isAllClustersSelected = true
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.isOutsideGlobalFilter).toBe(false)
  })

  it('isOutsideGlobalFilter is false when no cluster is selected', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.isOutsideGlobalFilter).toBe(false)
  })

  it('applies global custom filter to results', () => {
    mockGlobalFilters.customFilter = 'pod-a'
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('pod-a')
  })

  it('applies local search filter to results', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSearch('error') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].status).toBe('error')
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}test-single`, '\x00bad')
    // Should not throw; just use the raw stored value (it is a string, not JSON)
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    // It reads as the string, no crash
    expect(typeof result.current.selectedCluster).toBe('string')
  })
})

// ============================================================================
// useChartFilters
// ============================================================================

describe('useChartFilters', () => {
  it('starts with empty local cluster filter', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('toggleClusterFilter adds a cluster', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual(['prod-east'])
  })

  it('toggleClusterFilter removes an already-selected cluster', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('clearClusterFilter resets to empty', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    act(() => { result.current.toggleClusterFilter('staging') })
    act(() => { result.current.clearClusterFilter() })
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('persists local filter to localStorage when storageKey is set', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-test' }))
    act(() => { result.current.toggleClusterFilter('staging') })
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-test`)
    expect(stored).toBe(JSON.stringify(['staging']))
  })

  it('removes localStorage key when filter is cleared', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-clear' }))
    act(() => { result.current.toggleClusterFilter('staging') })
    expect(localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-clear`)).not.toBeNull()
    act(() => { result.current.clearClusterFilter() })
    expect(localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-clear`)).toBeNull()
  })

  it('reads persisted cluster filter from localStorage', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-init`, JSON.stringify(['gpu-cluster']))
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-init' }))
    expect(result.current.localClusterFilter).toEqual(['gpu-cluster'])
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-bad`, 'not-json')
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-bad' }))
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('filteredClusters excludes unreachable clusters', () => {
    const { result } = renderHook(() => useChartFilters())
    // dev is reachable=false
    expect(result.current.filteredClusters.some(c => c.name === 'dev')).toBe(false)
  })

  it('filteredClusters applies global cluster selection', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.filteredClusters).toHaveLength(1)
    expect(result.current.filteredClusters[0].name).toBe('staging')
  })

  it('filteredClusters applies local cluster filter on top of global', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.filteredClusters).toHaveLength(1)
    expect(result.current.filteredClusters[0].name).toBe('prod-east')
  })

  it('availableClusters shows all when isAllClustersSelected', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.availableClusters).toHaveLength(mockDeduplicatedClusters.value.length)
  })

  it('availableClusters respects global filter', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['prod-east', 'gpu-cluster']
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.availableClusters).toHaveLength(2)
  })

  it('showClusterFilter defaults to false', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.showClusterFilter).toBe(false)
  })

  it('dropdownStyle is null when dropdown not shown', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.dropdownStyle).toBeNull()
  })
})

// ============================================================================
// useCascadingSelection
// ============================================================================

describe('useCascadingSelection', () => {
  const config: CascadingSelectionConfig = { storageKey: 'cascade-test' }

  it('starts with empty selections', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.selectedFirst).toBe('')
    expect(result.current.selectedSecond).toBe('')
  })

  it('setSelectedFirst sets first level', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    expect(result.current.selectedFirst).toBe('prod-east')
  })

  it('setSelectedFirst clears second level', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedSecond('release-1') })
    expect(result.current.selectedSecond).toBe('release-1')
    act(() => { result.current.setSelectedFirst('staging') })
    expect(result.current.selectedSecond).toBe('')
  })

  it('setSelectedSecond sets second level', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedSecond('item-x') })
    expect(result.current.selectedSecond).toBe('item-x')
  })

  it('persists first-level selection to localStorage', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('staging') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-first`)).toBe('staging')
  })

  it('persists second-level selection to localStorage', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedSecond('release-2') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-second`)).toBe('release-2')
  })

  it('clears first-level from localStorage when empty', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedFirst('') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-first`)).toBeNull()
  })

  it('clears second-level from localStorage when first changes', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedSecond('r1') })
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-second`)).toBe('r1')
    act(() => { result.current.setSelectedFirst('staging') })
    // Second-level localStorage should be cleared
    expect(localStorage.getItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-second`)).toBeNull()
  })

  it('reads persisted selections from localStorage', () => {
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-first`, 'gpu-cluster')
    localStorage.setItem(`${SINGLE_SELECT_STORAGE_PREFIX}cascade-test-second`, 'item-y')
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.selectedFirst).toBe('gpu-cluster')
    expect(result.current.selectedSecond).toBe('item-y')
  })

  it('resetSelection clears both selections', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedSecond('r1') })
    act(() => { result.current.resetSelection() })
    expect(result.current.selectedFirst).toBe('')
    expect(result.current.selectedSecond).toBe('')
  })

  it('availableFirstLevel respects global cluster filter', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel).toHaveLength(1)
    expect(result.current.availableFirstLevel[0].name).toBe('staging')
  })

  it('availableFirstLevel respects customFilter', () => {
    mockGlobalFilters.customFilter = 'gpu'
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel).toHaveLength(1)
    expect(result.current.availableFirstLevel[0].name).toBe('gpu-cluster')
  })

  it('availableFirstLevel filters by context with customFilter', () => {
    mockGlobalFilters.customFilter = 'ctx-stg'
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel).toHaveLength(1)
    expect(result.current.availableFirstLevel[0].name).toBe('staging')
  })

  it('global filter activation saves and auto-selects first available', () => {
    const { result, rerender } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedSecond('r1') })

    // Activate global filter that does not include current selection
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    rerender()

    // Should auto-select first cluster from global filter
    expect(result.current.selectedFirst).toBe('staging')
  })

  it('global filter deactivation restores previous selection', () => {
    const { result, rerender } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('prod-east') })
    act(() => { result.current.setSelectedSecond('r1') })

    // Activate global filter
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    rerender()

    // Deactivate global filter
    mockGlobalFilters.isAllClustersSelected = true
    mockGlobalFilters.selectedClusters = []
    rerender()

    // Should restore original selection
    expect(result.current.selectedFirst).toBe('prod-east')
    expect(result.current.selectedSecond).toBe('r1')
  })
})

// ============================================================================
// useCardFilters — global customFilter + local search combined
// ============================================================================

describe('useCardFilters — combined filter paths', () => {
  interface TestItem { name: string; cluster: string; status: string }

  const items: TestItem[] = [
    { name: 'alpha', cluster: 'prod-east', status: 'running' },
    { name: 'beta', cluster: 'staging', status: 'failed' },
    { name: 'gamma', cluster: 'prod-east', status: 'running' },
    { name: 'delta', cluster: 'dev', status: 'pending' },
  ]

  const filterConfig: FilterConfig<TestItem> = {
    searchFields: ['name', 'cluster'],
    clusterField: 'cluster',
    statusField: 'status',
    storageKey: 'combined-test',
  }

  it('combines global customFilter and local search', () => {
    mockGlobalFilters.customFilter = 'prod'
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    // Global filter matches alpha and gamma (cluster=prod-east)
    // Then add local search
    act(() => { result.current.setSearch('alpha') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('alpha')
  })

  it('custom predicate used by global customFilter', () => {
    const configWithPredicate: FilterConfig<TestItem> = {
      ...filterConfig,
      customPredicate: (_item, query) => query === 'magic',
    }
    mockGlobalFilters.customFilter = 'magic'
    const { result } = renderHook(() => useCardFilters(items, configWithPredicate))
    // All items match because customPredicate returns true for 'magic'
    expect(result.current.filtered).toHaveLength(items.length)
  })

  it('showClusterFilter toggle works', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.showClusterFilter).toBe(false)
    act(() => { result.current.setShowClusterFilter(true) })
    expect(result.current.showClusterFilter).toBe(true)
  })

  it('works with empty searchFields', () => {
    const noSearchConfig: FilterConfig<TestItem> = {
      searchFields: [],
      clusterField: 'cluster',
    }
    const { result } = renderHook(() => useCardFilters(items, noSearchConfig))
    act(() => { result.current.setSearch('alpha') })
    // No searchFields, so no match
    expect(result.current.filtered).toHaveLength(0)
  })
})

// ============================================================================
// useCardData — undefined config + pagination edge cases
// ============================================================================

describe('useCardData — additional coverage', () => {
  interface TestItem { name: string; value: number }

  const items: TestItem[] = Array.from({ length: 12 }, (_, i) => ({
    name: `item-${String(i).padStart(2, '0')}`,
    value: i,
  }))

  const config: CardDataConfig<TestItem, 'name' | 'value'> = {
    filter: { searchFields: ['name'] },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string<TestItem>('name'),
        value: commonComparators.number<TestItem>('value'),
      },
    },
    defaultLimit: 5,
  }

  it('handles undefined config without crashing', () => {
    const { result } = renderHook(() =>
      useCardData(items, undefined as unknown as CardDataConfig<TestItem, 'name'>)
    )
    // Should not crash; items returned as-is (no sort, no pagination)
    expect(result.current.items.length).toBeGreaterThan(0)
  })

  it('currentPage adjusts down when totalPages decreases', () => {
    const { result } = renderHook(() => useCardData(items, config))
    // Go to page 3 (12 items / 5 per page = 3 pages)
    act(() => { result.current.goToPage(3) })
    expect(result.current.currentPage).toBe(3)

    // Search to narrow results to 2 items (< 1 page)
    act(() => { result.current.filters.setSearch('item-00') })
    expect(result.current.currentPage).toBe(1)
  })

  it('setItemsPerPage changes page size', () => {
    const { result } = renderHook(() => useCardData(items, config))
    expect(result.current.itemsPerPage).toBe(5)
    act(() => { result.current.setItemsPerPage(10) })
    expect(result.current.itemsPerPage).toBe(10)
    expect(result.current.items).toHaveLength(10)
  })

  // ── localStorage persistence (#6203 follow-up to #6199 / #6070) ──────────
  // The four tests below assert the round-trip added in #6199:
  //   1. setItemsPerPage writes to kubestellar-card-limit:<key>
  //   2. A subsequent renderHook reads it back as the initial value
  //   3. Missing key falls back to defaultLimit
  //   4. The literal 'unlimited' round-trips correctly

  describe('itemsPerPage persistence to localStorage (#6203)', () => {
    const STORAGE_PREFIX = 'kubestellar-card-limit:'
    const STORAGE_KEY = 'test-persistence-card'

    const persistConfig: CardDataConfig<TestItem, 'name' | 'value'> = {
      ...config,
      filter: { searchFields: ['name'], storageKey: STORAGE_KEY },
    }

    beforeEach(() => {
      localStorage.removeItem(`${STORAGE_PREFIX}${STORAGE_KEY}`)
    })

    it('writes setItemsPerPage value through to localStorage', () => {
      const { result } = renderHook(() => useCardData(items, persistConfig))
      act(() => { result.current.setItemsPerPage(7) })
      expect(localStorage.getItem(`${STORAGE_PREFIX}${STORAGE_KEY}`)).toBe('7')
    })

    it('reads persisted itemsPerPage as initial value on next mount', () => {
      localStorage.setItem(`${STORAGE_PREFIX}${STORAGE_KEY}`, '8')
      const { result } = renderHook(() => useCardData(items, persistConfig))
      // Should be 8 from storage, NOT defaultLimit (5) from config
      expect(result.current.itemsPerPage).toBe(8)
    })

    it('falls back to defaultLimit when no value is persisted', () => {
      // No localStorage entry exists (cleared in beforeEach)
      const { result } = renderHook(() => useCardData(items, persistConfig))
      expect(result.current.itemsPerPage).toBe(5)
    })

    it('round-trips the literal "unlimited" value', () => {
      const { result } = renderHook(() => useCardData(items, persistConfig))
      act(() => { result.current.setItemsPerPage('unlimited') })
      expect(localStorage.getItem(`${STORAGE_PREFIX}${STORAGE_KEY}`)).toBe('unlimited')
      // Mount a fresh hook and check it reads back as 'unlimited'
      const { result: result2 } = renderHook(() => useCardData(items, persistConfig))
      expect(result2.current.itemsPerPage).toBe('unlimited')
    })

    it('does not persist when storageKey is missing', () => {
      // config (without storageKey) should NOT touch localStorage
      const { result } = renderHook(() => useCardData(items, config))
      act(() => { result.current.setItemsPerPage(9) })
      // No write should happen for the test-persistence-card key OR any other
      expect(localStorage.getItem(`${STORAGE_PREFIX}${STORAGE_KEY}`)).toBeNull()
    })
  })

  it('goToPage clamps to min 1', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(-5) })
    expect(result.current.currentPage).toBe(1)
  })

  it('sorting change preserves currentPage', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(2) })
    expect(result.current.currentPage).toBe(2)
    act(() => { result.current.sorting.setSortBy('value') })
    // Sort no longer resets page — user stays on current page (#5209)
    expect(result.current.currentPage).toBe(2)
  })

  it('local cluster filter change resets page to 1', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(2) })
    // Local cluster filter change triggers page reset via useEffect
    act(() => { result.current.filters.toggleClusterFilter('prod') })
    expect(result.current.currentPage).toBe(1)
  })
})

// ============================================================================
// useCardSort — desc default direction
// ============================================================================

describe('useCardSort — desc defaultDirection', () => {
  interface TestItem { name: string }
  const items: TestItem[] = [{ name: 'c' }, { name: 'a' }, { name: 'b' }]

  it('starts in desc order when defaultDirection is desc', () => {
    const { result } = renderHook(() =>
      useCardSort(items, {
        defaultField: 'name' as const,
        defaultDirection: 'desc',
        comparators: {
          name: commonComparators.string<TestItem>('name'),
        },
      })
    )
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.sorted[0].name).toBe('c')
  })
})
