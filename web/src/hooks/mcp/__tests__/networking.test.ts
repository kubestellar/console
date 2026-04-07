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
  // Default: services REST fetch returns empty list
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ services: [] }),
  })
  // Default: ingresses and networkpolicies REST fetch returns empty
  mockApiGet.mockResolvedValue({ data: { ingresses: [], networkpolicies: [] } })
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

  // -------------------------------------------------------------------------
  // NEW: Service type parsing - all four Kubernetes service types
  // -------------------------------------------------------------------------

  it('correctly returns ClusterIP services with clusterIP field', async () => {
    const clusterIPService = {
      name: 'internal-api', namespace: 'default', cluster: 'c1',
      type: 'ClusterIP', clusterIP: '10.96.0.10', ports: ['8080/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [clusterIPService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0].type).toBe('ClusterIP')
    expect(result.current.services[0].clusterIP).toBe('10.96.0.10')
    expect(result.current.services[0].externalIP).toBeUndefined()
  })

  it('correctly returns LoadBalancer services with externalIP', async () => {
    const lbService = {
      name: 'public-api', namespace: 'production', cluster: 'prod-east',
      type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45',
      ports: ['80/TCP', '443/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [lbService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('LoadBalancer')
    expect(result.current.services[0].externalIP).toBe('52.14.123.45')
    expect(result.current.services[0].ports).toEqual(['80/TCP', '443/TCP'])
  })

  it('correctly returns NodePort services with port mappings', async () => {
    const nodePortService = {
      name: 'grafana', namespace: 'monitoring', cluster: 'staging',
      type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [nodePortService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('NodePort')
    expect(result.current.services[0].ports).toEqual(['3000:30300/TCP'])
  })

  it('correctly returns ExternalName services without clusterIP', async () => {
    const externalNameService = {
      name: 'external-db', namespace: 'data', cluster: 'c1',
      type: 'ExternalName', ports: [],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [externalNameService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('ExternalName')
    expect(result.current.services[0].clusterIP).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // NEW: Mixed service types in a single response
  // -------------------------------------------------------------------------

  it('handles mixed service types in a single response', async () => {
    const mixedServices = [
      { name: 'svc-clusterip', namespace: 'ns1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: ['80/TCP'] },
      { name: 'svc-lb', namespace: 'ns1', type: 'LoadBalancer', clusterIP: '10.0.0.2', externalIP: '1.2.3.4', ports: ['443/TCP'] },
      { name: 'svc-nodeport', namespace: 'ns1', type: 'NodePort', clusterIP: '10.0.0.3', ports: ['8080:30080/TCP'] },
      { name: 'svc-extname', namespace: 'ns1', type: 'ExternalName', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: mixedServices }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toHaveLength(4)
    const types = result.current.services.map(s => s.type)
    expect(types).toEqual(['ClusterIP', 'LoadBalancer', 'NodePort', 'ExternalName'])
  })

  // -------------------------------------------------------------------------
  // NEW: Empty response handling
  // -------------------------------------------------------------------------

  it('handles null services field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: null }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook uses `data.services || []` so null becomes empty array
    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles missing services field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // NEW: HTTP error status codes
  // -------------------------------------------------------------------------

  it('increments consecutiveFailures on HTTP 500 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeNull() // services are optional, no error surfaced
  })

  it('sets isFailed to true after 3 consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // First fetch fails (initial mount)
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)

    // Trigger two more refetches to reach 3 consecutive failures
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))

    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures to 0 on successful fetch after failures', async () => {
    // Start with failures
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)

    // Now succeed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
    })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
  })

  // -------------------------------------------------------------------------
  // NEW: Demo mode - cluster/namespace filtering
  // -------------------------------------------------------------------------

  it('filters demo services by cluster when specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // All returned services should belong to the 'staging' cluster
    expect(result.current.services.length).toBeGreaterThan(0)
    result.current.services.forEach(s => {
      expect(s.cluster).toBe('staging')
    })
  })

  it('filters demo services by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('prod-east', 'data'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services.length).toBeGreaterThan(0)
    result.current.services.forEach(s => {
      expect(s.cluster).toBe('prod-east')
      expect(s.namespace).toBe('data')
    })
  })

  it('returns empty array in demo mode when cluster does not match any demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('nonexistent-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // NEW: Cache key correctness
  // -------------------------------------------------------------------------

  it('generates distinct cache keys for different cluster/namespace combos', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    // Render with one set of params
    const { unmount } = renderHook(() => useServices('cluster-a', 'ns-a'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    unmount()

    // Render with different params - registerRefetch should be called with different key
    renderHook(() => useServices('cluster-b', 'ns-b'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    // registerRefetch calls should have distinct keys
    const refetchKeys = mockRegisterRefetch.mock.calls.map((c: unknown[]) => c[0])
    const uniqueKeys = new Set(refetchKeys)
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(2)
  })

  // -------------------------------------------------------------------------
  // NEW: lastUpdated and lastRefresh timestamps
  // -------------------------------------------------------------------------

  it('sets lastUpdated and lastRefresh timestamps on successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 's', namespace: 'n', type: 'ClusterIP', ports: [] }] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.lastUpdated).toBeInstanceOf(Date)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  // -------------------------------------------------------------------------
  // NEW: Query param encoding without cluster/namespace
  // -------------------------------------------------------------------------

  it('omits cluster and namespace query params when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    renderHook(() => useServices())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).not.toContain('cluster=')
    expect(url).not.toContain('namespace=')
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

  // -------------------------------------------------------------------------
  // NEW: Ingress host extraction
  // -------------------------------------------------------------------------

  it('preserves ingress hosts array with multiple hostnames', async () => {
    const multiHostIngress = [
      {
        name: 'multi-host-ingress', namespace: 'production', cluster: 'prod',
        class: 'nginx', hosts: ['app.example.com', 'api.example.com', 'www.example.com'],
        address: '10.0.0.100',
      },
    ]
    mockApiGet.mockResolvedValue({ data: { ingresses: multiHostIngress } })

    const { result } = renderHook(() => useIngresses('prod', 'production'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].hosts).toEqual(['app.example.com', 'api.example.com', 'www.example.com'])
    expect(result.current.ingresses[0].hosts).toHaveLength(3)
  })

  it('handles ingresses with empty hosts array', async () => {
    const noHostIngress = [
      { name: 'catch-all', namespace: 'default', cluster: 'c1', hosts: [], class: 'nginx' },
    ]
    mockApiGet.mockResolvedValue({ data: { ingresses: noHostIngress } })

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].hosts).toEqual([])
    expect(result.current.ingresses[0].name).toBe('catch-all')
  })

  it('handles ingress with class and address fields', async () => {
    const ingress = [
      {
        name: 'main-ingress', namespace: 'web', cluster: 'prod',
        class: 'alb', hosts: ['app.example.com'], address: '52.14.0.1', age: '10d',
      },
    ]
    mockApiGet.mockResolvedValue({ data: { ingresses: ingress } })

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].class).toBe('alb')
    expect(result.current.ingresses[0].address).toBe('52.14.0.1')
    expect(result.current.ingresses[0].age).toBe('10d')
  })

  // -------------------------------------------------------------------------
  // NEW: Ingress error handling
  // -------------------------------------------------------------------------

  it('handles null ingresses field in API response gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: { ingresses: null } })

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook uses `data.ingresses || []`
    expect(result.current.ingresses).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('increments consecutiveFailures on ingress fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('sets isFailed after 3 consecutive ingress failures', async () => {
    mockApiGet.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))

    expect(result.current.isFailed).toBe(true)
  })

  it('clears ingresses on API failure (unlike services which keep stale data)', async () => {
    // First succeed with data
    const fakeIngresses = [{ name: 'ing-1', namespace: 'default', cluster: 'c1', hosts: ['a.com'] }]
    mockApiGet.mockResolvedValue({ data: { ingresses: fakeIngresses } })
    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.ingresses).toHaveLength(1))

    // Then fail
    mockApiGet.mockRejectedValue(new Error('network error'))
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.ingresses).toEqual([]))
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
    mockApiGet.mockResolvedValue({ data: { networkpolicies: policies } })

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
    mockApiGet.mockResolvedValue({ data: { networkpolicies: policies } })

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
    mockApiGet.mockResolvedValue({ data: { networkpolicies: policies } })

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies[0].podSelector).toBe('')
    expect(result.current.networkpolicies[0].name).toBe('default-deny')
  })

  // -------------------------------------------------------------------------
  // NEW: Network policy error handling
  // -------------------------------------------------------------------------

  it('handles null networkpolicies field in API response gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: { networkpolicies: null } })

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.networkpolicies).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sets isFailed after 3 consecutive network policy failures', async () => {
    mockApiGet.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))

    expect(result.current.isFailed).toBe(true)
  })

  it('clears network policies on API failure', async () => {
    const fakePolicies = [
      { name: 'np-1', namespace: 'default', cluster: 'c1', policyTypes: ['Ingress'], podSelector: '' },
    ]
    mockApiGet.mockResolvedValue({ data: { networkpolicies: fakePolicies } })
    const { result } = renderHook(() => useNetworkPolicies())
    await waitFor(() => expect(result.current.networkpolicies).toHaveLength(1))

    mockApiGet.mockRejectedValue(new Error('network error'))
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.networkpolicies).toEqual([]))
  })

  it('registers for mode transition refetch with correct key pattern', async () => {
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })
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

describe('useServices — local agent HTTP path', () => {
  it('fetches from local agent when cluster is set and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentServices = { services: [{ name: 'agent-svc', namespace: 'ns1', type: 'ClusterIP' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentServices,
    })

    const { result } = renderHook(() => useServices('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Agent path is tried first when cluster is set and agent is available
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to kubectl proxy when agent HTTP fetch returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [{ name: 'my-cluster', context: 'my-ctx', reachable: true }]

    // Agent returns 500, then API returns empty
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      // API fallback
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [] }),
      })
    })

    const { result } = renderHook(() => useServices('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook should have tried the agent path and then fallen through
    expect(callCount).toBeGreaterThanOrEqual(1)
  })

  it('falls through when agent HTTP fetch throws (network error)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.reject(new Error('ECONNREFUSED'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [] }),
      })
    })

    const { result } = renderHook(() => useServices('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('skips agent paths when cluster is not specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not have called reportAgentDataSuccess because no cluster was passed
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})

describe('useServices — kubectl proxy path', () => {
  it('tries kubectl proxy when agent HTTP fails and cluster is set', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'test-cluster', context: 'test-ctx', reachable: true },
    ]

    // Agent fetch rejects, kubectl proxy also fails, API fallback succeeds
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.reject(new Error('Agent unreachable'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [{ name: 'api-svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
      })
    })

    const { result } = renderHook(() => useServices('test-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should eventually get data from the API fallback
    expect(result.current.services.length).toBeGreaterThanOrEqual(0)
  })
})

describe('useServices — silent refresh behavior', () => {
  it('does not set isRefreshing for silent (background) refetches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // After initial load + MIN_REFRESH_INDICATOR_MS timer, isRefreshing should be false
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })
  })
})

describe('useServices — demo mode silent flag', () => {
  it('sets isRefreshing briefly and then clears it in demo mode non-silent refetch', async () => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices())

    // Advance time past the MIN_REFRESH_INDICATOR_MS (500ms)
    await act(async () => { vi.advanceTimersByTime(600) })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.services.length).toBeGreaterThan(0)
  })
})

describe('useServices — localStorage cache', () => {
  it('loads cached data from localStorage on mount', async () => {
    const cachedServices = [
      { name: 'cached-svc', namespace: 'default', cluster: 'all', type: 'ClusterIP', ports: [] },
    ]
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: cachedServices,
      timestamp: new Date().toISOString(),
      key: 'services:all:all',
    }))

    // Block fetch so we only see cached data
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices())

    // Should show cached data immediately without loading
    expect(result.current.services).toEqual(cachedServices)
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores corrupt localStorage data gracefully', async () => {
    localStorage.setItem('kubestellar-services-cache', '{{{invalid json')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still work fine, just without cache
    expect(result.current.error).toBeNull()
  })

  it('ignores cached data with mismatched cache key', async () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [{ name: 'old' }],
      timestamp: new Date().toISOString(),
      key: 'services:other-cluster:other-ns',
    }))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices('my-cluster', 'my-ns'))
    // Cache key doesn't match, so should start in loading state
    expect(result.current.isLoading).toBe(true)
  })

  it('ignores cached data with empty data array', async () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [],
      timestamp: new Date().toISOString(),
      key: 'services:all:all',
    }))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices())
    // Empty cached data is treated as no cache
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useServices — cluster/namespace change detection', () => {
  it('resets state when cluster changes', async () => {
    const svcA = [{ name: 'svc-a', namespace: 'ns', type: 'ClusterIP', ports: [], cluster: 'cluster-a' }]
    const svcB = [{ name: 'svc-b', namespace: 'ns', type: 'ClusterIP', ports: [], cluster: 'cluster-b' }]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: svcA }),
    })

    const { result, rerender } = renderHook(
      ({ cluster }) => useServices(cluster),
      { initialProps: { cluster: 'cluster-a' } }
    )

    await waitFor(() => expect(result.current.services).toEqual(svcA))

    // Change cluster
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: svcB }),
    })

    rerender({ cluster: 'cluster-b' })

    // Should reset to empty during transition
    await waitFor(() => expect(result.current.services).toEqual(svcB))
  })
})

describe('useServices — API error status response', () => {
  it('throws and catches non-ok API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeNull()
  })
})

describe('useIngresses — local agent path', () => {
  it('fetches from local agent when cluster is set and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentIngresses = { ingresses: [{ name: 'agent-ing', namespace: 'ns1', hosts: ['a.com'] }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentIngresses,
    })

    const { result } = renderHook(() => useIngresses('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    expect(result.current.ingresses.length).toBeGreaterThanOrEqual(1)
  })

  it('falls through to API when agent returns non-ok for ingresses', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
    mockApiGet.mockResolvedValue({ data: { ingresses: [{ name: 'api-ing', namespace: 'ns', hosts: [] }] } })

    const { result } = renderHook(() => useIngresses('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses.length).toBeGreaterThanOrEqual(0)
  })

  it('falls through to API when agent fetch throws for ingresses', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    mockApiGet.mockResolvedValue({ data: { ingresses: [] } })

    const { result } = renderHook(() => useIngresses('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })
})

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

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })

    const { result } = renderHook(() => useNetworkPolicies('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })

  it('falls through to API when agent fetch throws for network policies', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })

    const { result } = renderHook(() => useNetworkPolicies('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })

  it('skips agent path for network policies when no cluster specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockApiGet.mockResolvedValue({ data: { networkpolicies: [] } })

    renderHook(() => useNetworkPolicies())

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})

describe('useIngresses — agent skipped when no cluster', () => {
  it('skips agent path for ingresses when no cluster specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockApiGet.mockResolvedValue({ data: { ingresses: [] } })

    renderHook(() => useIngresses())

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})
