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

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    POLL_INTERVAL_MS: 30_000,
    POLL_INTERVAL_SLOW_MS: 60_000,
  }
})

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

  it('tracks isRefreshing during refetch when data already exists', async () => {
    const capabilities = [
      { cluster: 'prod', nodeCount: 5, cpuCapacity: '32', memCapacity: '128Gi', available: true },
    ]
    let resolveSecondFetch: ((value: Response) => void) | undefined
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(capabilities), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveSecondFetch = resolve
      }))
    const { useClusterCapabilities } = await importFresh()

    const { result } = renderHook(() => useClusterCapabilities())

    await waitFor(() => {
      expect(result.current.data).toEqual(capabilities)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isRefreshing).toBe(false)
    })

    act(() => {
      void result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      resolveSecondFetch?.(
        new Response(JSON.stringify(capabilities), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
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
describe('useDeployWorkload', () => {
  it('sends POST request with deploy payload', async () => {
    const deployResult = { success: true, message: 'Deployed', deployedTo: ['prod'] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(deployResult), {
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

    expect(onSuccess).toHaveBeenCalledWith(deployResult)
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

  it('throws error when response is 200 OK but success is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'Logic failure' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeployWorkload } = await importFresh()
    const onError = vi.fn()
    const onSuccess = vi.fn()

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
          { onError, onSuccess }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('Logic failure')
  })
})
describe('useDeleteWorkload', () => {
  it('sends POST to kc-agent /workloads/delete and calls onSuccess', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, message: 'Deleted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
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

  it('throws error when response is 200 OK but success is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'Deletion logic failure' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useDeleteWorkload } = await importFresh()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useDeleteWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { cluster: 'prod', namespace: 'production', name: 'api-server' },
          { onError, onSuccess }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('Deletion logic failure')
  })
})
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
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.data).toBeDefined()
    // Verify the agent concurrency path was actually invoked
    expect(mapSettledMock).toHaveBeenCalled()
  })

  it('falls back to REST when agent returns null (no clusters)', async () => {
    mockClusterCacheRef.clusters = []
    const mockWorkloads = [
      { name: 'web', namespace: 'default', type: 'Deployment', replicas: 1, readyReplicas: 1, status: 'Running', image: 'web:v2', createdAt: '2025-01-01T00:00:00Z' },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: mockWorkloads }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()
    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // Verify it fell back to REST API fetch (not agent path)
    expect(fetchSpy).toHaveBeenCalled()
    const fetchUrl = fetchSpy.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/api/')
    expect(result.current.data).toBeDefined()
  })

  it('authHeaders returns empty object when no token stored', async () => {
    const { authHeaders } = await importFresh()
    const headers = authHeaders()
    expect(headers.Authorization).toBeUndefined()
    expect(Object.keys(headers).length).toBe(0)
  })

  it('requireLocalAgentHttp throws with action name in message', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()
    expect(() => requireLocalAgentHttp('Restarting pod')).toThrow('Restarting pod')
  })
})
