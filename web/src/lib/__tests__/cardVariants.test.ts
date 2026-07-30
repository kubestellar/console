import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useSingleSelectCluster,
  useChartFilters,
  useCascadingSelection,
  useStatusFilter,
} from '../cards/cardVariants'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: (...args: unknown[]) => mockUseGlobalFilters(...args),
}))

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
}))

vi.mock('../cards/cardFilters', async () => {
  const actual = await vi.importActual<typeof import('../cards/cardFilters')>('../cards/cardFilters')
  return {
    ...actual,
    LOCAL_FILTER_STORAGE_PREFIX: 'local-filter:',
    SINGLE_SELECT_STORAGE_PREFIX: 'single-select:',
  }
})

type MockCluster = { name: string; reachable?: boolean; healthy?: boolean }

const defaultGlobalFilters = {
  selectedClusters: [] as string[],
  setSelectedClusters: vi.fn(),
  isAllClustersSelected: true,
  filterByCluster: <T>(items: T[]) => items,
  filterByStatus: <T>(items: T[]) => items,
  customFilter: '',
}

const mockUseGlobalFilters = vi.fn(() => ({ ...defaultGlobalFilters }))

const defaultClusters: MockCluster[] = [
  { name: 'cluster-a', reachable: true, healthy: true },
  { name: 'cluster-b', reachable: true, healthy: true },
  { name: 'cluster-c', reachable: false, healthy: false },
]
const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: defaultClusters,
  isLoading: false,
}))

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockUseGlobalFilters.mockReturnValue({ ...defaultGlobalFilters })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: defaultClusters, isLoading: false })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// useSingleSelectCluster
// ---------------------------------------------------------------------------

describe('useSingleSelectCluster', () => {
  type Item = { cluster: string; name: string; status: string }

  const items: Item[] = [
    { cluster: 'cluster-a', name: 'app-1', status: 'Running' },
    { cluster: 'cluster-b', name: 'app-2', status: 'Failed' },
    { cluster: 'cluster-a', name: 'app-3', status: 'Running' },
  ]

  const config = {
    storageKey: 'test-hook',
    clusterField: 'cluster' as keyof Item,
    searchFields: ['name', 'status'] as (keyof Item)[],
  }

  it('initialises with empty selection and all items', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.selectedCluster).toBe('')
    expect(result.current.filtered).toHaveLength(3)
    expect(result.current.search).toBe('')
  })

  it('loads persisted selection from localStorage', () => {
    localStorage.setItem('single-select:test-hook', 'cluster-b')
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.selectedCluster).toBe('cluster-b')
  })

  it('persists selection to localStorage on setSelectedCluster', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('cluster-a') })
    expect(localStorage.getItem('single-select:test-hook')).toBe('cluster-a')
    expect(result.current.selectedCluster).toBe('cluster-a')
  })

  it('removes localStorage entry when selection cleared', () => {
    localStorage.setItem('single-select:test-hook', 'cluster-a')
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('') })
    expect(localStorage.getItem('single-select:test-hook')).toBeNull()
  })

  it('filters items by selected cluster', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSelectedCluster('cluster-a') })
    expect(result.current.filtered).toHaveLength(2)
    expect(result.current.filtered.every(i => i.cluster === 'cluster-a')).toBe(true)
  })

  it('filters items by local search query', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    act(() => { result.current.setSearch('app-2') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('app-2')
  })

  it('excludes unreachable clusters from availableClusters', () => {
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    // cluster-c is not reachable
    expect(result.current.availableClusters.map(c => c.name)).not.toContain('cluster-c')
    expect(result.current.availableClusters).toHaveLength(2)
  })

  it('respects global cluster filter when not all selected', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-a'],
    })
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.availableClusters.map(c => c.name)).toEqual(['cluster-a'])
  })

  it('isOutsideGlobalFilter when selection not in global filter', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-a'],
    })
    localStorage.setItem('single-select:test-hook', 'cluster-b')
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.isOutsideGlobalFilter).toBe(true)
  })

  it('isOutsideGlobalFilter is false when all clusters selected', () => {
    localStorage.setItem('single-select:test-hook', 'cluster-b')
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.isOutsideGlobalFilter).toBe(false)
  })

  it('applies globalCustomFilter text search across searchFields', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      customFilter: 'app-1',
    })
    const { result } = renderHook(() => useSingleSelectCluster(items, config))
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('app-1')
  })
})

// ---------------------------------------------------------------------------
// useChartFilters
// ---------------------------------------------------------------------------

describe('useChartFilters', () => {
  it('initialises with empty local filter', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.localClusterFilter).toEqual([])
    expect(result.current.showClusterFilter).toBe(false)
  })

  it('loads persisted filter from localStorage', () => {
    localStorage.setItem('local-filter:chart-key', JSON.stringify(['cluster-a']))
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    expect(result.current.localClusterFilter).toEqual(['cluster-a'])
  })

  it('toggleClusterFilter adds cluster to filter', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    expect(result.current.localClusterFilter).toContain('cluster-a')
  })

  it('toggleClusterFilter removes cluster already in filter', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    expect(result.current.localClusterFilter).not.toContain('cluster-a')
  })

  it('clearClusterFilter empties local filter', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    act(() => { result.current.clearClusterFilter() })
    expect(result.current.localClusterFilter).toHaveLength(0)
  })

  it('persists local filter to localStorage', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    const stored = localStorage.getItem('local-filter:chart-key')
    expect(JSON.parse(stored!)).toContain('cluster-a')
  })

  it('removes localStorage entry when filter cleared', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-key' }))
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    act(() => { result.current.clearClusterFilter() })
    expect(localStorage.getItem('local-filter:chart-key')).toBeNull()
  })

  it('setShowClusterFilter toggles dropdown visibility', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.setShowClusterFilter(true) })
    expect(result.current.showClusterFilter).toBe(true)
  })

  it('filteredClusters excludes unreachable clusters', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.filteredClusters.map(c => c.name)).not.toContain('cluster-c')
  })

  it('filteredClusters respects global cluster selection', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-a'],
    })
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.filteredClusters.map(c => c.name)).toEqual(['cluster-a'])
  })

  it('filteredClusters applies local filter when set', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('cluster-a') })
    expect(result.current.filteredClusters.map(c => c.name)).toEqual(['cluster-a'])
  })

  it('availableClusters includes all clusters when isAllClustersSelected', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.availableClusters).toHaveLength(3)
  })

  it('availableClusters filtered by global selection when active', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-b'],
    })
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.availableClusters.map(c => c.name)).toEqual(['cluster-b'])
  })

  it('expires stale local filter entries not in available clusters', () => {
    // Start with cluster-x in localStorage which doesn't exist
    localStorage.setItem('local-filter:stale-key', JSON.stringify(['cluster-x']))
    const { result } = renderHook(() => useChartFilters({ storageKey: 'stale-key' }))
    // After effect runs, stale entry should be removed
    expect(result.current.localClusterFilter).not.toContain('cluster-x')
  })

  it('dropdownStyle is null when showClusterFilter is false', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.dropdownStyle).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useCascadingSelection
// ---------------------------------------------------------------------------

describe('useCascadingSelection', () => {
  const config = { storageKey: 'cascade-test' }

  it('initialises with empty first and second level', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.selectedFirst).toBe('')
    expect(result.current.selectedSecond).toBe('')
  })

  it('loads persisted selections from localStorage', () => {
    localStorage.setItem('single-select:cascade-test-first', 'cluster-a')
    localStorage.setItem('single-select:cascade-test-second', 'release-1')
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.selectedFirst).toBe('cluster-a')
    expect(result.current.selectedSecond).toBe('release-1')
  })

  it('setSelectedFirst persists to localStorage and clears second', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedSecond('old-release') })
    act(() => { result.current.setSelectedFirst('cluster-b') })
    expect(localStorage.getItem('single-select:cascade-test-first')).toBe('cluster-b')
    expect(localStorage.getItem('single-select:cascade-test-second')).toBeNull()
    expect(result.current.selectedSecond).toBe('')
  })

  it('setSelectedFirst clears localStorage when empty string', () => {
    localStorage.setItem('single-select:cascade-test-first', 'cluster-a')
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('') })
    expect(localStorage.getItem('single-select:cascade-test-first')).toBeNull()
  })

  it('setSelectedSecond persists to localStorage', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedSecond('release-2') })
    expect(localStorage.getItem('single-select:cascade-test-second')).toBe('release-2')
    expect(result.current.selectedSecond).toBe('release-2')
  })

  it('setSelectedSecond clears localStorage when empty string', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedSecond('release-2') })
    act(() => { result.current.setSelectedSecond('') })
    expect(localStorage.getItem('single-select:cascade-test-second')).toBeNull()
  })

  it('resetSelection clears first and second', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('cluster-a') })
    act(() => { result.current.setSelectedSecond('release-x') })
    act(() => { result.current.resetSelection() })
    expect(result.current.selectedFirst).toBe('')
    expect(result.current.selectedSecond).toBe('')
  })

  it('availableFirstLevel includes all clusters when isAllClustersSelected', () => {
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel).toHaveLength(3)
  })

  it('availableFirstLevel filtered by global selection', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-a'],
    })
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel.map(c => c.name)).toEqual(['cluster-a'])
  })

  it('availableFirstLevel filtered by customFilter text', () => {
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      customFilter: 'cluster-b',
    })
    const { result } = renderHook(() => useCascadingSelection(config))
    expect(result.current.availableFirstLevel.map(c => c.name)).toEqual(['cluster-b'])
  })

  it('auto-selects first global cluster when filter activates and current not in filter', () => {
    // Start with all clusters selected, first = cluster-a
    const { result, rerender } = renderHook(() => useCascadingSelection(config))
    act(() => { result.current.setSelectedFirst('cluster-a') })

    // Activate global filter that excludes cluster-a
    mockUseGlobalFilters.mockReturnValue({
      ...defaultGlobalFilters,
      isAllClustersSelected: false,
      selectedClusters: ['cluster-b'],
    })
    rerender()

    expect(result.current.selectedFirst).toBe('cluster-b')
  })
})

// ---------------------------------------------------------------------------
// useStatusFilter
// ---------------------------------------------------------------------------

describe('useStatusFilter', () => {
  const statuses = ['all', 'running', 'failed', 'pending'] as const
  type Status = typeof statuses[number]

  const config = {
    statuses,
    defaultStatus: 'all' as Status,
  }

  it('initialises with defaultStatus', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    expect(result.current.statusFilter).toBe('all')
  })

  it('setStatusFilter updates filter', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    act(() => { result.current.setStatusFilter('running') })
    expect(result.current.statusFilter).toBe('running')
  })

  it('loads persisted status from localStorage', () => {
    localStorage.setItem('local-filter:deploy-status', 'failed')
    const { result } = renderHook(() => useStatusFilter({
      ...config,
      storageKey: 'deploy',
    }))
    expect(result.current.statusFilter).toBe('failed')
  })

  it('ignores invalid persisted status and uses defaultStatus', () => {
    localStorage.setItem('local-filter:deploy-status', 'zombie')
    const { result } = renderHook(() => useStatusFilter({
      ...config,
      storageKey: 'deploy',
    }))
    expect(result.current.statusFilter).toBe('all')
  })

  it('persists status to localStorage', () => {
    const { result } = renderHook(() => useStatusFilter({
      ...config,
      storageKey: 'deploy',
    }))
    act(() => { result.current.setStatusFilter('pending') })
    expect(localStorage.getItem('local-filter:deploy-status')).toBe('pending')
  })

  it('removes localStorage entry when status set to default', () => {
    const { result } = renderHook(() => useStatusFilter({
      ...config,
      storageKey: 'deploy',
    }))
    act(() => { result.current.setStatusFilter('failed') })
    act(() => { result.current.setStatusFilter('all') })
    expect(localStorage.getItem('local-filter:deploy-status')).toBeNull()
  })

  it('does not write to localStorage when no storageKey', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    act(() => { result.current.setStatusFilter('running') })
    expect(localStorage.length).toBe(0)
  })
})
