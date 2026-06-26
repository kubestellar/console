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
  mockGetStoredAuthToken,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockKubectlProxy: { getServices: vi.fn(), getIngresses: vi.fn(), getNetworkPolicies: vi.fn() },
  mockReportAgentDataSuccess: vi.fn(),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockGetStoredAuthToken: vi.fn(() => 'test-token'),
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
  useDemoMode: () => mockUseDemoMode(),
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

vi.mock('../../../lib/authToken', () => ({
  getStoredAuthToken: () => mockGetStoredAuthToken(),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  getLocalAgentURL: () => 'http://127.0.0.1:8585/mcp',
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: () => vi.fn(),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    DEPLOY_ABORT_TIMEOUT_MS: 30_000,
    SERVICES_CACHE_TTL_MS: 300_000,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
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

vi.mock('../../useCachedData/demoData', () => ({
  getDemoIngresses: vi.fn(() => [
    { name: 'demo-ingress', namespace: 'default', cluster: 'demo-cluster', host: 'demo.example.com', path: '/' },
  ]),
}))

import { useServices, useIngresses } from '../networking'

describe('networking hooks - useServices', () => {
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
  it('transitions from loading to success when services are fetched successfully', async () => {
    const mockServices = [
      {
        name: 'nginx',
        namespace: 'default',
        type: 'ClusterIP',
        clusterIP: '10.0.0.1',
        ports: ['80/TCP'],
      },
    ]

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: mockServices }),
    })

    const { result } = renderHook(() => useServices('cluster-a'))

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])

    // Wait for success
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0]).toMatchObject({
      name: 'nginx',
      cluster: 'cluster-a',
      type: 'ClusterIP',
    })
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
    expect(mockReportAgentDataSuccess).toHaveBeenCalledTimes(1)
  })

  // Test 2: Loading → Error state transition
  it('transitions from loading to error when fetch fails', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))
    mockKubectlProxy.getServices.mockRejectedValue(new Error('kubectl failed'))

    const { result } = renderHook(() => useServices('cluster-a'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
    expect(result.current.services).toEqual([])
    expect(result.current.consecutiveFailures).toBeGreaterThan(0)
  })

  // Test 3: Cache hydration with TTL enforcement
  it('hydrates from localStorage cache within TTL window', async () => {
    const now = new Date()
    const cachedData = {
      data: [{ name: 'cached-svc', namespace: 'default', cluster: 'cluster-a', type: 'ClusterIP', clusterIP: '10.0.0.2' }],
      timestamp: now.toISOString(),
      key: 'services:cluster-a:all',
    }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(cachedData))

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'fresh-svc', namespace: 'default', type: 'LoadBalancer', clusterIP: '10.0.0.3' }] }),
    })

    const { result } = renderHook(() => useServices('cluster-a'))

    // Cached data should be available immediately
    expect(result.current.isLoading).toBe(false)
    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0].name).toBe('cached-svc')

    // Wait for fresh data
    await waitFor(() => expect(result.current.services[0].name).toBe('fresh-svc'))
  })

  // Test 4: Cache TTL expiration
  it('discards stale cache beyond TTL window', async () => {
    const staleTimestamp = new Date(Date.now() - 400_000) // 400 seconds ago (beyond 300s TTL)
    const cachedData = {
      data: [{ name: 'stale-svc', namespace: 'default', cluster: 'cluster-a', type: 'ClusterIP', clusterIP: '10.0.0.2' }],
      timestamp: staleTimestamp.toISOString(),
      key: 'services:cluster-a:all',
    }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(cachedData))

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'fresh-svc', namespace: 'default', type: 'LoadBalancer', clusterIP: '10.0.0.3' }] }),
    })

    const { result } = renderHook(() => useServices('cluster-a'))

    // Stale cache should be discarded, should start loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])

    await waitFor(() => expect(result.current.services[0]?.name).toBe('fresh-svc'))
  })

  // Test 5: Stale-while-revalidate pattern
  it('shows cached data during background refetch without loading spinner', async () => {
    const initialData = [{ name: 'svc-1', namespace: 'default', type: 'ClusterIP', clusterIP: '10.0.0.1' }]
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ services: initialData }),
    })

    const { result } = renderHook(() => useServices('cluster-a'))
    await waitFor(() => expect(result.current.services).toHaveLength(1))

    const updatedData = [
      ...initialData,
      { name: 'svc-2', namespace: 'default', type: 'LoadBalancer', clusterIP: '10.0.0.2' },
    ]
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ services: updatedData }),
    })

    // Trigger refetch
    result.current.refetch()

    // Should show isRefreshing, but NOT isLoading
    await waitFor(() => expect(result.current.isRefreshing).toBe(true))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.services).toHaveLength(1)

    // Wait for new data
    await waitFor(() => expect(result.current.services).toHaveLength(2))
    expect(result.current.isRefreshing).toBe(false)
  })

  // Test 6: Parameter validation - namespace filtering
  it('filters services by namespace when namespace parameter is provided', async () => {
    const mockServices = [
      { name: 'svc-1', namespace: 'default', type: 'ClusterIP', clusterIP: '10.0.0.1' },
      { name: 'svc-2', namespace: 'kube-system', type: 'ClusterIP', clusterIP: '10.0.0.2' },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: mockServices }),
    })

    const { result } = renderHook(() => useServices('cluster-a', 'kube-system'))

    await waitFor(() => expect(result.current.services.length).toBeGreaterThan(0))
    // Verify namespace was passed in the fetch call
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('namespace=kube-system'),
      expect.any(Object)
    )
  })

  // Test 7: Demo mode fallback
  it('returns demo data when demo mode is enabled', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('cluster-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  // Test 8: LoadBalancer status field mapping
  it('correctly maps LoadBalancer status from kubectl proxy response', async () => {
    const mockKubectlServices = [
      {
        name: 'lb-service',
        namespace: 'default',
        type: 'LoadBalancer',
        clusterIP: '10.0.0.1',
        ports: '80/TCP, 443/TCP',
        lbStatus: 'Pending',
        selector: 'app=nginx',
      },
    ]
    mockAgentFetch.mockRejectedValue(new Error('agent unavailable'))
    mockKubectlProxy.getServices.mockResolvedValue(mockKubectlServices)

    const { result } = renderHook(() => useServices('cluster-a'))

    await waitFor(() => expect(result.current.services).toHaveLength(1))
    expect(result.current.services[0]).toMatchObject({
      name: 'lb-service',
      type: 'LoadBalancer',
      lbStatus: 'Pending',
      selector: 'app=nginx',
      ports: ['80/TCP', '443/TCP'],
    })
  })

  // Test 9: Cache invalidation on cluster change
  it('clears cached data and reloads when cluster parameter changes', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc-1', namespace: 'default', type: 'ClusterIP', clusterIP: '10.0.0.1' }] }),
    })

    const { result, rerender } = renderHook(
      ({ cluster }) => useServices(cluster),
      { initialProps: { cluster: 'cluster-a' } }
    )

    await waitFor(() => expect(result.current.services).toHaveLength(1))
    expect(result.current.services[0].cluster).toBe('cluster-a')

    // Change cluster
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc-2', namespace: 'default', type: 'LoadBalancer', clusterIP: '10.0.0.2' }] }),
    })

    rerender({ cluster: 'cluster-b' })

    // Should clear services and reload
    await waitFor(() => expect(result.current.services).toEqual([]))
    await waitFor(() => expect(result.current.services[0]?.cluster).toBe('cluster-b'))
  })

  // Test 10: Timeout handling
  it('handles fetch timeout gracefully and falls back to kubectl', async () => {
    const timeoutError = new Error('timeout')
    timeoutError.name = 'AbortError'
    mockAgentFetch.mockRejectedValue(timeoutError)

    const mockServices = [{ name: 'svc-kubectl', namespace: 'default', type: 'ClusterIP', clusterIP: '10.0.0.5', ports: '' }]
    mockKubectlProxy.getServices.mockResolvedValue(mockServices)

    const { result } = renderHook(() => useServices('cluster-a'))

    await waitFor(() => expect(result.current.services).toHaveLength(1))
    expect(result.current.services[0].name).toBe('svc-kubectl')
    expect(result.current.error).toBeNull()
  })
})

describe('networking hooks - useIngresses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsDemoMode.mockReturnValue(false)
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  // Test 1: Loading → Success state transition
  it('transitions from loading to success when ingresses are fetched successfully', async () => {
    const mockIngresses = [
      {
        name: 'app-ingress',
        namespace: 'default',
        host: 'app.example.com',
        path: '/',
        serviceName: 'app-service',
        servicePort: 80,
      },
    ]

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ingresses: mockIngresses }),
    })

    const { result } = renderHook(() => useIngresses('cluster-a'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses).toHaveLength(1)
    expect(result.current.ingresses[0]).toMatchObject({
      name: 'app-ingress',
      cluster: 'cluster-a',
      host: 'app.example.com',
    })
    expect(result.current.error).toBeNull()
  })

  // Test 2: Demo mode returns demo ingresses
  it('returns demo data in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses.length).toBeGreaterThan(0)
    expect(result.current.ingresses[0].name).toBe('demo-ingress')
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  // Test 3: Error handling
  it('surfaces errors when fetch fails', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))
    mockKubectlProxy.getIngresses.mockRejectedValue(new Error('kubectl failed'))

    const { result } = renderHook(() => useIngresses('cluster-a'))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.ingresses).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  // Test 4: Refetch after error
  it('recovers from error state on successful refetch', async () => {
    mockAgentFetch.mockRejectedValueOnce(new Error('Network error'))
    mockKubectlProxy.getIngresses.mockRejectedValueOnce(new Error('kubectl failed'))

    const { result } = renderHook(() => useIngresses('cluster-a'))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.consecutiveFailures).toBeGreaterThan(0)

    // Mock successful response
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ingresses: [{ name: 'ingress-1', namespace: 'default', host: 'test.com', path: '/' }] }),
    })

    result.current.refetch()

    await waitFor(() => expect(result.current.ingresses).toHaveLength(1))
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })
})
