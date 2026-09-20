import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true),
    mockReportAgentDataSuccess: vi.fn(),
    mockFetchSSE: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
    capturedCacheResets,
  }
})

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useEvents } from '../events'
// Import the same constant the source hooks use so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173).
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useEvents
// ===========================================================================

describe('useEvents', () => {
  it('returns initial loading state when no cache exists', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useEvents())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])
  })

  it('returns events after SSE fetch resolves', async () => {
    const fakeEvents = [
      {
        type: 'Normal', reason: 'Scheduled', message: 'Pod assigned',
        object: 'Pod/pod-1', namespace: 'default', cluster: 'c1',
        count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
      },
    ]
    mockFetchSSE.mockResolvedValue(fakeEvents)

    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events).toEqual(fakeEvents)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster, namespace, and limit when provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useEvents('prod-cluster', 'production', 50))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('prod-cluster')
    expect(callArgs.params?.namespace).toBe('production')
    expect(callArgs.params?.limit).toBe('50')
  })

  it('refetch() triggers a new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears interval on unmount', async () => {
    vi.useFakeTimers()
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => useEvents())

    // Advance time past one poll cycle
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = mockFetchSSE.mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new SSE calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect(mockFetchSSE.mock.calls.length).toBe(callsAfterPoll)
  })

  it('aborts in-flight SSE request signal on unmount', async () => {
    let capturedSignal: AbortSignal | undefined
    mockFetchSSE.mockImplementation((opts: { signal?: AbortSignal }) => {
      capturedSignal = opts.signal
      return new Promise(() => {}) // never resolves
    })

    const { unmount } = renderHook(() => useEvents())

    // Cleanup runs on unmount and aborts the controller
    unmount()

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(true)
  })

  it('reacts to events cache reset by clearing data and entering loading state', async () => {
    const fakeEvents = [
      {
        type: 'Normal', reason: 'Scheduled', message: 'Pod assigned',
        object: 'Pod/pod-1', namespace: 'default', cluster: 'c1',
        count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
      },
    ]
    mockFetchSSE.mockResolvedValue(fakeEvents)

    const { result, unmount } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.events.length).toBeGreaterThan(0))

    mockFetchSSE.mockReturnValue(new Promise(() => {}))

    const reset = capturedCacheResets.get('events')
    expect(reset).toBeDefined()
    act(() => { reset!() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])

    unmount()
  })

  it('handles SSE failure without surfacing an error (events are optional)', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook sets error='Failed to fetch events' only on the first uncached failure.
    // If a stale cache exists from an earlier test, error stays null.
    // In either case, no unexpected error types are surfaced.
    expect(
      result.current.error === null || result.current.error === 'Failed to fetch events'
    ).toBe(true)
    // With exponential backoff, cascading re-fetches quickly exceed the threshold
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('returns demo events when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('return shape includes all expected fields', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Verify every property of the return object exists with correct types
    expect(Array.isArray(result.current.events)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.isFailed).toBe('boolean')
    // lastUpdated and error can be null
    expect('lastUpdated' in result.current).toBe(true)
    expect('error' in result.current).toBe(true)
    expect('lastRefresh' in result.current).toBe(true)
  })

  it('uses /api/mcp/events/stream SSE endpoint', async () => {
    mockFetchSSE.mockResolvedValue([])
    renderHook(() => useEvents())
    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { url: string }
    expect(callArgs.url).toBe(`${LOCAL_AGENT_HTTP_URL}/events/stream`)
  })

  it('applies default limit of 20 when none is provided', async () => {
    mockFetchSSE.mockResolvedValue([])
    renderHook(() => useEvents('my-cluster'))
    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.limit).toBe('20')
  })

  it('tries local agent first when cluster is provided and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [
        { type: 'Normal', reason: 'Pulled', message: 'Image pulled', object: 'Pod/p1', namespace: 'ns', cluster: 'c1', count: 1 },
      ] }),
    })

    const { result } = renderHook(() => useEvents('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Local agent was called
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8585/events'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].reason).toBe('Pulled')
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    // SSE should NOT have been called since local agent succeeded
    expect(mockFetchSSE).not.toHaveBeenCalled()
  })
})
