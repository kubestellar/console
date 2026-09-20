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

import { useWarningEvents } from '../events'

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
// subscribeEventsCache
// ===========================================================================

describe('subscribeEventsCache', () => {
  // Import after mocks are set up
  let subscribeEventsCache: typeof import('../events').subscribeEventsCache
  beforeEach(async () => {
    const mod = await import('../events')
    subscribeEventsCache = mod.subscribeEventsCache
  })

  it('returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsub = subscribeEventsCache(callback)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('subscriber receives notifications when cache reset is triggered', async () => {
    const callback = vi.fn()
    const unsub = subscribeEventsCache(callback)

    // Trigger a cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('events')
    if (reset) {
      reset()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ isResetting: true }),
      )
    }

    unsub()
  })

  it('does not receive notifications after unsubscribing', async () => {
    const callback = vi.fn()
    const unsub = subscribeEventsCache(callback)
    unsub()

    callback.mockClear()
    const reset = capturedCacheResets.get('events')
    if (reset) {
      reset()
    }

    expect(callback).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// useWarningEvents
// ===========================================================================

describe('useWarningEvents', () => {
  it('returns initial loading state when no cache exists', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useWarningEvents())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])
  })

  it('returns warning events after SSE fetch resolves', async () => {
    const fakeWarnings = [
      {
        type: 'Warning', reason: 'BackOff', message: 'Back-off restarting',
        object: 'Pod/pod-1', namespace: 'default', cluster: 'c1',
        count: 5, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
      },
    ]
    mockFetchSSE.mockResolvedValue(fakeWarnings)

    const { result } = renderHook(() => useWarningEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events).toEqual(fakeWarnings)
    expect(result.current.error).toBeNull()
  })

  it('fetches from the dedicated warnings stream endpoint', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useWarningEvents())

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { url: string }
    expect(callArgs.url).toBe('/api/mcp/events/warnings/stream')
  })

  it('forwards cluster, namespace, and limit when provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useWarningEvents('cluster-x', 'ns-y', 30))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('cluster-x')
    expect(callArgs.params?.namespace).toBe('ns-y')
    expect(callArgs.params?.limit).toBe('30')
  })

  it('refetch() triggers a new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useWarningEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears interval on unmount', async () => {
    vi.useFakeTimers()
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => useWarningEvents())

    // Advance time past one poll cycle
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = mockFetchSSE.mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new SSE calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect(mockFetchSSE.mock.calls.length).toBe(callsAfterPoll)
  })

  it('handles SSE failure without surfacing unexpected error types', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useWarningEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // error is 'Failed to fetch warning events' on first cold-cache failure; null if stale cache exists
    expect(
      result.current.error === null || result.current.error === 'Failed to fetch warning events'
    ).toBe(true)
    // Any events shown are always Warning-type (from demo fallback or stale cache)
    expect(result.current.events.every(e => e.type === 'Warning')).toBe(true)
  })

  it('returns only Warning events in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useWarningEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // In demo mode, useWarningEvents filters for type === 'Warning'
    expect(result.current.events.every(e => e.type === 'Warning')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('return shape includes all expected fields', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useWarningEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(Array.isArray(result.current.events)).toBe(true)
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    expect('lastUpdated' in result.current).toBe(true)
    expect('error' in result.current).toBe(true)
  })

  it('demo mode filters warning events by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useWarningEvents('vllm-gpu-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.events.every(e => e.type === 'Warning' && e.cluster === 'vllm-gpu-cluster')).toBe(true)
  })

  it('demo mode filters warning events by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useWarningEvents(undefined, 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.events.every(e => e.type === 'Warning' && e.namespace === 'production')).toBe(true)
  })

  it('reacts to warning events cache reset by clearing data', async () => {
    const fakeWarnings = [
      {
        type: 'Warning', reason: 'BackOff', message: 'Back-off restarting',
        object: 'Pod/pod-1', namespace: 'default', cluster: 'c1',
        count: 5, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
      },
    ]
    mockFetchSSE.mockResolvedValue(fakeWarnings)

    const { result, unmount } = renderHook(() => useWarningEvents())
    await waitFor(() => expect(result.current.events.length).toBeGreaterThan(0))

    mockFetchSSE.mockReturnValue(new Promise(() => {}))

    const reset = capturedCacheResets.get('events')
    expect(reset).toBeDefined()
    act(() => { reset!() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])

    unmount()
  })

  it('sets error message on cold-cache SSE failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('connection refused'))

    const { result } = renderHook(() => useWarningEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to fetch warning events')
  })

  it('SSE result is sliced to the provided limit', async () => {
    const LIMIT = 3
    const manyWarnings = Array.from({ length: 10 }, (_, i) => ({
      type: 'Warning', reason: `Reason${i}`, message: `msg${i}`,
      object: `Pod/pod-${i}`, namespace: 'ns', cluster: 'c',
      count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
    }))
    mockFetchSSE.mockResolvedValue(manyWarnings)

    const { result } = renderHook(() => useWarningEvents(undefined, undefined, LIMIT))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeLessThanOrEqual(LIMIT)
  })

  it('sets lastUpdated after successful SSE fetch', async () => {
    mockFetchSSE.mockResolvedValue([
      { type: 'Warning', reason: 'X', message: 'y', object: 'Pod/a', namespace: 'ns', cluster: 'c', count: 1 },
    ])

    const { result } = renderHook(() => useWarningEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.lastUpdated).toBeInstanceOf(Date)
  })

  it('cancels in-flight fetches on refetch', async () => {
    // Capture signals from each fetchSSE call so we can check abortion
    const capturedSignals: AbortSignal[] = []
    mockFetchSSE.mockImplementation((opts: { signal?: AbortSignal }) => {
      if (opts.signal) capturedSignals.push(opts.signal)
      return new Promise(() => {}) // never resolves, simulating in-flight
    })

    const { result } = renderHook(() => useWarningEvents())

    // Wait for the first fetch to register its signal
    await waitFor(() => expect(capturedSignals.length).toBeGreaterThanOrEqual(1))
    const firstSignal = capturedSignals[0]
    expect(firstSignal.aborted).toBe(false)

    // Trigger a second refetch while the first is still in-flight
    await act(async () => { result.current.refetch() })

    // Wait for the second signal to be registered
    await waitFor(() => expect(capturedSignals.length).toBeGreaterThanOrEqual(2))
    const secondSignal = capturedSignals[capturedSignals.length - 1]

    // The older fetch's signal must be aborted; the newer one is still active
    expect(firstSignal.aborted).toBe(true)
    expect(secondSignal.aborted).toBe(false)
  })

  it('does not setState after unmount', async () => {
    // Hold the fetchSSE promise so we can resolve it after unmounting
    let resolveFetch: (value: unknown[]) => void = () => {}
    mockFetchSSE.mockImplementation((opts: { signal?: AbortSignal }) => {
      return new Promise<unknown[]>((resolve) => {
        resolveFetch = resolve
        // If the signal fires abort, reject with AbortError like a real fetch
        opts.signal?.addEventListener('abort', () => {
          resolve([]) // treat as cancelled — no state update expected
        })
      })
    })

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() => useWarningEvents())

    // Unmount mid-fetch
    unmount()

    // Resolve the fetch after unmount — any setEvents calls afterward would warn
    await act(async () => {
      resolveFetch([
        { type: 'Warning', reason: 'Late', message: 'late', object: 'Pod/l', namespace: 'ns', cluster: 'c', count: 1 },
      ])
      await new Promise(r => setTimeout(r, 0))
    })

    // React logs a warning on state updates after unmount — there should be none
    const unmountWarnings = warnSpy.mock.calls.filter(call =>
      typeof call[0] === 'string' && call[0].includes('unmounted')
    )
    expect(unmountWarnings).toHaveLength(0)
    warnSpy.mockRestore()
  })
})
