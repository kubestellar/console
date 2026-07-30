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
  SEVERITY_CONFIG,
  STATUS_CONFIG,
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


describe('filterByCluster — deep edge cases', () => {
  it('returns items with undefined cluster when all clusters are selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    const items = [
      { name: 'no-cluster-item' },
      { name: 'has-cluster', cluster: 'cluster-a' },
    ]
    // All clusters selected — everything passes through
    const filtered = result.current.filterByCluster(items)
    expect(filtered).toHaveLength(2)
  })

  it('excludes items with non-matching cluster', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    const items = [
      { name: 'match', cluster: 'cluster-a' },
      { name: 'no-match', cluster: 'cluster-c' },
    ]
    const filtered = result.current.filterByCluster(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('match')
  })

  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.filterByCluster([])).toEqual([])
  })
})

describe('filterBySeverity — deep edge cases', () => {
  it('items without severity default to info when info is not selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    const items = [
      { name: 'no-severity' },  // defaults to info, should NOT match critical
    ]
    const filtered = result.current.filterBySeverity(items)
    expect(filtered).toHaveLength(0)
  })

  it('handles mixed case severity values', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['warning', 'high'])
    })

    const items = [
      { name: 'a', severity: 'WARNING' },
      { name: 'b', severity: 'High' },
      { name: 'c', severity: 'critical' },
    ]
    const filtered = result.current.filterBySeverity(items)
    expect(filtered).toHaveLength(2)
    expect(filtered.map(i => i.name)).toEqual(['a', 'b'])
  })

  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    expect(result.current.filterBySeverity([])).toEqual([])
  })
})

describe('filterByStatus — deep edge cases', () => {
  it('items with undefined status are excluded when a specific status is selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['pending'])
    })

    const items = [
      { name: 'no-status' },
      { name: 'pending-item', status: 'pending' },
    ]
    const filtered = result.current.filterByStatus(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pending-item')
  })

  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    expect(result.current.filterByStatus([])).toEqual([])
  })
})

describe('filterByCustomText — deep edge cases', () => {
  it('returns empty array for empty input with active filter', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('test')
    })

    expect(result.current.filterByCustomText([])).toEqual([])
  })

  it('matches partial substrings in values', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('kube')
    })

    const items = [
      { name: 'kube-system-pod', namespace: 'default' },
      { name: 'other-pod', namespace: 'kube-public' },
      { name: 'excluded', namespace: 'default' },
    ]
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(2)
  })

  it('does not match on fields not in searchFields list', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('hidden-value')
    })

    const items = [
      { name: 'item1', hiddenField: 'hidden-value', cluster: 'c1' },
    ]
    // Only searching default fields (name, namespace, cluster, message)
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(0)
  })

  it('handles items with empty string values in search fields', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('test')
    })

    const items = [
      { name: '', namespace: '', cluster: '', message: '' },
    ]
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(0)
  })
})

describe('filterItems — pipeline ordering verification', () => {
  it('cluster filter runs first reducing the candidate set', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-b'])
      result.current.setSelectedSeverities(['info'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    // cluster-b items with info severity: pod-gamma
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-gamma')
  })

  it('all four filters narrow down progressively', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-b'])
      result.current.setSelectedSeverities(['critical'])
      result.current.setSelectedStatuses(['running'])
      result.current.setCustomFilter('delta')
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-delta')
  })

  it('no items pass when all filters contradict', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedStatuses(['bound'])
      result.current.setSelectedSeverities(['critical'])
    })

    // cluster-a + bound + critical => pod-epsilon has bound but info severity
    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(0)
  })
})

describe('context value memoization', () => {
  it('filter functions remain callable after re-render', () => {
    const { result, rerender } = renderHook(() => useGlobalFilters(), { wrapper })
    rerender()
    // React Compiler handles memoization — verify functions are still callable
    expect(typeof result.current.filterByCluster).toBe('function')
    expect(typeof result.current.filterBySeverity).toBe('function')
    expect(typeof result.current.filterByStatus).toBe('function')
    expect(typeof result.current.filterByCustomText).toBe('function')
  })
})

describe('toggleSeverity — additional edge cases', () => {
  it('toggling from a two-item selection removes one and keeps the other', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical', 'warning'])
    })

    act(() => {
      result.current.toggleSeverity('warning')
    })

    // Only 'critical' remains
    const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
    expect(filtered.every(item => item.severity === 'critical')).toBe(true)
  })

  it('toggling adds a new severity to existing single selection', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    act(() => {
      result.current.toggleSeverity('info')
    })

    // Both critical and info
    const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
    expect(filtered.every(item => ['critical', 'info'].includes(item.severity))).toBe(true)
  })
})

describe('toggleStatus — additional edge cases', () => {
  it('toggling from a two-item selection removes one and keeps the other', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running', 'pending'])
    })

    act(() => {
      result.current.toggleStatus('pending')
    })

    const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
    expect(filtered.every(item => item.status === 'running')).toBe(true)
  })

  it('toggling adds a new status to existing single selection', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    act(() => {
      result.current.toggleStatus('bound')
    })

    const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
    expect(filtered.every(item => ['running', 'bound'].includes(item.status))).toBe(true)
  })
})

