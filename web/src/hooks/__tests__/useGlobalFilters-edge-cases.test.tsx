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
    // deselectAllClusters sets the __none__ sentinel, which is preserved
    // (not reconciled away) so filterByCluster returns empty.
    // selectAllClusters then clears the sentinel, restoring all mode.
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })
    // __none__ sentinel is preserved — nothing passes the filter
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual([])

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
  it('deselectAllClusters preserves __none__ sentinel — returns empty', () => {
    // __none__ sentinel is preserved during reconciliation, so
    // filterByCluster returns an empty array (nothing selected)
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })

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
