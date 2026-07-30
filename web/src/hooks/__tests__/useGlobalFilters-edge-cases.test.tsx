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

  it('deselectAllClusters then selectAllClusters restores all mode', () => {
    // Renamed from "both resolve to all mode" (issue #9838) — the previous
    // name was misleading because the intermediate state is NOT all mode.
    //
    // deselectAllClusters sets the __none__ sentinel, which is preserved
    // (not reconciled away) so filterByCluster returns empty.
    // selectAllClusters then clears the sentinel, restoring all mode.
    const { result } = renderHook(() => useGlobalFilters(), { wrapper })

    act(() => {
      result.current.deselectAllClusters()
    })
    // Direct assertion: __none__ sentinel is present in selectedClusters
    // (not reconciled away). This catches regressions that would drop or
    // rewrite the sentinel even if derived filter behavior still looked OK.
    expect(result.current.selectedClusters).toEqual(['__none__'])
    // __none__ sentinel is preserved — nothing passes the filter
    expect(result.current.filterByCluster(SAMPLE_ITEMS)).toEqual([])

    act(() => {
      result.current.selectAllClusters()
    })
    // After selectAllClusters the sentinel must be cleared — no __none__
    expect(result.current.selectedClusters).not.toContain('__none__')
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

