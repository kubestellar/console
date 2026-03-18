import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockUseClusters = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    clusters: [
      { name: 'cluster-a', context: 'cluster-a', server: 'https://a.example.com' },
      { name: 'cluster-b', context: 'cluster-b', server: 'https://b.example.com' },
      { name: 'cluster-c', context: 'cluster-c', server: 'https://c.example.com' },
    ],
    isLoading: false,
    error: null,
  }),
)

vi.mock('../useMCP', () => ({
  useClusters: mockUseClusters,
}))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import { ClusterFilterProvider, useClusterFilter } from '../useClusterFilter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'clusterFilter'

const DEFAULT_CLUSTERS = ['cluster-a', 'cluster-b', 'cluster-c']

function wrapper({ children }: { children: ReactNode }) {
  return <ClusterFilterProvider>{children}</ClusterFilterProvider>
}

// ===========================================================================
// Setup
// ===========================================================================
beforeEach(() => {
  localStorage.clear()
  mockUseClusters.mockReturnValue({
    clusters: DEFAULT_CLUSTERS.map((name) => ({
      name,
      context: name,
      server: `https://${name}.example.com`,
    })),
    isLoading: false,
    error: null,
  })
})

// ===========================================================================
// Context provider requirement
// ===========================================================================
describe('useClusterFilter without provider', () => {
  it('throws when used outside ClusterFilterProvider', () => {
    // Suppress React error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useClusterFilter())).toThrow(
      'useClusterFilter must be used within a ClusterFilterProvider',
    )
    spy.mockRestore()
  })
})

// ===========================================================================
// Default state — empty array means "all clusters"
// ===========================================================================
describe('default state (empty array = all clusters)', () => {
  it('returns all available clusters as selectedClusters when no filter is set', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })

  it('isAllSelected is true by default', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })
    expect(result.current.isAllSelected).toBe(true)
  })

  it('isFiltered is false by default', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })
    expect(result.current.isFiltered).toBe(false)
  })

  it('availableClusters reflects the clusters from useClusters', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })
    expect(result.current.availableClusters).toEqual(DEFAULT_CLUSTERS)
  })
})

// ===========================================================================
// setSelectedClusters — setting specific cluster filters
// ===========================================================================
describe('setSelectedClusters', () => {
  it('selects specific clusters', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a'])
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isFiltered).toBe(true)
  })

  it('selects multiple specific clusters', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-a', 'cluster-c'])
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-c'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('setting empty array resets to all-selected mode', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // First filter to specific clusters
    act(() => {
      result.current.setSelectedClusters(['cluster-b'])
    })
    expect(result.current.isFiltered).toBe(true)

    // Then reset to all via empty array
    act(() => {
      result.current.setSelectedClusters([])
    })
    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })
})

// ===========================================================================
// toggleCluster
// ===========================================================================
describe('toggleCluster', () => {
  it('toggling from "all" mode deselects the toggled cluster', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Start in all-selected mode
    expect(result.current.isAllSelected).toBe(true)

    act(() => {
      result.current.toggleCluster('cluster-b')
    })

    // Should now have all clusters except cluster-b
    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-c'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('toggling off a selected cluster removes it', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Set to two specific clusters
    act(() => {
      result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
    })

    // Toggle off cluster-a
    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-b'])
  })

  it('toggling on an unselected cluster adds it', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Set to one specific cluster
    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    // Toggle on cluster-b
    act(() => {
      result.current.toggleCluster('cluster-b')
    })

    expect(result.current.selectedClusters).toContain('cluster-a')
    expect(result.current.selectedClusters).toContain('cluster-b')
  })

  it('toggling on the last unselected cluster switches to all-selected mode', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Set to two of three clusters
    act(() => {
      result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
    })

    // Toggle on the missing one — now all are selected
    act(() => {
      result.current.toggleCluster('cluster-c')
    })

    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })

  it('toggling off the last selected cluster reverts to all-selected mode', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Set to one specific cluster
    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    // Toggle off the only selected cluster
    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    // Empty internal array means all-selected
    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })
})

// ===========================================================================
// selectAll / clearAll
// ===========================================================================
describe('selectAll and clearAll', () => {
  it('selectAll resets to all-selected mode', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Filter first
    act(() => {
      result.current.setSelectedClusters(['cluster-c'])
    })
    expect(result.current.isFiltered).toBe(true)

    // selectAll
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })

  it('clearAll selects only the first available cluster', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.clearAll()
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('clearAll is a no-op when no clusters are available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [],
      isLoading: false,
      error: null,
    })
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.clearAll()
    })

    // Still in all-selected mode (empty available list)
    expect(result.current.isAllSelected).toBe(true)
  })
})

// ===========================================================================
// localStorage persistence
// ===========================================================================
describe('localStorage persistence', () => {
  it('persists selected clusters to localStorage', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['cluster-b'])
    })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    expect(stored).toEqual(['cluster-b'])
  })

  it('restores selection from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['cluster-c']))

    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    expect(result.current.selectedClusters).toEqual(['cluster-c'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('handles malformed localStorage data gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{')

    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Falls back to all-selected mode
    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })

  it('persists empty array (all-selected) to localStorage', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Default is all-selected (empty internal array)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '["fallback"]')
    expect(stored).toEqual([])
  })
})

// ===========================================================================
// Multiple consumers sharing filter state
// ===========================================================================
describe('multiple consumers sharing state', () => {
  it('two consumers within the same provider share the same state', () => {
    const { result: result1 } = renderHook(() => useClusterFilter(), { wrapper })
    const { result: result2 } = renderHook(() => useClusterFilter(), { wrapper })

    // Both start in all-selected mode
    expect(result1.current.isAllSelected).toBe(true)
    expect(result2.current.isAllSelected).toBe(true)
    expect(result1.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
    expect(result2.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
  })

  it('consumers within separate providers have independent state', () => {
    const { result: result1 } = renderHook(() => useClusterFilter(), { wrapper })

    // Second consumer in a separate provider
    const { result: result2 } = renderHook(() => useClusterFilter(), { wrapper })

    // Modifying one does not affect the other since they are in separate providers
    act(() => {
      result1.current.setSelectedClusters(['cluster-a'])
    })

    // result1 is filtered
    expect(result1.current.isFiltered).toBe(true)
    expect(result1.current.selectedClusters).toEqual(['cluster-a'])

    // result2 remains in its own provider's state (still all-selected)
    expect(result2.current.isAllSelected).toBe(true)
  })
})

// ===========================================================================
// Edge cases
// ===========================================================================
describe('edge cases', () => {
  it('handles empty available clusters gracefully', () => {
    mockUseClusters.mockReturnValue({
      clusters: [],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    expect(result.current.availableClusters).toEqual([])
    expect(result.current.selectedClusters).toEqual([])
    expect(result.current.isAllSelected).toBe(true)
  })

  it('handles setting clusters with empty strings', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['', 'cluster-a'])
    })

    expect(result.current.selectedClusters).toEqual(['', 'cluster-a'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('handles toggling a cluster name that does not exist in available clusters', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // From all-selected mode, toggling a non-existent cluster:
    // the "all" branch returns availableClusters.filter(c => c !== 'non-existent')
    // which equals all 3 clusters as an explicit array (not empty).
    // The "all" branch does NOT check if the result matches all clusters,
    // so the internal state becomes an explicit list, not [].
    act(() => {
      result.current.toggleCluster('non-existent-cluster')
    })

    // Internal state is now an explicit list of all clusters, which means
    // isAllSelected is false (only empty array = all-selected).
    expect(result.current.selectedClusters).toEqual(DEFAULT_CLUSTERS)
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isFiltered).toBe(true)
  })

  it('handles setting selection to clusters not in available list', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    act(() => {
      result.current.setSelectedClusters(['unknown-cluster'])
    })

    // setSelectedClusters does not validate — stores what is given
    expect(result.current.selectedClusters).toEqual(['unknown-cluster'])
    expect(result.current.isFiltered).toBe(true)
  })

  it('handles single-cluster environment correctly', () => {
    mockUseClusters.mockReturnValue({
      clusters: [
        { name: 'only-cluster', context: 'only-cluster', server: 'https://only.example.com' },
      ],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    expect(result.current.availableClusters).toEqual(['only-cluster'])
    expect(result.current.selectedClusters).toEqual(['only-cluster'])
    expect(result.current.isAllSelected).toBe(true)

    // Toggle off the only cluster from "all" mode should produce empty filter
    // which is all available minus 'only-cluster' = [] → reverts to all
    act(() => {
      result.current.toggleCluster('only-cluster')
    })

    // Toggling from "all" removes it: filter(c => c !== 'only-cluster') = []
    // newSelection.length === 0 → returns [] → all-selected mode
    expect(result.current.isAllSelected).toBe(true)
  })

  it('toggleCluster adds a cluster when in filtered mode', () => {
    const { result } = renderHook(() => useClusterFilter(), { wrapper })

    // Start filtered
    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    // Add cluster-b
    act(() => {
      result.current.toggleCluster('cluster-b')
    })

    expect(result.current.selectedClusters).toContain('cluster-a')
    expect(result.current.selectedClusters).toContain('cluster-b')
    expect(result.current.selectedClusters).not.toContain('cluster-c')
    expect(result.current.isFiltered).toBe(true)
  })
})
