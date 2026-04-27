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
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
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
function _flushPromises() {
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

    // Phase 1 PR B (#7993/#8013) moved delete off the backend REST path
    // and onto kc-agent to run under the user's kubeconfig. The verb is
    // now POST-with-body (mirroring /scale), not DELETE-with-params.
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
