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


describe('localStorage persistence with complex scenarios', () => {
  it('persists cluster groups to localStorage after update', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'prod', clusters: ['cluster-a'] })
    })
    const groupId = result.current.clusterGroups[0].id

    act(() => {
      result.current.updateClusterGroup(groupId, { name: 'production', clusters: ['cluster-a', 'cluster-b'] })
    })

    const stored = JSON.parse(localStorage.getItem('globalFilter:clusterGroups')!)
    expect(stored[0].name).toBe('production')
    expect(stored[0].clusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('persists cluster groups to localStorage after delete', () => {
    let now = 2000
    // Wrapped in try/finally so the Date.now spy is always restored, even if
    // an assertion below throws — otherwise the mock leaks into subsequent tests.
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now++)
    try {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.addClusterGroup({ name: 'group1', clusters: ['cluster-a'] })
      })
      act(() => {
        result.current.addClusterGroup({ name: 'group2', clusters: ['cluster-b'] })
      })

      const id = result.current.clusterGroups[0].id
      act(() => {
        result.current.deleteClusterGroup(id)
      })

      const stored = JSON.parse(localStorage.getItem('globalFilter:clusterGroups')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('group2')
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('handles corrupt localStorage for custom text filter', () => {
    const originalGetItem = localStorage.getItem
    let first = true
    localStorage.getItem = (key: string) => {
      // Only throw for custom text key, not others
      if (key === 'globalFilter:customText' && first) {
        first = false
        throw new Error('Storage error')
      }
      return originalGetItem.call(localStorage, key)
    }

    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.customFilter).toBe('')

    localStorage.getItem = originalGetItem
  })
})

describe('combined isFiltered flag with edge combinations', () => {
  it('isFiltered is true when only custom filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('search-term')
    })

    expect(result.current.isFiltered).toBe(true)
    expect(result.current.isClustersFiltered).toBe(false)
    expect(result.current.isSeveritiesFiltered).toBe(false)
    expect(result.current.isStatusesFiltered).toBe(false)
  })

  it('isFiltered is true when only status filter is active', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['init'])
    })

    expect(result.current.isFiltered).toBe(true)
    expect(result.current.isClustersFiltered).toBe(false)
    expect(result.current.isSeveritiesFiltered).toBe(false)
    expect(result.current.isStatusesFiltered).toBe(true)
  })

  it('clearAllFilters resets custom filter along with others', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('something')
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.isFiltered).toBe(true)

    act(() => {
      result.current.clearAllFilters()
    })

    expect(result.current.isFiltered).toBe(false)
    expect(result.current.customFilter).toBe('')
    expect(result.current.isAllClustersSelected).toBe(true)
  })
})

describe('filterByCluster with __none__ sentinel edge cases', () => {
  it('deselectAllClusters preserves __none__ sentinel — returns empty', () => {
    // __none__ sentinel is preserved during reconciliation, so
    // filterByCluster returns an empty array (nothing selected).
    //
    // Per issue #9838: also assert the sentinel value is present directly
    // in selectedClusters, so a future refactor that silently drops or
    // rewrites the sentinel can't hide behind derived filter behavior.
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    // Direct assertion on state — sentinel must be preserved verbatim
    expect(result.current.selectedClusters).toEqual(['__none__'])

    const items = [
      { name: 'no-cluster' },
      { name: 'has-cluster', cluster: 'cluster-a' },
    ]
    // __none__ sentinel means nothing is selected — empty result
    expect(result.current.filterByCluster(items)).toEqual([])
  })
})

describe('filterBySeverity with __none__ sentinel edge cases', () => {
  it('__none__ sentinel returns empty even with items that have undefined severity', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllSeverities()
    })

    const items = [
      { name: 'no-sev' },
      { name: 'has-sev', severity: 'info' },
    ]
    expect(result.current.filterBySeverity(items)).toEqual([])
  })
})

describe('filterByStatus with __none__ sentinel edge cases', () => {
  it('__none__ sentinel returns empty even with items that have undefined status', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllStatuses()
    })

    const items = [
      { name: 'no-status' },
      { name: 'has-status', status: 'running' },
    ]
    expect(result.current.filterByStatus(items)).toEqual([])
  })
})
