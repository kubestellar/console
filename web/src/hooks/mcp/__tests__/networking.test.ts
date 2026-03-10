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
  mockClusterCacheRef,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true), // agent unavailable by default
    mockReportAgentDataSuccess: vi.fn(),
    mockApiGet: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
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
  kubectlProxy: { getServices: vi.fn() },
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
// Imports under test (after mocks are declared)
// ---------------------------------------------------------------------------

import {
  useServices,
  useIngresses,
  useNetworkPolicies,
} from '../networking'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// useServices calls fetch() directly (not api.get), so we mock globalThis.fetch
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
  // Default: services REST fetch returns empty list
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ services: [] }),
  })
  // Default: ingresses and networkpolicies REST fetch returns empty
  mockApiGet.mockResolvedValue({ data: { ingresses: [], networkpolicies: [] } })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useServices
// ===========================================================================

describe('useServices', () => {
  it('returns initial loading state when no cache exists', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useServices())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])
  })

  it('returns services after successful REST fetch', async () => {
    const fakeServices = [
      { name: 'svc-a', namespace: 'default', cluster: 'cluster-1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: fakeServices }),
    })

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services).toEqual(fakeServices)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace as query params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    renderHook(() => useServices('my-cluster', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    )
  })

  it('polls every REFRESH_INTERVAL_MS and clears the interval on unmount', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { unmount } = renderHook(() => useServices())

    // Advance time to trigger one poll cycle
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterPoll)
  })

  it('reacts to networking cache reset by clearing data and entering loading state', async () => {
    const fakeServices = [
      { name: 'svc-a', namespace: 'default', cluster: 'c1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: fakeServices }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.services.length).toBeGreaterThan(0))

    // Block the next fetch so loading state is visible after reset
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    // Trigger the real cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('services')
    expect(reset).toBeDefined()
    await act(async () => { reset!() })

    // Hook reacts: loading flag is set and visible data is cleared
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])
  })

  it('does not surface an error on fetch failure (services are optional)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // useServices never surfaces an error string — services are optional
    expect(result.current.error).toBeNull()
    // The hook either shows stale cached data or demo services — no crash
    expect(result.current.isLoading).toBe(false)
  })

  it('returns demo services when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useIngresses
// ===========================================================================

describe('useIngresses', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useIngresses())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.ingresses).toEqual([])
  })

  it('returns ingresses after fetch resolves', async () => {
    const fakeIngresses = [{ name: 'ing-1', namespace: 'default', cluster: 'c1' }]
    mockApiGet.mockResolvedValue({ data: { ingresses: fakeIngresses } })

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses).toEqual(fakeIngresses)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { ingresses: [] } })
    renderHook(() => useIngresses('prod-cluster', 'production'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=prod-cluster')
    expect(url).toContain('namespace=production')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { ingresses: [] } })
    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error: null on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('re-fetches when demo mode changes', async () => {
    mockApiGet.mockResolvedValue({ data: { ingresses: [] } })
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useIngresses()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    rerender({ demoMode: true })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

// ===========================================================================
// useNetworkPolicies
// ===========================================================================

describe('useNetworkPolicies', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useNetworkPolicies())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.networkpolicies).toEqual([])
  })

  it('returns network policies after fetch resolves', async () => {
    const fakePolicies = [{ name: 'np-1', namespace: 'default', cluster: 'c1' }]
    mockApiGet.mockResolvedValue({ data: { networkpolicies: fakePolicies } })

    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.networkpolicies).toEqual(fakePolicies)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })
    renderHook(() => useNetworkPolicies('test-cluster', 'test-ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=test-cluster')
    expect(url).toContain('namespace=test-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })
    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error: null on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.networkpolicies).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('re-fetches when demo mode changes', async () => {
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useNetworkPolicies()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    rerender({ demoMode: true })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
