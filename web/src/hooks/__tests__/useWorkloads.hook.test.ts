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
