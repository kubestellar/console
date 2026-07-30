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
describe('cluster selection', () => {
  it('setSelectedClusters sets specific clusters', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.isClustersFiltered).toBe(true)
    expect(result.current.isAllClustersSelected).toBe(false)
  })

  it('setSelectedClusters emits analytics event', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(mockEmitCluster).toHaveBeenCalledWith(1, 2)
  })

  it('selectAllClusters resets to all-clusters mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })
    expect(result.current.isClustersFiltered).toBe(true)

    act(() => {
      result.current.selectAllClusters()
    })
    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.isClustersFiltered).toBe(false)
  })

  it('deselectAllClusters preserves __none__ sentinel (nothing selected)', () => {
    // __none__ sentinel is preserved during reconciliation, so
    // isAllClustersSelected is false and filterByCluster returns empty.
    //
    // Per issue #9838: also assert selectedClusters contains the sentinel
    // directly, so this test fails immediately if a future reconciliation
    // change drops or rewrites the sentinel (not just when derived behavior
    // happens to match).
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    // Direct assertion: sentinel is present in selectedClusters
    expect(result.current.selectedClusters).toEqual(['__none__'])

    // Derived behavior assertions (retained for belt-and-suspenders coverage)
    expect(result.current.isAllClustersSelected).toBe(false)
    const filtered = result.current.filterByCluster(SAMPLE_ITEMS)
    expect(filtered).toEqual([])
  })

  describe('toggleCluster', () => {
    it('toggles off a cluster from all-selected mode (selects all except toggled)', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.toggleCluster('cluster-a')
      })

      expect(result.current.isClustersFiltered).toBe(true)
      // All except cluster-a => only cluster-b
      const filtered = result.current.filterByCluster(SAMPLE_ITEMS)
      expect(filtered.every(item => item.cluster === 'cluster-b')).toBe(true)
    })

    it('toggles off a cluster that is currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      // Start with both explicitly selected
      act(() => {
        result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
      })

      // Note: setting both explicitly = all-selected mode (length === available.length => [])
      // Let's start from one cluster selected instead
      act(() => {
        result.current.setSelectedClusters(['cluster-a'])
      })

      act(() => {
        result.current.toggleCluster('cluster-a')
      })

      // Removing the last one reverts to all-selected mode
      expect(result.current.isAllClustersSelected).toBe(true)
    })

    it('toggles on a cluster that is not currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      // Start with just cluster-a via toggle from all mode
      act(() => {
        result.current.toggleCluster('cluster-a')
      })
      // Now only cluster-b is selected (toggled off cluster-a from all)

      act(() => {
        result.current.toggleCluster('cluster-a')
      })
      // Re-adding cluster-a means both selected => back to all mode
      expect(result.current.isAllClustersSelected).toBe(true)
    })

    it('reverts to all-selected when toggling creates a full set', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedClusters(['cluster-a'])
      })

      act(() => {
        result.current.toggleCluster('cluster-b')
      })

      // Both clusters selected => reverts to all-selected
      expect(result.current.isAllClustersSelected).toBe(true)
    })

    it('reverts to all-selected when removing the last cluster', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedClusters(['cluster-a'])
      })

      act(() => {
        result.current.toggleCluster('cluster-a')
      })

      // Removing last one => reverts to all
      expect(result.current.isAllClustersSelected).toBe(true)
    })
  })
})

// ===========================================================================
// Severity selection
// ===========================================================================
describe('severity selection', () => {
  it('setSelectedSeverities sets specific severities', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })

    expect(result.current.isSeveritiesFiltered).toBe(true)
    expect(result.current.isAllSeveritiesSelected).toBe(false)
  })

  it('setSelectedSeverities emits analytics event', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical', 'warning'])
    })

    expect(mockEmitSeverity).toHaveBeenCalledWith(2)
  })

  it('selectAllSeverities resets to all-severities mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedSeverities(['critical'])
    })
    expect(result.current.isSeveritiesFiltered).toBe(true)

    act(() => {
      result.current.selectAllSeverities()
    })
    expect(result.current.isAllSeveritiesSelected).toBe(true)
  })

  it('deselectAllSeverities sets __none__ sentinel', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllSeverities()
    })

    expect(result.current.isSeveritiesFiltered).toBe(true)
    const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
    expect(filtered).toEqual([])
  })

  describe('toggleSeverity', () => {
    it('toggles off a severity from all-selected mode', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.toggleSeverity('info')
      })

      expect(result.current.isSeveritiesFiltered).toBe(true)
      // All except info
      const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
      expect(filtered.every(item => item.severity !== 'info')).toBe(true)
    })

    it('toggles off a severity that is currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedSeverities(['critical', 'warning'])
      })

      act(() => {
        result.current.toggleSeverity('critical')
      })

      // Only warning remains
      const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
      expect(filtered.every(item => item.severity === 'warning')).toBe(true)
    })

    it('toggles on a severity that is not currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedSeverities(['critical'])
      })

      act(() => {
        result.current.toggleSeverity('warning')
      })

      // Both critical and warning should now be selected
      const filtered = result.current.filterBySeverity(SAMPLE_ITEMS)
      expect(filtered.every(item => ['critical', 'warning'].includes(item.severity))).toBe(true)
    })

    it('reverts to all-selected when toggling creates a full set', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      // Select all except 'info'
      const allExceptInfo = SEVERITY_LEVELS.filter(s => s !== 'info')
      act(() => {
        result.current.setSelectedSeverities(allExceptInfo)
      })

      act(() => {
        result.current.toggleSeverity('info')
      })

      expect(result.current.isAllSeveritiesSelected).toBe(true)
    })

    it('reverts to all-selected when removing the last severity', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedSeverities(['critical'])
      })

      act(() => {
        result.current.toggleSeverity('critical')
      })

      expect(result.current.isAllSeveritiesSelected).toBe(true)
    })
  })
})

// ===========================================================================
// Status selection
// ===========================================================================
describe('status selection', () => {
  it('setSelectedStatuses sets specific statuses', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    expect(result.current.isStatusesFiltered).toBe(true)
    expect(result.current.isAllStatusesSelected).toBe(false)
  })

  it('setSelectedStatuses emits analytics event', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running', 'pending'])
    })

    expect(mockEmitStatus).toHaveBeenCalledWith(2)
  })

  it('selectAllStatuses resets to all-statuses mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })
    expect(result.current.isStatusesFiltered).toBe(true)

    act(() => {
      result.current.selectAllStatuses()
    })
    expect(result.current.isAllStatusesSelected).toBe(true)
  })

  it('deselectAllStatuses sets __none__ sentinel', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllStatuses()
    })

    expect(result.current.isStatusesFiltered).toBe(true)
    const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
    expect(filtered).toEqual([])
  })

  describe('toggleStatus', () => {
    it('toggles off a status from all-selected mode', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.toggleStatus('running')
      })

      expect(result.current.isStatusesFiltered).toBe(true)
      const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
      expect(filtered.every(item => item.status !== 'running')).toBe(true)
    })

    it('toggles off a status that is currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedStatuses(['running', 'failed'])
      })

      act(() => {
        result.current.toggleStatus('running')
      })

      const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
      expect(filtered.every(item => item.status === 'failed')).toBe(true)
    })

    it('toggles on a status that is not currently selected', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedStatuses(['running'])
      })

      act(() => {
        result.current.toggleStatus('failed')
      })

      const filtered = result.current.filterByStatus(SAMPLE_ITEMS)
      expect(filtered.every(item => ['running', 'failed'].includes(item.status))).toBe(true)
    })

    it('reverts to all-selected when toggling creates a full set', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      const allExceptBound = STATUS_LEVELS.filter(s => s !== 'bound')
      act(() => {
        result.current.setSelectedStatuses(allExceptBound)
      })

      act(() => {
        result.current.toggleStatus('bound')
      })

      expect(result.current.isAllStatusesSelected).toBe(true)
    })

    it('reverts to all-selected when removing the last status', () => {
      const { result } = renderHook(() => useGlobalFilters(), { wrapper })

      act(() => {
        result.current.setSelectedStatuses(['running'])
      })

      act(() => {
        result.current.toggleStatus('running')
      })

      expect(result.current.isAllStatusesSelected).toBe(true)
    })
  })
})

// ===========================================================================
// Custom text filter
// ===========================================================================
