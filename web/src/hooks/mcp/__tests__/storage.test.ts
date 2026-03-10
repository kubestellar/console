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
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  DEPLOY_ABORT_TIMEOUT_MS: 10_000,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { usePVCs, usePVs, useResourceQuotas, useLimitRanges } from '../storage'

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
