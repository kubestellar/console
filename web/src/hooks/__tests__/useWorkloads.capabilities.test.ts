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
