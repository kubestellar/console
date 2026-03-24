import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
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

vi.mock('../mcp/clusters', () => ({
  useClusters: mockUseClusters,
}))

vi.mock('../../lib/analytics', () => ({
  emitGlobalClusterFilterChanged: vi.fn(),
  emitGlobalSeverityFilterChanged: vi.fn(),
  emitGlobalStatusFilterChanged: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import { GlobalFiltersProvider, useGlobalFilters } from '../useGlobalFilters'

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
})

// ===========================================================================
// Provider requirement
// ===========================================================================
describe('useGlobalFilters without provider', () => {
  it('throws when used outside GlobalFiltersProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useGlobalFilters())).toThrow(
      'useGlobalFilters must be used within a GlobalFiltersProvider',
    )
    spy.mockRestore()
  })
})

// ===========================================================================
// filterItems — no active filters
// ===========================================================================
describe('filterItems with no active filters', () => {
  it('returns all items when no filters are set', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('returns empty array when given empty array', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterItems([])).toEqual([])
  })
})

// ===========================================================================
// filterItems — cluster filter
// ===========================================================================
describe('filterItems — cluster filter', () => {
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

// ===========================================================================
// filterItems — severity filter
// ===========================================================================
describe('filterItems — severity filter', () => {
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

// ===========================================================================
// filterItems — status filter  (regression test for the #3352 bug fix)
// ===========================================================================
describe('filterItems — status filter', () => {
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
    // Both cluster-a and cluster-b items with status=running should appear
    expect(filtered.some(item => item.cluster === 'cluster-a')).toBe(true)
    expect(filtered.some(item => item.cluster === 'cluster-b')).toBe(true)
  })
})

// ===========================================================================
// filterItems — custom text filter  (regression test for the #3352 bug fix)
// ===========================================================================
describe('filterItems — custom text filter', () => {
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

// ===========================================================================
// filterItems — all four filters combined
// ===========================================================================
describe('filterItems — all four filters combined', () => {
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
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('test')
    })
    expect(result.current.isFiltered).toBe(true)

    act(() => {
      result.current.clearAllFilters()
    })
    expect(result.current.isFiltered).toBe(false)
  })
})
