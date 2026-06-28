import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const {
  mockAgentFetch,
  mockKubectlProxy,
  mockReportAgentDataSuccess,
  mockIsAgentUnavailable,
  mockIsDemoMode,
  mockUseDemoMode,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockKubectlProxy: { getPVCs: vi.fn(), getPVs: vi.fn(), getResourceQuotas: vi.fn(), getLimitRanges: vi.fn() },
  mockReportAgentDataSuccess: vi.fn(),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockClusterCacheRef: {
    clusters: [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ],
  },
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  getEffectiveInterval: (ms: number) => ms,
  getLocalAgentURL: () => 'http://127.0.0.1:8585/mcp',
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: () => vi.fn(),
}))

vi.mock('../dedup', () => ({
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../../../lib/utils/concurrency', () => ({
  settledWithConcurrency: async (tasks: (() => Promise<unknown>)[]) => {
    const results = await Promise.allSettled(tasks.map(task => task()))
    return results
  },
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  }
})

vi.mock('../../../lib/cache', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    CONSECUTIVE_FAILURE_THRESHOLD: 3,
  }
})

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: () => false,
}))

vi.mock('./useClusterResourceQuery', () => ({
  useClusterResourceQuery: () => ({ data: [], isLoading: false, error: null }),
}))

import { usePVCs } from '../storage'

describe('storage hooks - usePVCs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsDemoMode.mockReturnValue(false)
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Test 1: Loading → Success state transition
  it('transitions from loading to success when PVCs are fetched successfully', async () => {
    const mockPVCs = [
      {
        name: 'pvc-1',
        namespace: 'default',
        status: 'Bound',
        capacity: '10Gi',
        storageClass: 'standard',
      },
    ]

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: mockPVCs }),
    })

    const { result } = renderHook(() => usePVCs('cluster-a'))

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvcs).toEqual([])

    // Wait for success
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0]).toMatchObject({
      name: 'pvc-1',
      cluster: 'cluster-a',
      status: 'Bound',
    })
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
    expect(mockReportAgentDataSuccess).toHaveBeenCalledTimes(1)
  })

  // Test 2: Loading → Error state transition
  it('transitions from loading to error when fetch fails', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))
    mockKubectlProxy.getPVCs.mockRejectedValue(new Error('kubectl failed'))
    mockIsAgentUnavailable.mockReturnValue(false)

    const { result } = renderHook(() => usePVCs('cluster-a'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.pvcs).toEqual([])
    expect(result.current.consecutiveFailures).toBeGreaterThan(0)
  })

  // Test 3: Cache hydration on mount
  it('hydrates from localStorage cache and shows stale data immediately', async () => {
    const cachedData = {
      data: [{ name: 'cached-pvc', namespace: 'kube-system', cluster: 'cluster-a', status: 'Bound', capacity: '5Gi' }],
      timestamp: new Date().toISOString(),
      key: 'pvcs:cluster-a:all',
    }
    localStorage.setItem('kubestellar-pvcs-cache', JSON.stringify(cachedData))

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [{ name: 'fresh-pvc', namespace: 'default', status: 'Bound', capacity: '10Gi' }] }),
    })

    const { result } = renderHook(() => usePVCs('cluster-a'))

    // Cached data should be available immediately (not loading)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('cached-pvc')

    // Wait for fresh data
    await waitFor(() => expect(result.current.pvcs[0].name).toBe('fresh-pvc'))
    expect(result.current.pvcs).toHaveLength(1)
  })

  // Test 4: Refetch logic (stale-while-revalidate)
  it('shows cached data during refetch without flickering to loading state', async () => {
    const initialData = [{ name: 'pvc-1', namespace: 'default', status: 'Bound', capacity: '10Gi' }]
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pvcs: initialData }),
    })

    const { result } = renderHook(() => usePVCs('cluster-a'))
    await waitFor(() => expect(result.current.pvcs).toHaveLength(1))

    const updatedData = [
      ...initialData,
      { name: 'pvc-2', namespace: 'default', status: 'Bound', capacity: '20Gi' },
    ]
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pvcs: updatedData }),
    })

    // Trigger refetch
    result.current.refetch()

    // Should show isRefreshing, but NOT isLoading, and data should still be present
    await waitFor(() => expect(result.current.isRefreshing).toBe(true))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.pvcs).toHaveLength(1) // Still showing old data

    // Wait for new data
    await waitFor(() => expect(result.current.pvcs).toHaveLength(2))
    expect(result.current.isRefreshing).toBe(false)
  })

  // Test 5: Parameter validation - empty cluster name
  it('handles empty cluster parameter gracefully', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [] }),
    })

    const { result } = renderHook(() => usePVCs(''))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // Test 6: Parameter validation - namespace filtering
  it('filters PVCs by namespace when namespace parameter is provided', async () => {
    const mockPVCs = [
      { name: 'pvc-1', namespace: 'default', status: 'Bound', capacity: '10Gi' },
      { name: 'pvc-2', namespace: 'kube-system', status: 'Bound', capacity: '20Gi' },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: mockPVCs }),
    })

    const { result } = renderHook(() => usePVCs('cluster-a', 'default'))

    await waitFor(() => expect(result.current.pvcs).toHaveLength(2))
    // Verify namespace was passed in the fetch call
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('namespace=default'),
      expect.any(Object)
    )
  })

  // Test 7: Demo mode fallback
  it('returns demo data when demo mode is enabled', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  // Test 8: Error recovery after consecutive failures
  it('tracks consecutive failures and recovers when fetch succeeds', async () => {
    mockAgentFetch
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [{ name: 'pvc-1', namespace: 'default', status: 'Bound', capacity: '10Gi' }] }),
      })

    mockKubectlProxy.getPVCs.mockRejectedValue(new Error('kubectl also fails'))

    const { result, rerender } = renderHook(() => usePVCs('cluster-a'))

    // First failure
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThan(0))
    const firstFailureCount = result.current.consecutiveFailures

    // Trigger refetch (second failure)
    result.current.refetch()
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThan(firstFailureCount))

    // Trigger refetch (success)
    result.current.refetch()
    await waitFor(() => expect(result.current.pvcs).toHaveLength(1))
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
  })

  // Test 9: Multi-cluster aggregation
  it('aggregates PVCs from multiple clusters when no cluster is specified', async () => {
    mockAgentFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [{ name: 'pvc-cluster-a', namespace: 'default', status: 'Bound', capacity: '10Gi' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [{ name: 'pvc-cluster-b', namespace: 'default', status: 'Bound', capacity: '20Gi' }] }),
      })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.pvcs.length).toBeGreaterThanOrEqual(2))
    const clusterNames = result.current.pvcs.map(p => p.cluster)
    expect(clusterNames).toContain('cluster-a')
    expect(clusterNames).toContain('cluster-b')
  })

  // Test 10: Cache invalidation on cluster change
  it('clears cached data and reloads when cluster parameter changes', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [{ name: 'pvc-1', namespace: 'default', status: 'Bound', capacity: '10Gi' }] }),
    })

    const { result, rerender } = renderHook(
      ({ cluster }) => usePVCs(cluster),
      { initialProps: { cluster: 'cluster-a' } }
    )

    await waitFor(() => expect(result.current.pvcs).toHaveLength(1))
    expect(result.current.pvcs[0].cluster).toBe('cluster-a')

    // Change cluster
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [{ name: 'pvc-2', namespace: 'default', status: 'Bound', capacity: '20Gi' }] }),
    })

    rerender({ cluster: 'cluster-b' })

    // Should transition to loading
    await waitFor(() => expect(result.current.isLoading).toBe(true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs[0].cluster).toBe('cluster-b')
  })
})
