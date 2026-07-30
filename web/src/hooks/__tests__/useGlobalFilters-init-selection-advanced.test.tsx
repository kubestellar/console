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

// ===========================================================================
// Exported constants
// ===========================================================================
describe('custom text filter', () => {
  it('setCustomFilter updates the filter value', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('hello')
    })

    expect(result.current.customFilter).toBe('hello')
    expect(result.current.hasCustomFilter).toBe(true)
  })

  it('clearCustomFilter resets to empty string', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('something')
    })
    expect(result.current.hasCustomFilter).toBe(true)

    act(() => {
      result.current.clearCustomFilter()
    })
    expect(result.current.customFilter).toBe('')
    expect(result.current.hasCustomFilter).toBe(false)
  })

  it('hasCustomFilter is false for whitespace-only input', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('   ')
    })

    expect(result.current.hasCustomFilter).toBe(false)
  })
})

// ===========================================================================
// Cluster groups
// ===========================================================================
describe('cluster groups', () => {
  it('addClusterGroup adds a new group with auto-generated id', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'production', clusters: ['cluster-a'] })
    })

    expect(result.current.clusterGroups).toHaveLength(1)
    expect(result.current.clusterGroups[0].name).toBe('production')
    expect(result.current.clusterGroups[0].clusters).toEqual(['cluster-a'])
    expect(result.current.clusterGroups[0].id).toMatch(/^group-\d+$/)
  })

  it('addClusterGroup supports optional color and labelSelector', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({
        name: 'labeled',
        clusters: ['cluster-b'],
        color: '#ff0000',
        labelSelector: { env: 'prod' },
      })
    })

    expect(result.current.clusterGroups[0].color).toBe('#ff0000')
    expect(result.current.clusterGroups[0].labelSelector).toEqual({ env: 'prod' })
  })

  it('updateClusterGroup updates fields of an existing group', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'dev', clusters: ['cluster-a'] })
    })
    const groupId = result.current.clusterGroups[0].id

    act(() => {
      result.current.updateClusterGroup(groupId, { name: 'development', color: '#00ff00' })
    })

    const updated = result.current.clusterGroups.find(g => g.id === groupId)!
    expect(updated.name).toBe('development')
    expect(updated.color).toBe('#00ff00')
    // Unchanged fields remain
    expect(updated.clusters).toEqual(['cluster-a'])
  })

  it('updateClusterGroup does nothing for non-existent id', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'test', clusters: ['cluster-a'] })
    })

    act(() => {
      result.current.updateClusterGroup('non-existent-id', { name: 'nope' })
    })

    expect(result.current.clusterGroups).toHaveLength(1)
    expect(result.current.clusterGroups[0].name).toBe('test')
  })

  it('deleteClusterGroup removes a group by id', () => {
    let now = 1000
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

      expect(result.current.clusterGroups).toHaveLength(2)

      const idToDelete = result.current.clusterGroups[0].id

      act(() => {
        result.current.deleteClusterGroup(idToDelete)
      })

      expect(result.current.clusterGroups).toHaveLength(1)
      expect(result.current.clusterGroups[0].name).toBe('group2')
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('deleteClusterGroup does nothing for non-existent id', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'group1', clusters: ['cluster-a'] })
    })

    act(() => {
      result.current.deleteClusterGroup('non-existent')
    })

    expect(result.current.clusterGroups).toHaveLength(1)
  })

  it('selectClusterGroup sets selected clusters to the group clusters', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'prod', clusters: ['cluster-b'] })
    })
    const groupId = result.current.clusterGroups[0].id

    act(() => {
      result.current.selectClusterGroup(groupId)
    })

    expect(result.current.isClustersFiltered).toBe(true)
    const filtered = result.current.filterByCluster(SAMPLE_ITEMS)
    expect(filtered.every(item => item.cluster === 'cluster-b')).toBe(true)
  })

  it('selectClusterGroup does nothing for non-existent group id', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Start with all selected
    expect(result.current.isAllClustersSelected).toBe(true)

    act(() => {
      result.current.selectClusterGroup('non-existent-group')
    })

    // Should remain unchanged
    expect(result.current.isAllClustersSelected).toBe(true)
  })
})

// ===========================================================================
// filterByCluster
// ===========================================================================
