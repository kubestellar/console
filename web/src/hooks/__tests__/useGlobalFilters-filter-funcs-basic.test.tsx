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


describe('filterByCluster', () => {
  it('returns all items when all clusters selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('filters items to only selected cluster', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    const filtered = result.current.filterByCluster(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(3)
    expect(filtered.every(item => item.cluster === 'cluster-a')).toBe(true)
  })

  it('deselectAllClusters preserves __none__ sentinel (returns empty)', () => {
    // __none__ sentinel is preserved during reconciliation, so
    // filterByCluster returns an empty array (nothing selected).
    //
    // Per issue #9838: assert the sentinel is present in selectedClusters
    // directly rather than relying purely on derived filter behavior.
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    // Direct assertion on the state
    expect(result.current.selectedClusters).toEqual(['__none__'])

    // Derived behavior still holds
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual([])
  })

  it('excludes items without a cluster field', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    const items = [
      { name: 'has-cluster', cluster: 'cluster-a' },
      { name: 'no-cluster' },  // no cluster field
    ]
    const filtered = result.current.filterByCluster(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('has-cluster')
  })
})

// ===========================================================================
// filterBySeverity
// ===========================================================================
describe('filterBySeverity', () => {
  it('returns all items when all severities selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterBySeverity(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('filters items to only selected severity', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(2)
    expect(filtered.every(item => item.severity === 'critical')).toBe(true)
  })

  it('returns empty when __none__ sentinel is set', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllSeverities()
    })

    expect(result.current.filterBySeverity(SAMPLE_ITEMS)).toEqual([])
  })

  it('defaults missing severity to info', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['info'])
    })

    const items = [
      { name: 'has-severity', severity: 'info' },
      { name: 'no-severity' },  // no severity field => defaults to 'info'
    ]
    const filtered = result.current.filterBySeverity(items)
    expect(filtered).toHaveLength(2)
  })

  it('matches severity case-insensitively', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    const items = [
      { name: 'upper', severity: 'Critical' },
      { name: 'lower', severity: 'critical' },
    ]
    const filtered = result.current.filterBySeverity(items)
    expect(filtered).toHaveLength(2)
  })
})

// ===========================================================================
// filterByStatus
// ===========================================================================
describe('filterByStatus', () => {
  it('returns all items when all statuses selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterByStatus(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('filters items to only selected status', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(2)
    expect(filtered.every(item => item.status === 'running')).toBe(true)
  })

  it('returns empty when __none__ sentinel is set', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllStatuses()
    })

    expect(result.current.filterByStatus(SAMPLE_ITEMS)).toEqual([])
  })

  it('uses exact match and does not match substrings', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['run' as unknown])
    })

    const items = [
      { name: 'running-item', status: 'running' },
    ]
    // 'run' should NOT match 'running' (exact match)
    const filtered = result.current.filterByStatus(items)
    expect(filtered).toHaveLength(0)
  })

  it('matches status case-insensitively', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const items = [
      { name: 'upper', status: 'Running' },
      { name: 'lower', status: 'running' },
    ]
    const filtered = result.current.filterByStatus(items)
    expect(filtered).toHaveLength(2)
  })

  it('treats missing status as empty string (no match)', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const items = [
      { name: 'has-status', status: 'running' },
      { name: 'no-status' },  // no status field
    ]
    const filtered = result.current.filterByStatus(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('has-status')
  })
})

// ===========================================================================
// filterByCustomText
// ===========================================================================
describe('filterByCustomText', () => {
  it('returns all items when custom filter is empty', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.filterByCustomText(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('returns all items when custom filter is whitespace only', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('   ')
    })

    expect(result.current.filterByCustomText(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('searches default fields: name, namespace, cluster, message', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('alpha')
    })

    const filtered = result.current.filterByCustomText(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-alpha')
  })

  it('searches by cluster field', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('cluster-b')
    })

    const filtered = result.current.filterByCustomText(SAMPLE_ITEMS)
    expect(filtered.every(item => item.cluster === 'cluster-b')).toBe(true)
  })

  it('is case-insensitive', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('POD-ALPHA')
    })

    const filtered = result.current.filterByCustomText(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
  })

  it('supports custom search fields', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    const items = [
      { name: 'item1', customField: 'match-me', cluster: 'cluster-a' },
      { name: 'item2', customField: 'no-hit', cluster: 'cluster-b' },
    ]

    act(() => {
      result.current.setCustomFilter('match-me')
    })

    // Only search 'customField', not default fields
    const filtered = result.current.filterByCustomText(items, ['customField'])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('item1')
  })

  it('skips non-string fields gracefully', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    const items = [
      { name: 'item1', count: 42 as unknown },
      { name: 'item2', count: null as unknown },
    ]

    act(() => {
      result.current.setCustomFilter('42')
    })

    // count is a number, not a string, so it shouldn't match
    const filtered = result.current.filterByCustomText(items, ['name', 'count'])
    expect(filtered).toHaveLength(0)
  })
})

// ===========================================================================
// filterItems -- combined pipeline
// ===========================================================================
