import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Hoisted mocks -- must be created before any import resolution
// ---------------------------------------------------------------------------
const mockUseClusters = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    deduplicatedClusters: [
      { name: 'cluster-a', context: 'cluster-a', server: 'https://a.example.com' },
      { name: 'cluster-b', context: 'cluster-b', server: 'https://b.example.com' },
    ],
    clusters: [],
    isLoading: false,
    error: null,
  }),
)

const mockEmitCluster = vi.hoisted(() => vi.fn())
const mockEmitSeverity = vi.hoisted(() => vi.fn())
const mockEmitStatus = vi.hoisted(() => vi.fn())

vi.mock('../mcp/clusters', () => ({
  useClusters: mockUseClusters,
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitGlobalClusterFilterChanged: mockEmitCluster,
  emitGlobalSeverityFilterChanged: mockEmitSeverity,
  emitGlobalStatusFilterChanged: mockEmitStatus,
}
))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import {
  GlobalFiltersProvider,
  useGlobalFilters,
  SEVERITY_LEVELS,
  STATUS_LEVELS,
} from '../useGlobalFilters'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function wrapper({ children }: { children: ReactNode }) {
  return <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
}

// Sample items covering all four filter dimensions
const SAMPLE_ITEMS = [
  { name: 'pod-alpha',   cluster: 'cluster-a', severity: 'critical', status: 'running' },
  { name: 'pod-beta',    cluster: 'cluster-a', severity: 'warning',  status: 'failed'  },
  { name: 'pod-gamma',   cluster: 'cluster-b', severity: 'info',     status: 'pending' },
  { name: 'pod-delta',   cluster: 'cluster-b', severity: 'critical', status: 'running' },
  { name: 'pod-epsilon', cluster: 'cluster-a', severity: 'info',     status: 'bound'   },
]

// ===========================================================================
// Setup
// ===========================================================================
beforeEach(() => {
  localStorage.clear()
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: [
      { name: 'cluster-a', context: 'cluster-a', server: 'https://a.example.com' },
      { name: 'cluster-b', context: 'cluster-b', server: 'https://b.example.com' },
    ],
    clusters: [],
    isLoading: false,
    error: null,
  })
  mockEmitCluster.mockClear()
  mockEmitSeverity.mockClear()
  mockEmitStatus.mockClear()
})


describe('filterItems -- no active filters', () => {
  it('returns all items when no filters are set', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('returns empty array when given empty array', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterItems([])).toEqual([])
  })
})

describe('filterItems -- cluster filter', () => {
  it('filters items by a single selected cluster', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => item.cluster === 'cluster-a')).toBe(true)
    expect(filtered.length).toBe(3)
  })

  it('returns all items when all clusters are selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.selectAllClusters()
    })

    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })
})

describe('filterItems -- severity filter', () => {
  it('filters items by a single severity', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => item.severity === 'critical')).toBe(true)
    expect(filtered.length).toBe(2)
  })

  it('filters items by multiple severities', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical', 'warning'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => ['critical', 'warning'].includes(item.severity))).toBe(true)
    expect(filtered.length).toBe(3)
  })
})

describe('filterItems -- status filter', () => {
  it('filters items by a single status', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => item.status === 'running')).toBe(true)
    expect(filtered.length).toBe(2)
  })

  it('filters items by multiple statuses', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running', 'failed'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => ['running', 'failed'].includes(item.status))).toBe(true)
    expect(filtered.length).toBe(3)
  })

  it('returns empty array when no statuses match', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['init'])
    })

    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual([])
  })

  it('status filter is independent from cluster filter', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.some(item => item.cluster === 'cluster-a')).toBe(true)
    expect(filtered.some(item => item.cluster === 'cluster-b')).toBe(true)
  })
})

describe('filterItems -- custom text filter', () => {
  it('filters items by name using custom text', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('alpha')
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-alpha')
  })

  it('filters items case-insensitively', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('ALPHA')
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-alpha')
  })

  it('returns empty array when no items match the custom text', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('zzz-no-match')
    })

    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual([])
  })

  it('returns all items when custom text filter is cleared', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('alpha')
    })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toHaveLength(1)

    act(() => {
      result.current.clearCustomFilter()
    })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toHaveLength(SAMPLE_ITEMS.length)
  })

  it('matches items with cluster field via custom text', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('cluster-b')
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered.every(item => item.cluster === 'cluster-b')).toBe(true)
  })
})

describe('filterItems -- all four filters combined', () => {
  it('applies cluster + severity + status + custom text in sequence', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedSeverities(['critical'])
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('alpha')
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-alpha')
    expect(filtered[0].cluster).toBe('cluster-a')
    expect(filtered[0].severity).toBe('critical')
    expect(filtered[0].status).toBe('running')
  })

  it('returns empty array when combined filters produce no matches', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedStatuses(['pending']) // cluster-a has no pending items
    })

    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual([])
  })

  it('clearing all filters returns all items', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedSeverities(['critical'])
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('alpha')
    })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toHaveLength(1)

    act(() => {
      result.current.clearAllFilters()
    })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toHaveLength(SAMPLE_ITEMS.length)
  })
})

// ===========================================================================
// isFiltered flag
// ===========================================================================
describe('isFiltered flag', () => {
  it('is false when no filters are active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isFiltered).toBe(false)
  })

  it('is true when a cluster filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.isFiltered).toBe(true)
  })

  it('is true when a severity filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    expect(result.current.isFiltered).toBe(true)
  })

  it('is true when a status filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    expect(result.current.isFiltered).toBe(true)
  })

  it('is true when a custom text filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('alpha')
    })

    expect(result.current.isFiltered).toBe(true)
  })

  it('is false after clearAllFilters', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedSeverities(['critical'])
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('test')
    })
    expect(result.current.isFiltered).toBe(true)

    act(() => {
      result.current.clearAllFilters()
    })
    expect(result.current.isFiltered).toBe(false)
  })

  it('is true when only one of multiple filter dimensions is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Only severity is filtered, rest are all-selected
    act(() => {
      result.current.setSelectedSeverities(['warning'])
    })

    expect(result.current.isFiltered).toBe(true)
    expect(result.current.isClustersFiltered).toBe(false)
    expect(result.current.isSeveritiesFiltered).toBe(true)
    expect(result.current.isStatusesFiltered).toBe(false)
    expect(result.current.hasCustomFilter).toBe(false)
  })
})

// ===========================================================================
// clearAllFilters
// ===========================================================================
describe('clearAllFilters', () => {
  it('resets all four filter dimensions simultaneously', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedSeverities(['critical'])
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('test')
    })

    act(() => {
      result.current.clearAllFilters()
    })

    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.isAllSeveritiesSelected).toBe(true)
    expect(result.current.isAllStatusesSelected).toBe(true)
    expect(result.current.customFilter).toBe('')
    expect(result.current.hasCustomFilter).toBe(false)
    expect(result.current.isFiltered).toBe(false)
  })
})

// ===========================================================================
// Dynamic cluster list changes
// ===========================================================================
describe('dynamic cluster list changes', () => {
  it('updates availableClusters when useClusters returns new data', () => {
    const { result, rerender } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.availableClusters).toEqual(['cluster-a', 'cluster-b'])

    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-a', context: 'cluster-a', server: 'https://a.example.com' },
        { name: 'cluster-b', context: 'cluster-b', server: 'https://b.example.com' },
        { name: 'cluster-c', context: 'cluster-c', server: 'https://c.example.com' },
      ],
      clusters: [],
      isLoading: false,
      error: null,
    })

    rerender()

    expect(result.current.availableClusters).toEqual(['cluster-a', 'cluster-b', 'cluster-c'])
  })

  it('updates clusterInfoMap when useClusters returns new data', () => {
    const { result, rerender } = renderHook(() => useGlobalFilters(), { wrapper })

    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'new-cluster', context: 'new-ctx', server: 'https://new.example.com' },
      ],
      clusters: [],
      isLoading: false,
      error: null,
    })

    rerender()

    expect(result.current.clusterInfoMap['new-cluster']).toEqual(
      expect.objectContaining({ name: 'new-cluster', context: 'new-ctx' }),
    )
  })

  it('selectedClusters reflects all available when in all-selected mode after cluster list change', () => {
    const { result, rerender } = renderHook(() => useGlobalFilters(), { wrapper })

    // In all-selected mode
    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b'])

    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'x', context: 'x', server: 'https://x.example.com' },
        { name: 'y', context: 'y', server: 'https://y.example.com' },
        { name: 'z', context: 'z', server: 'https://z.example.com' },
      ],
      clusters: [],
      isLoading: false,
      error: null,
    })

    rerender()

    // All-selected mode should now return the new full list
    expect(result.current.selectedClusters).toEqual(['x', 'y', 'z'])
    expect(result.current.isAllClustersSelected).toBe(true)
  })
})

// ===========================================================================
// Analytics emissions
// ===========================================================================
describe('analytics emissions', () => {
  it('emits cluster filter changed with correct counts', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(mockEmitCluster).toHaveBeenCalledTimes(1)
    expect(mockEmitCluster).toHaveBeenCalledWith(1, 2)  // 1 selected, 2 available
  })

  it('emits severity filter changed with correct count', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical', 'high', 'medium'])
    })

    expect(mockEmitSeverity).toHaveBeenCalledTimes(1)
    expect(mockEmitSeverity).toHaveBeenCalledWith(3)
  })

  it('emits status filter changed with correct count', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    expect(mockEmitStatus).toHaveBeenCalledTimes(1)
    expect(mockEmitStatus).toHaveBeenCalledWith(1)
  })

  it('emits analytics for toggle operations', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    // toggleCluster now emits analytics for every cluster filter change
    expect(mockEmitCluster).toHaveBeenCalledTimes(1)
    expect(mockEmitCluster).toHaveBeenCalledWith(1, 2)
  })

  it('does not emit analytics for selectAll/deselectAll operations', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.selectAllClusters()
      result.current.deselectAllClusters()
      result.current.selectAllSeverities()
      result.current.deselectAllSeverities()
      result.current.selectAllStatuses()
      result.current.deselectAllStatuses()
    })

    expect(mockEmitCluster).not.toHaveBeenCalled()
    expect(mockEmitSeverity).not.toHaveBeenCalled()
    expect(mockEmitStatus).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Edge cases and regression guards
// ===========================================================================
