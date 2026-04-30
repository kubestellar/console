import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock state -- controlled from tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockAgentUnavailable = false
const mockClusterCacheRef = {
  clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
}

/** Mocked value for LOCAL_AGENT_HTTP_URL -- tests can override via resetModules */
let mockLocalAgentUrl = 'http://127.0.0.1:8585'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockAgentUnavailable,
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    get LOCAL_AGENT_HTTP_URL() { return mockLocalAgentUrl },
    STORAGE_KEY_TOKEN: 'token',
  }
})

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
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockDemoMode = false
  mockAgentUnavailable = false
  mockLocalAgentUrl = 'http://127.0.0.1:8585'
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
// Tests: getDemoWorkloads (pure function)
// ---------------------------------------------------------------------------

describe('getDemoWorkloads', () => {
  it('returns all demo workloads when no filters provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    expect(workloads.length).toBeGreaterThan(0)
    // Every workload must have required fields
    for (const w of workloads) {
      expect(w.name).toBeTruthy()
      expect(w.namespace).toBeTruthy()
      expect(w.type).toBeTruthy()
      expect(w.cluster).toBeTruthy()
      expect(w.replicas).toBeGreaterThanOrEqual(0)
      expect(w.readyReplicas).toBeGreaterThanOrEqual(0)
      expect(w.status).toBeTruthy()
      expect(w.image).toBeTruthy()
      expect(w.createdAt).toBeTruthy()
    }
  })

  it('filters by cluster when cluster parameter is provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('eks-prod-us-east-1')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.cluster).toBe('eks-prod-us-east-1')
    }
  })

  it('filters by namespace when namespace parameter is provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads(undefined, 'production')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.namespace).toBe('production')
    }
  })

  it('filters by both cluster and namespace', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('eks-prod-us-east-1', 'data')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.cluster).toBe('eks-prod-us-east-1')
      expect(w.namespace).toBe('data')
    }
    // Should include redis in the data namespace
    expect(workloads.some(w => w.name === 'redis')).toBe(true)
  })

  it('returns empty array when cluster filter matches nothing', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('nonexistent-cluster')

    expect(workloads).toEqual([])
  })

  it('returns empty array when namespace filter matches nothing', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads(undefined, 'nonexistent-namespace')

    expect(workloads).toEqual([])
  })

  it('includes workloads across multiple clusters', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    const clusters = new Set(workloads.map(w => w.cluster))
    expect(clusters.size).toBeGreaterThan(1)
  })

  it('includes multiple workload types', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    const types = new Set(workloads.map(w => w.type))
    expect(types.has('Deployment')).toBe(true)
    expect(types.has('StatefulSet')).toBe(true)
  })

  it('includes at least one degraded workload', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    expect(workloads.some(w => w.status === 'Degraded')).toBe(true)
  })

  it('generates valid ISO date strings for createdAt', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    for (const w of workloads) {
      const date = new Date(w.createdAt)
      expect(date.getTime()).not.toBeNaN()
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: authHeaders (pure function)
// ---------------------------------------------------------------------------

describe('authHeaders', () => {
  it('returns Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('token', 'my-jwt-token')
    const { authHeaders } = await importFresh()

    const headers = authHeaders()
    expect(headers.Authorization).toBe('Bearer my-jwt-token')
  })

  it('returns empty object when no token in localStorage', async () => {
    const { authHeaders } = await importFresh()

    const headers = authHeaders()
    expect(headers.Authorization).toBeUndefined()
    expect(Object.keys(headers).length).toBe(0)
  })

  it('reflects updated token on subsequent calls', async () => {
    const { authHeaders } = await importFresh()

    expect(authHeaders().Authorization).toBeUndefined()

    localStorage.setItem('token', 'new-token')
    expect(authHeaders().Authorization).toBe('Bearer new-token')
  })
})

// ---------------------------------------------------------------------------
// Tests: requireLocalAgentHttp (pure function)
// ---------------------------------------------------------------------------

describe('requireLocalAgentHttp', () => {
  it('returns LOCAL_AGENT_HTTP_URL when it is set', async () => {
    mockLocalAgentUrl = 'http://127.0.0.1:8585'
    const { requireLocalAgentHttp } = await importFresh()

    const url = requireLocalAgentHttp('Testing')
    expect(url).toBe('http://127.0.0.1:8585')
  })

  it('throws when LOCAL_AGENT_HTTP_URL is empty', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()

    expect(() => requireLocalAgentHttp('Deploying workloads')).toThrow(
      'Deploying workloads requires the local kc-agent; this browser is not connected to one.'
    )
  })

  it('includes the action name in the error message', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()

    expect(() => requireLocalAgentHttp('Scaling pods')).toThrow('Scaling pods')
  })
})

// ---------------------------------------------------------------------------
// Tests: useWorkloads hook
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

    rerender({ cluster: 'gke-staging' })

    await waitFor(() => {
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
})

// ---------------------------------------------------------------------------
// Tests: useDeleteWorkload
// ---------------------------------------------------------------------------

describe('useDeleteWorkload', () => {
  it('sends POST to kc-agent /workloads/delete and calls onSuccess', async () => {
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

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>
    const [callUrl, callInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(callUrl).toBe('http://127.0.0.1:8585/workloads/delete')
    expect(callInit.method).toBe('POST')
    expect(JSON.parse(callInit.body as string)).toEqual({
      cluster: 'prod',
      namespace: 'production',
      name: 'api-server',
    })
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

// ---------------------------------------------------------------------------
// Tests: fetchWorkloadsViaAgent path (via useWorkloads with clusters)
// ---------------------------------------------------------------------------

describe('useWorkloads via agent with clusters', () => {
  it('fetches workloads from agent when clusters are available', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod-cluster', context: 'prod-ctx', reachable: true },
    ]
    const { mapSettledWithConcurrency } = await import('../../lib/utils/concurrency')
    const mapSettledMock = vi.mocked(mapSettledWithConcurrency)
    mapSettledMock.mockResolvedValue([
      {
        status: 'fulfilled',
        value: [
          {
            name: 'nginx',
            namespace: 'default',
            type: 'Deployment' as const,
            cluster: 'prod-cluster',
            replicas: 1,
            readyReplicas: 1,
            status: 'Running' as const,
            image: 'nginx:latest',
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      },
    ])

    const { useWorkloads } = await importFresh()
    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('falls back to REST when agent returns null (no data)', async () => {
    mockClusterCacheRef.clusters = []
    const mockWorkloads = [
      { name: 'web', namespace: 'default', type: 'Deployment', replicas: 1, readyReplicas: 1, status: 'Running', image: 'web:v2', createdAt: '2025-01-01T00:00:00Z' },
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
      expect(result.current.data).toBeDefined()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('filters out unreachable clusters when fetching via agent', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'reachable-cluster', context: 'ctx1', reachable: true },
      { name: 'unreachable-cluster', context: 'ctx2', reachable: false },
    ]
    const { mapSettledWithConcurrency } = await import('../../lib/utils/concurrency')
    const mapSettledMock = vi.mocked(mapSettledWithConcurrency)
    mapSettledMock.mockResolvedValue([])

    const { useWorkloads } = await importFresh()
    renderHook(() => useWorkloads())

    await waitFor(() => {
      if (mapSettledMock.mock.calls.length > 0) {
        const targets = mapSettledMock.mock.calls[0]?.[0] as Array<{ name: string }>
        const names = (targets || []).map(t => t.name)
        expect(names).not.toContain('unreachable-cluster')
      }
    })
  })

  it('authHeaders returns empty object when localStorage is unavailable', async () => {
    const getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockReturnValue(null)
    const { authHeaders } = await importFresh()
    const headers = authHeaders()
    expect(headers.Authorization).toBeUndefined()
    getItemSpy.mockRestore()
  })

  it('requireLocalAgentHttp throws with action name in message', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()
    expect(() => requireLocalAgentHttp('Restarting pod')).toThrow('Restarting pod')
  })
})
