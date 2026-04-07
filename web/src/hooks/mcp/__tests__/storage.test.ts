import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockApiPost,
  mockApiDelete,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockKubectlProxy,
  mockClusterCacheRef,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true),
    mockReportAgentDataSuccess: vi.fn(),
    mockApiGet: vi.fn(),
    mockApiPost: vi.fn(),
    mockApiDelete: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
    mockKubectlProxy: { getPVCs: vi.fn() },
    mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
    capturedCacheResets,
  }
})

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  LOCAL_AGENT_URL: 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  DEPLOY_ABORT_TIMEOUT_MS: 10_000,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  usePVCs,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  subscribeStorageCache,
  GPU_RESOURCE_TYPES,
  COMMON_RESOURCE_TYPES,
} from '../storage'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockClusterCacheRef.clusters = []
  mockApiGet.mockResolvedValue({ data: { pvcs: [], pvs: [] } })
  mockApiPost.mockResolvedValue({ data: { resourceQuota: {} } })
  mockApiDelete.mockResolvedValue({})
  // Reset module-level caches to prevent cross-test contamination.
  // The registerCacheReset callback sets pvcsCache = null internally.
  const resetStorage = capturedCacheResets.get('storage')
  if (resetStorage) resetStorage()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// usePVCs
// ===========================================================================

describe('usePVCs', () => {
  it('returns initial loading state when no cache exists', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePVCs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvcs).toEqual([])
  })

  it('returns PVCs after successful REST fetch', async () => {
    const fakePVCs = [
      { name: 'pvc-1', namespace: 'default', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'standard' },
    ]
    mockApiGet.mockResolvedValue({ data: { pvcs: fakePVCs } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual(fakePVCs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { pvcs: [] } })

    renderHook(() => usePVCs('my-cluster', 'my-ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { pvcs: [] } })
    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears the interval on unmount', async () => {
    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { pvcs: [] } })

    const { unmount } = renderHook(() => usePVCs())

    // Advance time past one interval
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = mockApiGet.mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new API calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect(mockApiGet.mock.calls.length).toBe(callsAfterPoll)
  })

  it('reacts to storage cache reset by clearing data and entering loading state', async () => {
    const fakePVCs = [
      { name: 'pvc-1', namespace: 'default', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'standard' },
    ]
    mockApiGet.mockResolvedValue({ data: { pvcs: fakePVCs } })

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.pvcs.length).toBeGreaterThan(0))

    // Block the next fetch so loading state is visible after reset
    mockApiGet.mockReturnValue(new Promise(() => {}))

    // Trigger the real cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('storage')
    expect(reset).toBeDefined()
    await act(async () => { reset!() })

    // Hook reacts: loading flag is set and visible data is cleared
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvcs).toEqual([])
  })

  it('returns demo PVCs in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty PVCs with error: null on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('fetch error'))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// usePVs
// ===========================================================================

describe('usePVs', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePVs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvs).toEqual([])
  })

  it('returns PVs after successful fetch', async () => {
    const fakePVs = [{ name: 'pv-1', cluster: 'c1', capacity: '100Gi', storageClass: 'gp2', status: 'Available' }]
    mockApiGet.mockResolvedValue({ data: { pvs: fakePVs } })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual(fakePVs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { pvs: [] } })

    renderHook(() => usePVs('target-cluster'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=target-cluster')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { pvs: [] } })
    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears interval on unmount', async () => {
    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { pvs: [] } })

    const { unmount } = renderHook(() => usePVs())

    // Advance time past one interval
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = mockApiGet.mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new API calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect(mockApiGet.mock.calls.length).toBe(callsAfterPoll)
  })

  it('returns empty list with error: null on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useResourceQuotas
// ===========================================================================

describe('useResourceQuotas', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useResourceQuotas())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resourceQuotas).toEqual([])
  })

  it('returns resource quotas after fetch resolves', async () => {
    const fakeQuotas = [{ name: 'compute-quota', namespace: 'production', cluster: 'c1', hard: { pods: '50' }, used: { pods: '10' }, age: '30d' }]
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: fakeQuotas } })

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual(fakeQuotas)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: [] } })

    renderHook(() => useResourceQuotas('my-cluster', 'my-ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: [] } })
    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns demo quotas in demo mode (without forceLive)', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('bypasses demo mode and fetches live data when forceLive=true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const liveQuotas = [{ name: 'live-quota', namespace: 'prod', cluster: 'c1', hard: { pods: '100' }, used: { pods: '20' }, age: '1d' }]
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: liveQuotas } })

    const { result } = renderHook(() => useResourceQuotas(undefined, undefined, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive=true skips demo data; real API is called and live data is returned
    expect(mockApiGet).toHaveBeenCalled()
    expect(result.current.resourceQuotas).toEqual(liveQuotas)
    expect(result.current.error).toBeNull()
  })

  it('returns empty list with error: null on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useLimitRanges
// ===========================================================================

describe('useLimitRanges', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useLimitRanges())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.limitRanges).toEqual([])
  })

  it('returns limit ranges after fetch resolves', async () => {
    const fakeLRs = [{ name: 'container-limits', namespace: 'production', cluster: 'c1', limits: [], age: '30d' }]
    mockApiGet.mockResolvedValue({ data: { limitRanges: fakeLRs } })

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual(fakeLRs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { limitRanges: [] } })

    renderHook(() => useLimitRanges('test-cluster', 'test-ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=test-cluster')
    expect(url).toContain('namespace=test-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { limitRanges: [] } })
    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns demo limit ranges in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty list with error: null on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// usePVCs - PVC capacity parsing and varied data shapes
// ===========================================================================

describe('usePVCs - capacity and data shape variants', () => {
  it('handles PVCs with various capacity units (Gi, Ti, Mi)', async () => {
    const pvcsMixed = [
      { name: 'small-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '100Mi', storageClass: 'standard' },
      { name: 'medium-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '50Gi', storageClass: 'gp3' },
      { name: 'large-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '2Ti', storageClass: 'fast-ssd' },
    ]
    mockApiGet.mockResolvedValue({ data: { pvcs: pvcsMixed } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(3)
    expect(result.current.pvcs[0].capacity).toBe('100Mi')
    expect(result.current.pvcs[1].capacity).toBe('50Gi')
    expect(result.current.pvcs[2].capacity).toBe('2Ti')
  })

  it('handles PVCs with missing optional fields (no capacity, no storageClass)', async () => {
    const sparseData = [
      { name: 'minimal-pvc', namespace: 'default', status: 'Pending' },
    ]
    mockApiGet.mockResolvedValue({ data: { pvcs: sparseData } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].capacity).toBeUndefined()
    expect(result.current.pvcs[0].storageClass).toBeUndefined()
  })

  it('handles API returning null pvcs field gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: { pvcs: null } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles API returning undefined pvcs field gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo PVCs by cluster when cluster is specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo data has PVCs on prod-east, staging, and vllm-d
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo PVCs by namespace when namespace is specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs(undefined, 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.namespace === 'monitoring')).toBe(true)
  })

  it('filters demo PVCs by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs('staging', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.cluster === 'staging' && p.namespace === 'monitoring')).toBe(true)
  })
})

// ===========================================================================
// usePVCs - multi-cluster aggregation via local agent
// ===========================================================================

describe('usePVCs - multi-cluster aggregation via local agent', () => {
  it('aggregates PVCs from multiple clusters via local agent', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]

    const pvcA = { name: 'pvc-a', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }
    const pvcB = { name: 'pvc-b', namespace: 'ns2', status: 'Bound', capacity: '20Gi' }

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [pvcA] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [pvcB] }),
      })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(2)
    // Each PVC should be tagged with its cluster name
    expect(result.current.pvcs[0].cluster).toBe('cluster-a')
    expect(result.current.pvcs[1].cluster).toBe('cluster-b')
    expect(result.current.error).toBeNull()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('handles partial cluster failure when one agent endpoint fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'good-cluster', context: 'ctx-good', reachable: true },
      { name: 'bad-cluster', context: 'ctx-bad', reachable: true },
    ]

    const goodPvc = { name: 'pvc-good', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [goodPvc] }),
      })
      .mockRejectedValueOnce(new Error('cluster unreachable'))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still return data from the successful cluster
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('pvc-good')
  })

  it('skips unreachable clusters in aggregation', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'reachable', context: 'ctx-r', reachable: true },
      { name: 'unreachable', context: 'ctx-u', reachable: false },
    ]

    const pvc = { name: 'pvc-r', namespace: 'ns1', status: 'Bound', capacity: '5Gi' }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [pvc] }),
    })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    // fetch should only be called once (for the reachable cluster)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches from single cluster via agent when cluster param is provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]

    const pvc = { name: 'specific-pvc', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [pvc] }),
    })

    const { result } = renderHook(() => usePVCs('target-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should only call fetch once for the specified cluster, not iterate all
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=target-cluster')
  })
})

// ===========================================================================
// usePVCs - kubectl proxy fallback
// ===========================================================================

describe('usePVCs - kubectl proxy fallback', () => {
  it('falls back to kubectl proxy when agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-x', context: 'ctx-x', reachable: true },
    ]

    // Agent fetch returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    const kubePvc = { name: 'kubectl-pvc', namespace: 'default', status: 'Bound', capacity: '8Gi', storageClass: 'standard' }
    mockKubectlProxy.getPVCs.mockResolvedValue([kubePvc])

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockKubectlProxy.getPVCs).toHaveBeenCalled()
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('kubectl-pvc')
    expect(result.current.pvcs[0].cluster).toBe('cluster-x')
  })
})

// ===========================================================================
// usePVCs - consecutive failures and isFailed
// ===========================================================================

describe('usePVCs - consecutive failure tracking', () => {
  it('sets isFailed=true after 3 consecutive API failures', async () => {
    mockApiGet.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // First failure: consecutiveFailures=1
    expect(result.current.consecutiveFailures).toBe(1)
    expect(result.current.isFailed).toBe(false)

    // Trigger more refetches to accumulate failures
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))
    expect(result.current.isFailed).toBe(false)

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures to 0 on successful fetch', async () => {
    // Start with failures
    mockApiGet.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Now succeed
    mockApiGet.mockResolvedValue({ data: { pvcs: [{ name: 'pvc-ok', namespace: 'ns', status: 'Bound' }] } })
    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
    expect(result.current.pvcs).toHaveLength(1)
  })
})

// ===========================================================================
// usePVs - additional edge cases
// ===========================================================================

describe('usePVs - additional edge cases', () => {
  it('handles API returning null pvs field', async () => {
    mockApiGet.mockResolvedValue({ data: { pvs: null } })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles API returning undefined pvs field', async () => {
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
  })

  it('tracks consecutive failures and isFailed for PVs', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(1)
    expect(result.current.isFailed).toBe(false)

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('returns PVs with various storage classes and statuses', async () => {
    const mixedPVs = [
      { name: 'pv-available', cluster: 'c1', capacity: '200Gi', storageClass: 'gp3', status: 'Available' },
      { name: 'pv-bound', cluster: 'c1', capacity: '100Gi', storageClass: 'standard', status: 'Bound' },
      { name: 'pv-released', cluster: 'c2', capacity: '50Gi', storageClass: 'fast-ssd', status: 'Released' },
      { name: 'pv-failed', cluster: 'c2', capacity: '10Gi', storageClass: 'cold-storage', status: 'Failed' },
    ]
    mockApiGet.mockResolvedValue({ data: { pvs: mixedPVs } })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toHaveLength(4)
    const statuses = result.current.pvs.map(pv => pv.status)
    expect(statuses).toEqual(['Available', 'Bound', 'Released', 'Failed'])
  })
})

// ===========================================================================
// useResourceQuotas - additional edge cases
// ===========================================================================

describe('useResourceQuotas - additional edge cases', () => {
  it('handles API returning null resourceQuotas field', async () => {
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: null } })

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo quotas by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q => q.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo quotas by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas(undefined, 'ml'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q => q.namespace === 'ml')).toBe(true)
  })
})

// ===========================================================================
// useLimitRanges - additional edge cases
// ===========================================================================

describe('useLimitRanges - additional edge cases', () => {
  it('handles API returning null limitRanges field', async () => {
    mockApiGet.mockResolvedValue({ data: { limitRanges: null } })

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo limit ranges by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('vllm-d'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr => lr.cluster === 'vllm-d')).toBe(true)
  })

  it('filters demo limit ranges by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges(undefined, 'data'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr => lr.namespace === 'data')).toBe(true)
  })
})

// ===========================================================================
// createOrUpdateResourceQuota
// ===========================================================================

describe('createOrUpdateResourceQuota', () => {
  it('posts to API and returns the created quota', async () => {
    const spec = {
      cluster: 'prod-east',
      name: 'new-quota',
      namespace: 'default',
      hard: { pods: '100', 'requests.cpu': '10' },
    }
    const createdQuota = { ...spec, used: { pods: '0', 'requests.cpu': '0' }, age: '0s' }
    mockApiPost.mockResolvedValue({ data: { resourceQuota: createdQuota } })

    const result = await createOrUpdateResourceQuota(spec)

    expect(mockApiPost).toHaveBeenCalledWith('/api/mcp/resourcequotas', spec)
    expect(result).toEqual(createdQuota)
  })

  it('propagates API error on failure', async () => {
    mockApiPost.mockRejectedValue(new Error('403 Forbidden'))

    await expect(createOrUpdateResourceQuota({
      cluster: 'c1',
      name: 'q1',
      namespace: 'ns',
      hard: { pods: '10' },
    })).rejects.toThrow('403 Forbidden')
  })
})

// ===========================================================================
// deleteResourceQuota
// ===========================================================================

describe('deleteResourceQuota', () => {
  it('sends DELETE request with correct query parameters', async () => {
    mockApiDelete.mockResolvedValue({})

    await deleteResourceQuota('prod-east', 'default', 'compute-quota')

    expect(mockApiDelete).toHaveBeenCalledWith(
      '/api/mcp/resourcequotas?cluster=prod-east&namespace=default&name=compute-quota'
    )
  })

  it('propagates API error on delete failure', async () => {
    mockApiDelete.mockRejectedValue(new Error('404 Not Found'))

    await expect(deleteResourceQuota('c1', 'ns', 'missing')).rejects.toThrow('404 Not Found')
  })
})

// ===========================================================================
// subscribeStorageCache
// ===========================================================================

describe('subscribeStorageCache', () => {
  it('subscribes to cache notifications and can unsubscribe', async () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribeStorageCache(subscriber)

    // Trigger a cache reset to invoke subscribers
    const reset = capturedCacheResets.get('storage')
    expect(reset).toBeDefined()
    reset!()

    // Subscriber should have been called with isResetting=true
    expect(subscriber).toHaveBeenCalled()
    const callArg = subscriber.mock.calls[0][0]
    expect(callArg.isResetting).toBe(true)

    // After unsubscribe, no further notifications
    unsubscribe()
    subscriber.mockClear()
    reset!()
    expect(subscriber).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Exported constants
// ===========================================================================

describe('GPU_RESOURCE_TYPES', () => {
  it('contains NVIDIA and AMD GPU resource types', () => {
    const keys = GPU_RESOURCE_TYPES.map(t => t.key)
    expect(keys).toContain('requests.nvidia.com/gpu')
    expect(keys).toContain('limits.nvidia.com/gpu')
    expect(keys).toContain('requests.amd.com/gpu')
    expect(keys).toContain('limits.amd.com/gpu')
  })

  it('has exactly 4 GPU resource type entries', () => {
    expect(GPU_RESOURCE_TYPES).toHaveLength(4)
  })
})

describe('COMMON_RESOURCE_TYPES', () => {
  it('includes all GPU_RESOURCE_TYPES entries', () => {
    const commonKeys = COMMON_RESOURCE_TYPES.map(t => t.key)
    for (const gpu of GPU_RESOURCE_TYPES) {
      expect(commonKeys).toContain(gpu.key)
    }
  })

  it('includes standard resource types (cpu, memory, pods, services, pvcs, storage)', () => {
    const commonKeys = COMMON_RESOURCE_TYPES.map(t => t.key)
    expect(commonKeys).toContain('requests.cpu')
    expect(commonKeys).toContain('limits.cpu')
    expect(commonKeys).toContain('requests.memory')
    expect(commonKeys).toContain('limits.memory')
    expect(commonKeys).toContain('pods')
    expect(commonKeys).toContain('services')
    expect(commonKeys).toContain('persistentvolumeclaims')
    expect(commonKeys).toContain('requests.storage')
  })

  it('has 12 total entries (8 common + 4 GPU)', () => {
    const EXPECTED_COMMON_COUNT = 8
    const EXPECTED_GPU_COUNT = 4
    expect(COMMON_RESOURCE_TYPES).toHaveLength(EXPECTED_COMMON_COUNT + EXPECTED_GPU_COUNT)
  })

  it('each entry has key, label, and description', () => {
    for (const entry of COMMON_RESOURCE_TYPES) {
      expect(entry.key).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  })
})

// ===========================================================================
// Additional branch coverage — storage.ts
// ===========================================================================

describe('usePVCs — additional branches', () => {
  it('returns the complete return shape with all expected keys', async () => {
    mockApiGet.mockResolvedValue({ data: { pvcs: [] } })
    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('pvcs')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('agent endpoint non-ok falls through to kubectl proxy', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-y', context: 'ctx-y', reachable: true },
    ]

    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    // kubectl proxy succeeds
    const kubePvc = { name: 'kube-pvc', namespace: 'default', status: 'Bound', capacity: '5Gi', storageClass: 'gp2' }
    mockKubectlProxy.getPVCs.mockResolvedValue([kubePvc])

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockKubectlProxy.getPVCs).toHaveBeenCalled()
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].cluster).toBe('cluster-y')
  })

  it('both agent and kubectl proxy fail — falls through to REST API', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-z', context: 'ctx-z', reachable: true },
    ]

    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    // kubectl proxy also fails
    mockKubectlProxy.getPVCs.mockRejectedValue(new Error('kubectl failed'))

    // REST API succeeds
    const restPvc = { name: 'rest-pvc', namespace: 'ns', cluster: 'cluster-z', status: 'Bound', capacity: '10Gi' }
    mockApiGet.mockResolvedValue({ data: { pvcs: [restPvc] } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('rest-pvc')
  })

  it('preserves stale data on error when cache exists', async () => {
    const initialPvc = { name: 'cached-pvc', namespace: 'ns', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'gp3' }
    mockApiGet.mockResolvedValueOnce({ data: { pvcs: [initialPvc] } })

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.pvcs).toHaveLength(1))

    // Next fetch fails
    mockApiGet.mockRejectedValue(new Error('server error'))
    await act(async () => { result.current.refetch() })

    // Should preserve cached data, not clear it
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('cached-pvc')
  })

  it('sets lastUpdated and lastRefresh after successful fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { pvcs: [{ name: 'p', namespace: 'n', status: 'Bound' }] } })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastUpdated).not.toBeNull()
    expect(result.current.lastRefresh).not.toBeNull()
  })

  it('demo mode sets lastUpdated on successful demo data load', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastUpdated).not.toBeNull()
  })
})

describe('usePVs — additional branches', () => {
  it('returns the complete return shape with all expected keys', async () => {
    mockApiGet.mockResolvedValue({ data: { pvs: [] } })
    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('pvs')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
  })

  it('resets consecutiveFailures to 0 on successful fetch after errors', async () => {
    // First: fail
    mockApiGet.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => usePVs())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Then: succeed
    mockApiGet.mockResolvedValue({ data: { pvs: [{ name: 'pv', status: 'Available' }] } })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
  })

  it('sets isRefreshing during fetch and clears after', async () => {
    let resolvePromise: (v: unknown) => void
    mockApiGet.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    const { result } = renderHook(() => usePVs())

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Resolve the API call
    await act(async () => { resolvePromise!({ data: { pvs: [] } }) })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })
})

describe('useResourceQuotas — additional branches', () => {
  it('filters demo quotas by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q =>
      q.cluster === 'prod-east' && q.namespace === 'production'
    )).toBe(true)
  })

  it('handles API returning undefined resourceQuotas field', async () => {
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
  })

  it('provides a refetch function that can be called multiple times', async () => {
    mockApiGet.mockResolvedValue({ data: { resourceQuotas: [] } })
    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })
    await act(async () => { result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

describe('useLimitRanges — additional branches', () => {
  it('filters demo limit ranges by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr =>
      lr.cluster === 'prod-east' && lr.namespace === 'production'
    )).toBe(true)
  })

  it('handles API returning undefined limitRanges field', async () => {
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
  })

  it('returns empty array when demo mode filter produces no matches', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('nonexistent-cluster', 'nonexistent-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

describe('subscribeStorageCache', () => {
  it('returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeStorageCache(callback)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('does not call callback after unsubscribe', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeStorageCache(callback)
    unsubscribe()
    // After unsubscribing, the callback should not be notified
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('deleteResourceQuota', () => {
  it('calls DELETE with correct params', async () => {
    await deleteResourceQuota('cluster-x', 'namespace-y', 'quota-z')
    expect(mockApiDelete).toHaveBeenCalledWith(
      '/api/mcp/resourcequotas?cluster=cluster-x&namespace=namespace-y&name=quota-z'
    )
  })

  it('propagates API error on failure', async () => {
    mockApiDelete.mockRejectedValue(new Error('403 Forbidden'))
    await expect(deleteResourceQuota('c', 'ns', 'q')).rejects.toThrow('403 Forbidden')
  })
})
