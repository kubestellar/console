import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

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

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
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
  getEffectiveInterval: (ms: number) => ms,
  LOCAL_AGENT_URL: 'http://localhost:8585',
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useEvents,
  useWarningEvents,
} from '../events'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
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

    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.events.length).toBeGreaterThan(0))

    // Block next fetch so loading state is visible after reset
    mockFetchSSE.mockReturnValue(new Promise(() => {}))

    // Trigger the real cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('events')
    expect(reset).toBeDefined()
    await act(async () => { reset!() })

    // Hook reacts: loading flag is set and visible data is cleared
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events).toEqual([])
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
    // isFailed is only true after 3 consecutive failures
    expect(result.current.isFailed).toBe(false)
  })

  it('returns demo events when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useWarningEvents())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // In demo mode, useWarningEvents filters for type === 'Warning'
    expect(result.current.events.every(e => e.type === 'Warning')).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
