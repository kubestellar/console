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

vi.mock('../../lib/analytics', () => ({
  emitGlobalClusterFilterChanged: mockEmitCluster,
  emitGlobalSeverityFilterChanged: mockEmitSeverity,
  emitGlobalStatusFilterChanged: mockEmitStatus,
}))

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

// ===========================================================================
// Provider requirement — see PR #8211: useGlobalFilters now returns no-op
// defaults when used outside a provider instead of throwing, so that cards
// rendered outside the dashboard shell (e.g. in isolated previews) degrade
// gracefully. The behaviour test below locks in that contract.
// ===========================================================================
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

// ===========================================================================
// Initial state (no localStorage)
// ===========================================================================
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

  it('deselectAllClusters is reconciled back to all-selected mode', () => {
    // PR #5449: reconciliation drops __none__ (not in availableClusters),
    // reverting to all-selected mode
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    // Reconciliation resets to all-selected because __none__ is not a real cluster
    expect(result.current.isAllClustersSelected).toBe(true)
    const filtered = result.current.filterByCluster(SAMPLE_ITEMS)
    expect(filtered).toEqual(SAMPLE_ITEMS)
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

  it('deselectAllClusters is reconciled to all-selected (returns all items)', () => {
    // PR #5449: reconciliation drops __none__ sentinel, reverting to all mode
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
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
describe('edge cases', () => {
  it('handles empty deduplicatedClusters from useClusters', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.availableClusters).toEqual([])
    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.filterItems(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('filterItems handles items with missing optional fields', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    const items = [
      { name: 'minimal' },  // no cluster, severity, or status
    ]

    // With no filters active, should pass through
    expect(result.current.filterItems(items)).toEqual(items)
  })

  it('multiple rapid filter changes settle to final state', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
      result.current.setSelectedClusters(['cluster-b'])
      result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
    })

    // Last write wins; setting both clusters = all-selected mode
    // Because the context exposes effectiveSelectedClusters, need to check the flags
    // Setting both clusters explicitly doesn't auto-collapse to all-selected;
    // that only happens via toggleCluster. So both should still be set.
    expect(result.current.isClustersFiltered).toBe(true)
  })

  it('toggleCluster with three clusters scenario', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'c1', context: 'c1', server: 'https://c1.example.com' },
        { name: 'c2', context: 'c2', server: 'https://c2.example.com' },
        { name: 'c3', context: 'c3', server: 'https://c3.example.com' },
      ],
      clusters: [],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Start all-selected, toggle off c1 => c2, c3 selected
    act(() => {
      result.current.toggleCluster('c1')
    })
    expect(result.current.isClustersFiltered).toBe(true)

    // Toggle off c2 => only c3 selected
    act(() => {
      result.current.toggleCluster('c2')
    })
    expect(result.current.isClustersFiltered).toBe(true)

    // Toggle c1 back on => c1 and c3 selected
    act(() => {
      result.current.toggleCluster('c1')
    })
    expect(result.current.isClustersFiltered).toBe(true)

    // Toggle c2 back on => all three selected => all mode
    act(() => {
      result.current.toggleCluster('c2')
    })
    expect(result.current.isAllClustersSelected).toBe(true)
  })

  it('toggleSeverity with all levels scenario', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Toggle off all severities one by one (from all-selected mode)
    // First toggle: all except 'critical'
    act(() => {
      result.current.toggleSeverity('critical')
    })
    expect(result.current.isSeveritiesFiltered).toBe(true)

    // Toggle 'critical' back on (adds it to the selection)
    act(() => {
      result.current.toggleSeverity('critical')
    })
    // All 6 levels selected => back to all mode
    expect(result.current.isAllSeveritiesSelected).toBe(true)
  })

  it('toggleStatus with all levels scenario', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.toggleStatus('pending')
    })
    expect(result.current.isStatusesFiltered).toBe(true)

    act(() => {
      result.current.toggleStatus('pending')
    })
    expect(result.current.isAllStatusesSelected).toBe(true)
  })

  it('localStorage getItem throwing does not crash initialization', () => {
    const originalGetItem = localStorage.getItem
    localStorage.getItem = () => { throw new Error('Storage access denied') }

    // Should not throw
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })
    expect(result.current.isAllClustersSelected).toBe(true)
    expect(result.current.isAllSeveritiesSelected).toBe(true)
    expect(result.current.isAllStatusesSelected).toBe(true)
    expect(result.current.customFilter).toBe('')

    localStorage.getItem = originalGetItem
  })

  // ── NEW TESTS — push toward 80% coverage ──────────────────────────

  it('filterByCustomText with default fields matches namespace field', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('kube-system')
    })

    const items = [
      { name: 'pod-a', namespace: 'kube-system', cluster: 'c1' },
      { name: 'pod-b', namespace: 'default', cluster: 'c1' },
    ]
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-a')
  })

  it('filterByCustomText with default fields matches message field', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('OOMKilled')
    })

    const items = [
      { name: 'pod-a', message: 'Container OOMKilled on restart' },
      { name: 'pod-b', message: 'Running normally' },
    ]
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-a')
  })

  it('filterByCustomText ignores undefined fields in items', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setCustomFilter('missing')
    })

    const items = [
      { name: 'pod-a' }, // no namespace, cluster, or message
    ]
    const filtered = result.current.filterByCustomText(items)
    expect(filtered).toHaveLength(0)
  })

  it('toggleCluster from filtered state adds cluster that was not selected', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'c1', context: 'c1', server: 'https://c1' },
        { name: 'c2', context: 'c2', server: 'https://c2' },
        { name: 'c3', context: 'c3', server: 'https://c3' },
      ],
      clusters: [],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Select just c1
    act(() => {
      result.current.setSelectedClusters(['c1'])
    })
    expect(result.current.isClustersFiltered).toBe(true)

    // Toggle c2 ON (add it)
    act(() => {
      result.current.toggleCluster('c2')
    })

    // c1 and c2 are selected, c3 is not — still filtered
    expect(result.current.isClustersFiltered).toBe(true)
  })

  it('addClusterGroup preserves existing groups when adding multiple', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'group-1', clusters: ['cluster-a'] })
    })
    act(() => {
      result.current.addClusterGroup({ name: 'group-2', clusters: ['cluster-b'] })
    })

    expect(result.current.clusterGroups).toHaveLength(2)
    expect(result.current.clusterGroups[0].name).toBe('group-1')
    expect(result.current.clusterGroups[1].name).toBe('group-2')
  })

  it('updateClusterGroup can update clusters list', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'mutable', clusters: ['cluster-a'] })
    })
    const groupId = result.current.clusterGroups[0].id

    act(() => {
      result.current.updateClusterGroup(groupId, { clusters: ['cluster-a', 'cluster-b'] })
    })

    expect(result.current.clusterGroups[0].clusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('selectClusterGroup with empty clusters array clears selection', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.addClusterGroup({ name: 'empty', clusters: [] })
    })
    const groupId = result.current.clusterGroups[0].id

    act(() => {
      result.current.selectClusterGroup(groupId)
    })

    // Empty clusters array means no clusters match — filtered state
    expect(result.current.isAllClustersSelected).toBe(true) // empty [] = all mode internally
  })

  it('filterItems applies all four filters in pipeline order', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // Set cluster filter to cluster-a (3 items match)
    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })
    // Set severity filter to warning (1 item in cluster-a matches)
    act(() => {
      result.current.setSelectedSeverities(['warning'])
    })
    // Set status filter to failed (1 item with warning in cluster-a matches)
    act(() => {
      result.current.setSelectedStatuses(['failed'])
    })

    const filtered = result.current.filterItems(SAMPLE_ITEMS)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('pod-beta')
  })

  it('clearAllFilters resets localStorage values to null/defaults', () => {
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

    // Clusters, severities, statuses store null when all selected
    expect(JSON.parse(localStorage.getItem('globalFilter:clusters')!)).toBeNull()
    expect(JSON.parse(localStorage.getItem('globalFilter:severities')!)).toBeNull()
    expect(JSON.parse(localStorage.getItem('globalFilter:statuses')!)).toBeNull()
    expect(localStorage.getItem('globalFilter:customText')).toBe('')
  })

  it('filterByCluster handles items with undefined cluster correctly', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    // All selected — items without cluster field should pass through
    const items = [
      { name: 'with-cluster', cluster: 'cluster-a' },
      { name: 'without-cluster' },
    ]
    const filtered = result.current.filterByCluster(items)
    expect(filtered).toHaveLength(2) // all-selected mode passes everything
  })

  it('filterByStatus items with empty string status do not match any status', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedStatuses(['running'])
    })

    const items = [
      { name: 'empty-status', status: '' },
      { name: 'running-item', status: 'running' },
    ]
    const filtered = result.current.filterByStatus(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('running-item')
  })

  it('deselectAllClusters then selectAllClusters both resolve to all mode', () => {
    // PR #5449: reconciliation drops __none__ immediately, so deselectAll
    // already reverts to all-selected; selectAll is a no-op after that
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })
    // Reconciliation already restored all mode
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)

    act(() => {
      result.current.selectAllClusters()
    })
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('deselectAllSeverities then selectAllSeverities restores all mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllSeverities()
    })
    expect(result.current.filterBySeverity(SAMPLE_ITEMS)).toEqual([])

    act(() => {
      result.current.selectAllSeverities()
    })
    expect(result.current.filterBySeverity(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('deselectAllStatuses then selectAllStatuses restores all mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllStatuses()
    })
    expect(result.current.filterByStatus(SAMPLE_ITEMS)).toEqual([])

    act(() => {
      result.current.selectAllStatuses()
    })
    expect(result.current.filterByStatus(SAMPLE_ITEMS)).toEqual(SAMPLE_ITEMS)
  })

  it('setSelectedClusters with empty array resets to all-selected mode', () => {
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })
    expect(result.current.isClustersFiltered).toBe(true)

    act(() => {
      result.current.setSelectedClusters([])
    })
    // Empty array passed to setSelectedClusters should re-enable all mode via analytics emit
    expect(result.current.isFiltered).toBe(false)
  })
})

// ===========================================================================
// Deep coverage: additional filter pipeline and edge cases
// ===========================================================================

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
  it('deselectAllClusters is reconciled to all mode — returns all items', () => {
    // PR #5449: reconciliation drops __none__ sentinel, reverting to all mode
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    const items = [
      { name: 'no-cluster' },
      { name: 'has-cluster', cluster: 'cluster-a' },
    ]
    // All items returned because reconciliation restored all-selected mode
    expect(result.current.filterByCluster(items)).toEqual(items)
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
