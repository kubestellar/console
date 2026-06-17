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

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

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
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  getLocalAgentURL: () => 'http://localhost:8585',
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
  // Reset module-level servicesCache by calling the captured cache reset callback
  const servicesReset = capturedCacheResets.get('services')
  if (servicesReset) servicesReset()
  // Default: REST fetch returns empty data (services, ingresses, networkpolicies)
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ services: [], ingresses: [], networkpolicies: [] }), { status: 200 })))
  // Re-clear localStorage after cache reset (which may have set items)
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useServices
// ===========================================================================

describe('useNetworkPolicies', () => {
  it('returns empty array with loading state on mount', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useNetworkPolicies())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.networkpolicies).toEqual([])
  })

  it('returns network policies after fetch resolves', async () => {
    const fakePolicies = [{ name: 'np-1', namespace: 'default', cluster: 'c1' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: fakePolicies }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.networkpolicies).toEqual(fakePolicies)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))
    renderHook(() => useNetworkPolicies('test-cluster', 'test-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=test-cluster')
    expect(url).toContain('namespace=test-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))
    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error set on fetch failure (no prior data)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.networkpolicies).toEqual([])
    // Hook surfaces error so UI can distinguish failure from empty (#11541)
    expect(result.current.error).not.toBeNull()
  })

  it('re-fetches when demo mode changes', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useNetworkPolicies()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    rerender({ demoMode: true })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  // -------------------------------------------------------------------------
  // NEW: Network policy matching - policyTypes and podSelector
  // -------------------------------------------------------------------------

  it('preserves policyTypes array with Ingress and Egress', async () => {
    const policies = [
      {
        name: 'deny-all', namespace: 'secure', cluster: 'prod',
        policyTypes: ['Ingress', 'Egress'], podSelector: 'app=api',
      },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: policies }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies('prod', 'secure'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies[0].policyTypes).toEqual(['Ingress', 'Egress'])
    expect(result.current.networkpolicies[0].podSelector).toBe('app=api')
  })

  it('handles network policy with Ingress-only policyType', async () => {
    const policies = [
      {
        name: 'ingress-only', namespace: 'web', cluster: 'staging',
        policyTypes: ['Ingress'], podSelector: 'role=frontend',
      },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: policies }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies[0].policyTypes).toEqual(['Ingress'])
    expect(result.current.networkpolicies[0].podSelector).toBe('role=frontend')
  })

  it('handles network policy with empty podSelector (selects all pods)', async () => {
    const policies = [
      {
        name: 'default-deny', namespace: 'default', cluster: 'c1',
        policyTypes: ['Ingress'], podSelector: '',
      },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: policies }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies[0].podSelector).toBe('')
    expect(result.current.networkpolicies[0].name).toBe('default-deny')
  })

  // -------------------------------------------------------------------------
  // NEW: Network policy error handling
  // -------------------------------------------------------------------------

  it('handles null networkpolicies field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: null }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sets isFailed after 3 consecutive network policy failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))

    expect(result.current.isFailed).toBe(true)
  })

  it('preserves stale network policies on API failure (stale-data-on-error per #11540)', async () => {
    const fakePolicies = [
      { name: 'np-1', namespace: 'default', cluster: 'c1', policyTypes: ['Ingress'], podSelector: '' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: fakePolicies }), { status: 200 })))
    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.networkpolicies).toHaveLength(1))

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    // Stale data preserved to prevent empty state on transient failures
    expect(result.current.networkpolicies).toHaveLength(1)
  })

  it('registers for mode transition refetch with correct key pattern', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))
    renderHook(() => useNetworkPolicies('test-cluster', 'test-ns'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())

    const matchingCall = mockRegisterRefetch.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('network-policies')
    )
    expect(matchingCall).toBeDefined()
    expect(matchingCall![0]).toContain('test-cluster')
    expect(matchingCall![0]).toContain('test-ns')
  })
})

// ===========================================================================
// subscribeNetworkingCache
// ===========================================================================

describe('subscribeNetworkingCache', () => {
  it('notifies subscribers when cache reset is triggered', async () => {
    const subscriber = vi.fn()

    // Import subscribeNetworkingCache
    const { subscribeNetworkingCache } = await import('../networking')

    const unsubscribe = subscribeNetworkingCache(subscriber)

    // Trigger the registered cache reset
    const reset = capturedCacheResets.get('services')
    if (reset) {
      reset()
      expect(subscriber).toHaveBeenCalled()
      const lastCall = subscriber.mock.calls[0][0]
      expect(lastCall).toHaveProperty('isResetting', true)
      expect(lastCall).toHaveProperty('cacheVersion')
    }

    unsubscribe()
  })

  it('stops notifying after unsubscribe', async () => {
    const subscriber = vi.fn()
    const { subscribeNetworkingCache } = await import('../networking')

    const unsubscribe = subscribeNetworkingCache(subscriber)
    unsubscribe()

    subscriber.mockClear()

    // Trigger reset - subscriber should NOT be called
    const reset = capturedCacheResets.get('services')
    if (reset) {
      reset()
      expect(subscriber).not.toHaveBeenCalled()
    }
  })
})

// ===========================================================================
// Additional coverage tests — targeting uncovered branches in networking.ts
// ===========================================================================

describe('useNetworkPolicies — local agent path', () => {
  it('fetches from local agent when cluster is set and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentPolicies = { networkpolicies: [{ name: 'agent-np', namespace: 'ns1', policyTypes: ['Ingress'], podSelector: '' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentPolicies,
    })

    const { result } = renderHook(() => useNetworkPolicies('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    expect(result.current.networkpolicies.length).toBeGreaterThanOrEqual(1)
  })

  it('falls through to API when agent returns non-ok for network policies', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })

  it('falls through to API when agent fetch throws for network policies', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))

    const { result } = renderHook(() => useNetworkPolicies('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })

  it('skips agent path for network policies when no cluster specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ networkpolicies: [] }), { status: 200 })))

    renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})
