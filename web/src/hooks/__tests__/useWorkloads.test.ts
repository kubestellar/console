import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock state — controlled from tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockAgentUnavailable = false
const mockClusterCacheRef = {
  clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
}

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockAgentUnavailable,
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  STORAGE_KEY_TOKEN: 'token',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  MCP_HOOK_TIMEOUT_MS: 15_000,
  POLL_INTERVAL_MS: 30_000,
  POLL_INTERVAL_SLOW_MS: 60_000,
}))

vi.mock('../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush the microtask queue so pending promises resolve */
function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockDemoMode = false
  mockAgentUnavailable = false
  mockClusterCacheRef.clusters = []
  vi.spyOn(globalThis, 'fetch').mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper
// ---------------------------------------------------------------------------

async function importFresh() {
  vi.resetModules()
  return import('../useWorkloads')
}

// ---------------------------------------------------------------------------
// Tests: useWorkloads
// ---------------------------------------------------------------------------

describe('useWorkloads', () => {
  it('returns demo workloads in demo mode', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      expect(result.current.data!.length).toBeGreaterThan(0)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  it('demo mode filters by cluster', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads({ cluster: 'eks-prod-us-east-1' }))

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      for (const w of result.current.data!) {
        expect(w.cluster).toBe('eks-prod-us-east-1')
      }
    })
  })

  it('demo mode filters by namespace', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads({ namespace: 'production' }))

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      for (const w of result.current.data!) {
        expect(w.namespace).toBe('production')
      }
    })
  })

  it('demo mode filters by both cluster and namespace', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() =>
      useWorkloads({ cluster: 'eks-prod-us-east-1', namespace: 'data' })
    )

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      for (const w of result.current.data!) {
        expect(w.cluster).toBe('eks-prod-us-east-1')
        expect(w.namespace).toBe('data')
      }
      // The 'redis' workload in the 'data' namespace
      expect(result.current.data!.some(w => w.name === 'redis')).toBe(true)
    })
  })

  it('returns undefined data and isLoading=false when disabled', async () => {
    const { useWorkloads } = await importFresh()

    const enabled = false
    const { result } = renderHook(() => useWorkloads({}, enabled))

    await waitFor(() => {
      expect(result.current.data).toBeUndefined()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  it('falls back to REST API when agent is unavailable', async () => {
    mockAgentUnavailable = true
    const mockWorkloads = [
      { name: 'api-server', namespace: 'default', type: 'Deployment', replicas: 2, readyReplicas: 2, status: 'Running', image: 'api:v1', createdAt: '2025-01-01T00:00:00Z' },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: mockWorkloads }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toEqual(mockWorkloads)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('passes cluster/namespace/type query params to REST API', async () => {
    mockAgentUnavailable = true
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    renderHook(() =>
      useWorkloads({ cluster: 'prod', namespace: 'kube-system', type: 'StatefulSet' })
    )

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // The fetch should have been called with the correct query params
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('cluster=prod')
    expect(callUrl).toContain('namespace=kube-system')
    expect(callUrl).toContain('type=StatefulSet')
  })

  it('sets error when both agent and REST fail', async () => {
    mockAgentUnavailable = true
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
      expect(result.current.error!.message).toBe('No data source available')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('handles REST API returning non-ok status', async () => {
    mockAgentUnavailable = true
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
    )
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      // REST non-ok falls through to error state
      expect(result.current.error).toBeDefined()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('includes auth token in REST API requests', async () => {
    mockAgentUnavailable = true
    localStorage.setItem('token', 'my-jwt-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    const callHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(callHeaders?.Authorization).toBe('Bearer my-jwt-token')
  })

  it('omits Authorization header when no token is stored', async () => {
    mockAgentUnavailable = true
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    const callHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(callHeaders?.Authorization).toBeUndefined()
  })

  it('clears stale data when options change', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useWorkloads({ cluster }),
      { initialProps: { cluster: 'eks-prod-us-east-1' } }
    )

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    // Change cluster — data should be cleared before new fetch
    rerender({ cluster: 'gke-staging' })

    await waitFor(() => {
      // After re-fetching, data should now be filtered to the new cluster
      expect(result.current.data).toBeDefined()
      for (const w of (result.current.data || [])) {
        expect(w.cluster).toBe('gke-staging')
      }
    })
  })

  it('handles REST API returning flat array (no items wrapper)', async () => {
    mockAgentUnavailable = true
    const flatArray = [
      { name: 'web', namespace: 'default', type: 'Deployment', replicas: 1, readyReplicas: 1, status: 'Running', image: 'web:v1', createdAt: '2025-01-01T00:00:00Z' },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(flatArray), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      // When result has no .items, the array itself is used
      expect(result.current.data).toEqual(flatArray)
    })
  })

  it('refetch function triggers a new fetch', async () => {
    mockDemoMode = true
    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    // Call refetch
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.error).toBeNull()
  })

  it('REST URL has no query string when no options are provided', async () => {
    mockAgentUnavailable = true
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toBe('/api/workloads')
  })

  it('tries agent first when agent is available and clusters exist', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'prod-cluster', context: 'prod-ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    mockMapSettled.mockResolvedValue([
      {
        status: 'fulfilled',
        value: [
          {
            name: 'web-app',
            namespace: 'default',
            type: 'Deployment',
            cluster: 'prod-cluster',
            targetClusters: ['prod-cluster'],
            replicas: 2,
            readyReplicas: 2,
            status: 'Running',
            image: 'web:v1',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ])

    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      expect(result.current.data!.length).toBe(1)
      expect(result.current.data![0].name).toBe('web-app')
      expect(result.current.isLoading).toBe(false)
    })

    mockMapSettled.mockReset()
  })

  it('filters clusters with "/" in name from agent requests', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'valid-cluster', context: 'ctx-1', reachable: true },
      { name: 'context/with-slash', context: 'ctx-2', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    mockMapSettled.mockResolvedValue([])

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await flushPromises()

    // The mock is called with (targets, callback). targets should exclude clusters with /
    const lastCallArgs = mockMapSettled.mock.calls[mockMapSettled.mock.calls.length - 1]
    const firstArg = lastCallArgs?.[0]
    expect(firstArg).toBeDefined()
    // Only valid-cluster (without slash) should be passed
    const names = firstArg.map((c: { name: string }) => c.name)
    expect(names).toContain('valid-cluster')
    expect(names).not.toContain('context/with-slash')

    mockMapSettled.mockReset()
  })

  it('filters unreachable clusters from agent requests', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'reachable', context: 'ctx-1', reachable: true },
      { name: 'down', context: 'ctx-2', reachable: false },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    mockMapSettled.mockResolvedValue([])

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await flushPromises()

    const lastCallArgs = mockMapSettled.mock.calls[mockMapSettled.mock.calls.length - 1]
    const firstArg = lastCallArgs?.[0]
    expect(firstArg).toBeDefined()
    const names = firstArg.map((c: { name: string }) => c.name)
    expect(names).toContain('reachable')
    expect(names).not.toContain('down')

    mockMapSettled.mockReset()
  })

  it('returns null from agent when no clusters are cached', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = []

    // Agent returns null (no clusters), so falls through to REST
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // Should fall back to REST API
    const url = fetchSpy.mock.calls[0]?.[0] as string
    expect(url).toContain('/api/workloads')
  })

  it('falls through to REST when agent returns empty results', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    // All results rejected (no fulfilled items)
    mockMapSettled.mockResolvedValue([
      { status: 'rejected', reason: new Error('timeout') },
    ])

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      // Should eventually try REST since agent returned no results
      expect(fetchSpy).toHaveBeenCalled()
    })

    mockMapSettled.mockReset()
  })

  it('filters by specific cluster when agent fetches via agent', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    mockMapSettled.mockResolvedValue([])

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads({ cluster: 'cluster-a' }))

    await flushPromises()

    // Should only pass cluster-a (the requested one)
    const lastCallArgs = mockMapSettled.mock.calls[mockMapSettled.mock.calls.length - 1]
    const targets = lastCallArgs?.[0]
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('cluster-a')

    mockMapSettled.mockReset()
  })

  it('falls through to REST when agent throws an error', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>
    // Simulate agent throwing
    mockMapSettled.mockRejectedValue(new Error('Agent connection failed'))

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    mockMapSettled.mockReset()
  })

  it('agent fetch callback correctly maps deployment data to Workload objects', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'agent-cluster', context: 'agent-ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>

    // Instead of mocking the entire function, capture the callback and invoke it
    let capturedCallback: ((arg: { name: string; context?: string }) => Promise<unknown>) | null = null
    mockMapSettled.mockImplementation(async (targets: Array<{ name: string; context?: string }>, cb: (arg: { name: string; context?: string }) => Promise<unknown>) => {
      capturedCallback = cb
      const results = []
      for (const target of targets) {
        try {
          const value = await cb(target)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    // Mock the fetch for agent
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        deployments: [
          { name: 'web-app', namespace: 'prod', status: 'running', replicas: 3, readyReplicas: 3, image: 'web:v1' },
          { name: 'api-svc', namespace: 'default', status: 'failed', replicas: 2, readyReplicas: 0, image: 'api:v2' },
          { name: 'worker', status: 'deploying', replicas: 1, readyReplicas: 0, image: 'worker:v1' },
          { name: 'degraded-app', replicas: 5, readyReplicas: 3, image: 'deg:v1' },
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the mappings
    const data = result.current.data!
    expect(data.length).toBe(4)

    // Running status (default)
    const web = data.find(w => w.name === 'web-app')
    expect(web).toBeDefined()
    expect(web!.status).toBe('Running')
    expect(web!.namespace).toBe('prod')
    expect(web!.cluster).toBe('agent-cluster')

    // Failed status
    const api = data.find(w => w.name === 'api-svc')
    expect(api).toBeDefined()
    expect(api!.status).toBe('Failed')

    // Deploying => Pending
    const worker = data.find(w => w.name === 'worker')
    expect(worker).toBeDefined()
    expect(worker!.status).toBe('Pending')
    expect(worker!.namespace).toBe('default') // Falls back to 'default'

    // Degraded: readyReplicas < replicas
    const degraded = data.find(w => w.name === 'degraded-app')
    expect(degraded).toBeDefined()
    expect(degraded!.status).toBe('Degraded')

    mockMapSettled.mockReset()
  })

  it('agent fetch callback uses context when available, name as fallback', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'cluster-no-ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>

    const capturedFetchUrls: string[] = []
    mockMapSettled.mockImplementation(async (targets: Array<{ name: string; context?: string }>, cb: (arg: { name: string; context?: string }) => Promise<unknown>) => {
      const results = []
      for (const target of targets) {
        try {
          const value = await cb(target)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedFetchUrls.push(String(url))
      return new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads())

    await flushPromises()

    // The first fetch call goes to the agent; when context is undefined, should use name
    const agentUrl = capturedFetchUrls.find(u => u.includes('/deployments'))
    expect(agentUrl).toBeDefined()
    expect(agentUrl).toContain('cluster=cluster-no-ctx')

    mockMapSettled.mockReset()
  })

  it('agent fetch callback passes namespace param when provided', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'ns-cluster', context: 'ns-ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>

    const capturedFetchUrls: string[] = []
    mockMapSettled.mockImplementation(async (targets: Array<{ name: string; context?: string }>, cb: (arg: { name: string; context?: string }) => Promise<unknown>) => {
      const results = []
      for (const target of targets) {
        try {
          const value = await cb(target)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedFetchUrls.push(String(url))
      return new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const { useWorkloads } = await importFresh()

    renderHook(() => useWorkloads({ namespace: 'kube-system' }))

    await flushPromises()

    // Find the agent fetch URL (includes /deployments)
    const agentUrl = capturedFetchUrls.find(u => u.includes('/deployments'))
    expect(agentUrl).toBeDefined()
    expect(agentUrl).toContain('namespace=kube-system')
    // Should use context when available
    expect(agentUrl).toContain('cluster=ns-ctx')

    mockMapSettled.mockReset()
  })

  it('agent fetch callback throws on non-ok response', async () => {
    mockAgentUnavailable = false
    mockClusterCacheRef.clusters = [
      { name: 'fail-cluster', context: 'fail-ctx', reachable: true },
    ]

    const concurrency = await import('../../lib/utils/concurrency')
    const mockMapSettled = concurrency.mapSettledWithConcurrency as ReturnType<typeof vi.fn>

    mockMapSettled.mockImplementation(async (targets: Array<{ name: string; context?: string }>, cb: (arg: { name: string; context?: string }) => Promise<unknown>) => {
      const results = []
      for (const target of targets) {
        try {
          const value = await cb(target)
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    })

    // Return non-ok response from agent
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Agent Error', { status: 503 })
    )

    const { useWorkloads } = await importFresh()

    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      // Agent callback throws on non-ok, result is rejected,
      // items array stays empty, agent returns null,
      // then falls through to REST which also fails
      expect(result.current.error).toBeDefined()
    })

    mockMapSettled.mockReset()
  })
})

// ---------------------------------------------------------------------------
// Tests: useClusterCapabilities
// ---------------------------------------------------------------------------

describe('useClusterCapabilities', () => {
  it('fetches capabilities from the REST API', async () => {
    const capabilities = [
      { cluster: 'prod', nodeCount: 5, cpuCapacity: '32', memCapacity: '128Gi', available: true },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(capabilities), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useClusterCapabilities } = await importFresh()

    const { result } = renderHook(() => useClusterCapabilities())

    await waitFor(() => {
      expect(result.current.data).toEqual(capabilities)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  it('returns undefined data when disabled', async () => {
    const { useClusterCapabilities } = await importFresh()

    const { result } = renderHook(() => useClusterCapabilities(false))

    await waitFor(() => {
      expect(result.current.data).toBeUndefined()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('sets error on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed'))
    const { useClusterCapabilities } = await importFresh()

    const { result } = renderHook(() => useClusterCapabilities())

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
      expect(result.current.error!.message).toBe('Failed')
    })
  })

  it('wraps non-Error throws into Error objects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('string-error')
    const { useClusterCapabilities } = await importFresh()

    const { result } = renderHook(() => useClusterCapabilities())

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error!.message).toBe('Unknown error')
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: useDeployWorkload
// ---------------------------------------------------------------------------

describe('useDeployWorkload', () => {
  it('sends POST request with deploy payload', async () => {
    const deployResults = [{ success: true, cluster: 'prod', message: 'Deployed' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(deployResults), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeployWorkload } = await importFresh()
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useDeployWorkload())
    await act(async () => {
      await result.current.mutate(
        {
          workloadName: 'api-server',
          namespace: 'production',
          sourceCluster: 'staging',
          targetClusters: ['prod-1', 'prod-2'],
        },
        { onSuccess }
      )
    })

    expect(onSuccess).toHaveBeenCalledWith(deployResults)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('calls onError callback on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Cluster unreachable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeployWorkload } = await importFresh()
    const onError = vi.fn()

    const { result } = renderHook(() => useDeployWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          {
            workloadName: 'api-server',
            namespace: 'production',
            sourceCluster: 'staging',
            targetClusters: ['prod'],
          },
          { onError }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('Cluster unreachable')
  })

  it('wraps non-Error throws into Error objects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce('string-error')
    const { useDeployWorkload } = await importFresh()

    const { result } = renderHook(() => useDeployWorkload())
    await act(async () => {
      try {
        await result.current.mutate({
          workloadName: 'api-server',
          namespace: 'production',
          sourceCluster: 'staging',
          targetClusters: ['prod'],
        })
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('Unknown error')
  })

  it('uses fallback message when error body has no error field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeployWorkload } = await importFresh()

    const { result } = renderHook(() => useDeployWorkload())
    await act(async () => {
      try {
        await result.current.mutate({
          workloadName: 'api-server',
          namespace: 'production',
          sourceCluster: 'staging',
          targetClusters: ['prod'],
        })
      } catch {
        // expected
      }
    })

    expect(result.current.error!.message).toBe('Failed to deploy workload')
  })
})

// ---------------------------------------------------------------------------
// Tests: useScaleWorkload
// ---------------------------------------------------------------------------

describe('useScaleWorkload', () => {
  it('sends scale request and calls onSuccess', async () => {
    const scaleResults = [{ success: true, cluster: 'prod', message: 'Scaled to 5' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(scaleResults), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useScaleWorkload } = await importFresh()
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useScaleWorkload())
    await act(async () => {
      await result.current.mutate(
        { workloadName: 'api-server', namespace: 'production', replicas: 5 },
        { onSuccess }
      )
    })

    expect(onSuccess).toHaveBeenCalledWith(scaleResults)
    expect(result.current.isLoading).toBe(false)
  })

  it('handles non-Error throws as Unknown error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(42)
    const { useScaleWorkload } = await importFresh()

    const { result } = renderHook(() => useScaleWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { workloadName: 'x', namespace: 'y', replicas: 1 }
        )
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('Unknown error')
  })

  it('handles scale error response with custom error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Cannot scale below 0' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useScaleWorkload } = await importFresh()
    const onError = vi.fn()

    const { result } = renderHook(() => useScaleWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { workloadName: 'x', namespace: 'y', replicas: -1 },
          { onError }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(result.current.error!.message).toBe('Cannot scale below 0')
  })

  it('uses fallback message when error body has no error field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useScaleWorkload } = await importFresh()

    const { result } = renderHook(() => useScaleWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { workloadName: 'x', namespace: 'y', replicas: 1 }
        )
      } catch {
        // expected
      }
    })

    expect(result.current.error!.message).toBe('Failed to scale workload')
  })
})

// ---------------------------------------------------------------------------
// Tests: useDeleteWorkload
// ---------------------------------------------------------------------------

describe('useDeleteWorkload', () => {
  it('sends DELETE request and calls onSuccess', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const { useDeleteWorkload } = await importFresh()
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useDeleteWorkload())
    await act(async () => {
      await result.current.mutate(
        { cluster: 'prod', namespace: 'production', name: 'api-server' },
        { onSuccess }
      )
    })

    expect(onSuccess).toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()

    // Verify the URL includes cluster/namespace/name path segments
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toBe('/api/workloads/prod/production/api-server')
  })

  it('handles delete failure with error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeleteWorkload } = await importFresh()
    const onError = vi.fn()

    const { result } = renderHook(() => useDeleteWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { cluster: 'prod', namespace: 'default', name: 'missing' },
          { onError }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(result.current.error!.message).toBe('Not found')
  })

  it('uses generic message when error body has no error field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeleteWorkload } = await importFresh()

    const { result } = renderHook(() => useDeleteWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { cluster: 'prod', namespace: 'default', name: 'api' }
        )
      } catch {
        // expected
      }
    })

    expect(result.current.error!.message).toBe('Failed to delete workload')
  })
})
