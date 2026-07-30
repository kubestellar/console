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

describe('useScaleWorkload', () => {
  it('sends scale request and calls onSuccess', async () => {
    const scaleResult = { success: true, message: 'Scaled to 5' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(scaleResult), {
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

    expect(onSuccess).toHaveBeenCalledWith(scaleResult)
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

  it('throws error when response is 200 OK but success is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'Scaling logic failure' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useScaleWorkload } = await importFresh()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useScaleWorkload())
    await act(async () => {
      try {
        await result.current.mutate(
          { workloadName: 'api-server', namespace: 'production', replicas: 5 },
          { onError, onSuccess }
        )
      } catch {
        // expected
      }
    })

    expect(onError).toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('Scaling logic failure')
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
