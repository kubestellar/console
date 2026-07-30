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
describe('exported constants', () => {
  it('SEVERITY_LEVELS contains all expected levels', () => {
    expect(SEVERITY_LEVELS).toEqual(['critical', 'warning', 'high', 'medium', 'low', 'info'])
  })

  it('STATUS_LEVELS contains all expected levels', () => {
    expect(STATUS_LEVELS).toEqual(['pending', 'failed', 'running', 'init', 'bound'])
  })

  it('SEVERITY_CONFIG has an entry for every severity level', () => {
    for (const level of SEVERITY_LEVELS) {
      expect(SEVERITY_CONFIG[level]).toBeDefined()
      expect(SEVERITY_CONFIG[level].label).toBeTruthy()
      expect(SEVERITY_CONFIG[level].color).toBeTruthy()
      expect(SEVERITY_CONFIG[level].bgColor).toBeTruthy()
    }
  })

  it('STATUS_CONFIG has an entry for every status level', () => {
    for (const level of STATUS_LEVELS) {
      expect(STATUS_CONFIG[level]).toBeDefined()
      expect(STATUS_CONFIG[level].label).toBeTruthy()
      expect(STATUS_CONFIG[level].color).toBeTruthy()
      expect(STATUS_CONFIG[level].bgColor).toBeTruthy()
    }
  })
})
describe('useGlobalFilters without provider', () => {
  it('returns safe no-op defaults when used outside GlobalFiltersProvider', () => {
    // Wrapped in try/finally so the spy is always restored, even if an
    // assertion below throws — otherwise the mock leaks into subsequent tests.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(() => useGlobalFilters())

      // All-selected / unfiltered state
      expect(result.current.selectedClusters).toEqual([])
      expect(result.current.isAllClustersSelected).toBe(true)
      expect(result.current.isClustersFiltered).toBe(false)
      expect(result.current.isAllSeveritiesSelected).toBe(true)
      expect(result.current.isSeveritiesFiltered).toBe(false)
      expect(result.current.isAllStatusesSelected).toBe(true)
      expect(result.current.isStatusesFiltered).toBe(false)
      expect(result.current.hasCustomFilter).toBe(false)
      expect(result.current.isFiltered).toBe(false)

      // Setter/action methods are no-ops (do not throw)
      expect(() => result.current.toggleCluster('cluster-a')).not.toThrow()
      expect(() => result.current.selectAllClusters()).not.toThrow()
      expect(() => result.current.clearAllFilters()).not.toThrow()

      // Filter helpers pass items through unchanged
      const sampleItems = [{ id: 1 }, { id: 2 }]
      expect(result.current.filterByCluster(sampleItems)).toBe(sampleItems)
      expect(result.current.filterBySeverity(sampleItems)).toBe(sampleItems)
      expect(result.current.filterByStatus(sampleItems)).toBe(sampleItems)
      expect(result.current.filterByCustomText(sampleItems)).toBe(sampleItems)
      expect(result.current.filterItems(sampleItems)).toBe(sampleItems)
    } finally {
      spy.mockRestore()
    }
  })
})
describe('initial state without localStorage', () => {
  it('starts with all clusters selected (empty array = all)', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.isClustersFiltered).toBe(false)
  })

  it('exposes available clusters from useClusters hook', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.availableClusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('exposes clusterInfoMap keyed by name', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.clusterInfoMap['cluster-a']).toEqual(
      expect.objectContaining({ name: 'cluster-a', context: 'cluster-a' }),
    )
    expect(result.current.clusterInfoMap['cluster-b']).toEqual(
      expect.objectContaining({ name: 'cluster-b', context: 'cluster-b' }),
    )
  })

  it('starts with all severities selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllSeveritiesSelected).toBe(true)
    expect(result.current.isSeveritiesFiltered).toBe(false)
  })

  it('starts with all statuses selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllStatusesSelected).toBe(true)
    expect(result.current.isStatusesFiltered).toBe(false)
  })

  it('starts with empty custom filter', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.customFilter).toBe('')
    expect(result.current.hasCustomFilter).toBe(false)
  })

  it('starts with isFiltered false', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isFiltered).toBe(false)
  })

  it('starts with empty cluster groups', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.clusterGroups).toEqual([])
  })

  it('selectedClusters returns availableClusters when all selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('selectedSeverities returns all severity levels when all selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.selectedSeverities).toEqual(SEVERITY_LEVELS)
  })

  it('selectedStatuses returns all status levels when all selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.selectedStatuses).toEqual(STATUS_LEVELS)
  })
})

// ===========================================================================
// localStorage persistence
// ===========================================================================
describe('localStorage persistence', () => {
  it('persists selected clusters to localStorage', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:clusters')!)).toEqual(['cluster-a'])
  })

  it('persists null to localStorage when all clusters selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.selectAllClusters()
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:clusters')!)).toBeNull()
  })

  it('restores selected clusters from localStorage on mount', () => {
    localStorage.setItem('globalFilter:clusters', JSON.stringify(['cluster-b']))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isClustersFiltered).toBe(true)
    // When clusters are filtered, selectedClusters should include cluster-b
    expect(result.current.selectedClusters).toContain('cluster-b')
  })

  it('restores null in localStorage as all-clusters mode', () => {
    localStorage.setItem('globalFilter:clusters', JSON.stringify(null))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isAllClustersSelected).toBe(true)
  })

  it('persists selected severities to localStorage', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical', 'warning'])
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:severities')!)).toEqual(['critical', 'warning'])
  })

  it('persists null to localStorage when all severities selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.selectAllSeverities()
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:severities')!)).toBeNull()
  })

  it('restores selected severities from localStorage on mount', () => {
    localStorage.setItem('globalFilter:severities', JSON.stringify(['warning']))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isSeveritiesFiltered).toBe(true)
  })

  it('restores null in localStorage as all-severities mode', () => {
    localStorage.setItem('globalFilter:severities', JSON.stringify(null))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isAllSeveritiesSelected).toBe(true)
  })

  it('persists selected statuses to localStorage', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running', 'failed'])
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:statuses')!)).toEqual(['running', 'failed'])
  })

  it('persists null to localStorage when all statuses selected', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.selectAllStatuses()
    })

    expect(JSON.parse(localStorage.getItem('globalFilter:statuses')!)).toBeNull()
  })

  it('restores selected statuses from localStorage on mount', () => {
    localStorage.setItem('globalFilter:statuses', JSON.stringify(['pending']))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isStatusesFiltered).toBe(true)
  })

  it('restores null in localStorage as all-statuses mode', () => {
    localStorage.setItem('globalFilter:statuses', JSON.stringify(null))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.isAllStatusesSelected).toBe(true)
  })

  it('persists custom text filter to localStorage', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('my-search')
    })

    expect(localStorage.getItem('globalFilter:customText')).toBe('my-search')
  })

  it('restores custom text filter from localStorage on mount', () => {
    localStorage.setItem('globalFilter:customText', 'restored-text')
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.customFilter).toBe('restored-text')
    expect(result.current.hasCustomFilter).toBe(true)
  })

  it('persists cluster groups to localStorage', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'prod', clusters: ['cluster-a'] })
    })

    const stored = JSON.parse(localStorage.getItem('globalFilter:clusterGroups')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('prod')
    expect(stored[0].clusters).toEqual(['cluster-a'])
  })

  it('restores cluster groups from localStorage on mount', () => {
    const groups = [{ id: 'group-123', name: 'staging', clusters: ['cluster-b'] }]
    localStorage.setItem('globalFilter:clusterGroups', JSON.stringify(groups))
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    expect(result.current.clusterGroups).toEqual(groups)
  })

  it('handles corrupt localStorage gracefully for clusters', () => {
    localStorage.setItem('globalFilter:clusters', 'not-valid-json{{')
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    // Falls back to default (all selected)
    expect(result.current.isAllClustersSelected).toBe(true)
  })

  it('handles corrupt localStorage gracefully for severities', () => {
    localStorage.setItem('globalFilter:severities', 'bad-json')
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllSeveritiesSelected).toBe(true)
  })

  it('handles corrupt localStorage gracefully for statuses', () => {
    localStorage.setItem('globalFilter:statuses', '}{invalid')
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllStatusesSelected).toBe(true)
  })

  it('handles corrupt localStorage gracefully for cluster groups', () => {
    localStorage.setItem('globalFilter:clusterGroups', '{{bad')
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.clusterGroups).toEqual([])
  })
})

// ===========================================================================
// Cluster selection
// ===========================================================================
