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

  it('deselectAllClusters preserves __none__ sentinel (nothing selected)', () => {
    // __none__ sentinel is preserved during reconciliation, so
    // isAllClustersSelected is false and filterByCluster returns empty
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

    // __none__ sentinel is preserved — not reconciled away
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
