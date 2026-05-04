import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    DEFAULT_REFRESH_INTERVAL_MS: 120_000,
    STORAGE_KEY_TOKEN: 'token',
  }
})

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

import { DEFAULT_REFRESH_INTERVAL_MS } from '../../lib/constants'
import { useTopology } from '../useTopology'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid TopologyResponse payload */
function makeTopologyResponse(overrides: Record<string, unknown> = {}) {
  return {
    graph: {
      nodes: [
        { id: 'cluster:a', type: 'cluster', label: 'a', cluster: 'a', health: 'healthy' },
      ],
      edges: [],
      clusters: ['a'],
      lastUpdated: Date.now(),
    },
    clusters: [
      { name: 'a', nodeCount: 1, serviceCount: 0, gatewayCount: 0, exportCount: 0, importCount: 0, health: 'healthy' },
    ],
    stats: {
      totalNodes: 1,
      totalEdges: 0,
      healthyConnections: 0,
      degradedConnections: 0,
    },
    ...overrides,
  }
}

/** HTTP 503 Service Unavailable response */
function make503() {
  return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
}

/** HTTP 500 Internal Server Error response */
function make500() {
  return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
}

/** Successful JSON response */
function makeOk(body: unknown = makeTopologyResponse()) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useTopology', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOk())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. Initial shape
  // -----------------------------------------------------------------------
  it('returns the expected result shape', () => {
    const { result } = renderHook(() => useTopology())
    const keys = Object.keys(result.current)
    expect(keys).toEqual(
      expect.arrayContaining([
        'graph', 'clusters', 'stats', 'isLoading', 'isFailed',
        'consecutiveFailures', 'isDemoData', 'lastRefresh', 'refetch',
      ]),
    )
    expect(typeof result.current.refetch).toBe('function')
  })

  // -----------------------------------------------------------------------
  // 2. Successful fetch populates data
  // -----------------------------------------------------------------------
  it('populates graph, clusters, stats after a successful fetch', async () => {
    const payload = makeTopologyResponse()
    vi.mocked(fetch).mockResolvedValue(makeOk(payload))
    const { result } = renderHook(() => useTopology())

    await waitFor(() => {
      expect(result.current.graph).not.toBeNull()
    })

    expect(result.current.clusters).toHaveLength(1)
    expect(result.current.stats?.totalNodes).toBe(1)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  // -----------------------------------------------------------------------
  // 3. Loading state transitions
  // -----------------------------------------------------------------------
  it('starts in loading state and clears it after fetch completes', async () => {
    // No cache -> isLoading starts true
    const { result } = renderHook(() => useTopology())
    // After fetch resolves, isLoading should be false
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  // -----------------------------------------------------------------------
  // 4. Falls back to demo data on 503
  // -----------------------------------------------------------------------
  it('falls back to demo data when the API returns 503', async () => {
    vi.mocked(fetch).mockResolvedValue(make503())
    const { result } = renderHook(() => useTopology())

    await waitFor(() => {
      expect(result.current.isDemoData).toBe(true)
    })

    // Should have demo graph with multiple nodes
    expect(result.current.graph).not.toBeNull()
    expect((result.current.graph?.nodes.length ?? 0)).toBeGreaterThan(0)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  // -----------------------------------------------------------------------
  // 5. Falls back to demo data on network error (first load)
  // -----------------------------------------------------------------------
  it('falls back to demo data on network error when no prior data exists', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useTopology())

    await waitFor(() => {
      expect(result.current.graph).not.toBeNull()
    })

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.consecutiveFailures).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 6. Increments consecutive failures on non-503 HTTP errors
  // -----------------------------------------------------------------------
  it('increments consecutiveFailures on HTTP 500', async () => {
    vi.mocked(fetch).mockResolvedValue(make500())
    const { result } = renderHook(() => useTopology())

    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // 7. isFailed flag triggers at threshold (3 failures)
  // -----------------------------------------------------------------------
  it('sets isFailed to true after 3 consecutive failures', async () => {
    vi.mocked(fetch).mockResolvedValue(make500())
    const { result } = renderHook(() => useTopology())

    // Initial fetch = failure 1
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
    expect(result.current.isFailed).toBe(false)

    // Trigger manual refetches to accumulate failures
    await act(async () => { await result.current.refetch() })
    expect(result.current.consecutiveFailures).toBe(2)
    expect(result.current.isFailed).toBe(false)

    await act(async () => { await result.current.refetch() })
    expect(result.current.consecutiveFailures).toBe(3)
    expect(result.current.isFailed).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 8. Consecutive failures reset on successful fetch
  // -----------------------------------------------------------------------
  it('resets consecutiveFailures to 0 after a successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(make500())
    const { result } = renderHook(() => useTopology())

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Now succeed
    vi.mocked(fetch).mockResolvedValue(makeOk())
    await act(async () => { await result.current.refetch() })
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isDemoData).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 9. Auth token is sent in headers
  // -----------------------------------------------------------------------
  it('includes Authorization header when a token is in localStorage', async () => {
    const TEST_TOKEN = 'test-bearer-token-abc'
    localStorage.setItem('token', TEST_TOKEN)
    vi.mocked(fetch).mockResolvedValue(makeOk())

    renderHook(() => useTopology())

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`)
  })

  // -----------------------------------------------------------------------
  // 10. No auth header when no token stored
  // -----------------------------------------------------------------------
  it('omits Authorization header when no token is in localStorage', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOk())
    renderHook(() => useTopology())

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // 11. Handles malformed response gracefully
  // -----------------------------------------------------------------------
  it('handles a response with missing graph/clusters/stats fields', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOk({}))
    const { result } = renderHook(() => useTopology())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.graph).toBeNull()
    expect(result.current.clusters).toEqual([])
    expect(result.current.stats).toBeNull()
    expect(result.current.isDemoData).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 12. Auto-refresh starts on first uncached render
  // -----------------------------------------------------------------------
  it('starts auto-refresh after the first uncached fetch completes', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOk())
    renderHook(() => useTopology())

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_REFRESH_INTERVAL_MS)
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // 13. refetch triggers a new fetch and updates lastRefresh
  // -----------------------------------------------------------------------
  it('updates lastRefresh after calling refetch', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOk())
    const { result } = renderHook(() => useTopology())

    await waitFor(() => expect(result.current.lastRefresh).not.toBeNull())

    const firstRefresh = result.current.lastRefresh

    // Advance time to get a different timestamp
    vi.advanceTimersByTime(1000)

    await act(async () => { await result.current.refetch() })

    expect(result.current.lastRefresh).not.toBeNull()
    // lastRefresh should have been updated (or at least re-set)
    expect(result.current.lastRefresh).toBeGreaterThanOrEqual(firstRefresh!)
  })
})
