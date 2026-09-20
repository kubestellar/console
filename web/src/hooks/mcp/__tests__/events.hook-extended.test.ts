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

describe('useEvents (continued)', () => {

  it('falls back to SSE when local agent returns non-ok response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const sseEvents = [
      { type: 'Normal', reason: 'Created', message: 'Created container', object: 'Pod/p2', namespace: 'default', cluster: 'c2', count: 1 },
    ]
    mockFetchSSE.mockResolvedValue(sseEvents)

    const { result } = renderHook(() => useEvents('c2'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(globalThis.fetch).toHaveBeenCalled()
    expect(mockFetchSSE).toHaveBeenCalled()
    expect(result.current.events).toEqual(sseEvents)
  })

  it('falls back to SSE when local agent throws a network error', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const fallbackEvents = [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off', object: 'Pod/p3', namespace: 'prod', cluster: 'c3', count: 2 },
    ]
    mockFetchSSE.mockResolvedValue(fallbackEvents)

    const { result } = renderHook(() => useEvents('c3'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockFetchSSE).toHaveBeenCalled()
    expect(result.current.events).toEqual(fallbackEvents)
  })

  it('skips local agent when no cluster is specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false) // agent is available
    globalThis.fetch = vi.fn()
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useEvents()) // no cluster arg
    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())

    // globalThis.fetch should NOT have been called because cluster is undefined
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('skips local agent when isAgentUnavailable returns true', async () => {
    mockIsAgentUnavailable.mockReturnValue(true) // agent unavailable
    globalThis.fetch = vi.fn()
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useEvents('some-cluster'))
    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('marks isFailed after 3 consecutive SSE failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useEvents())

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    await act(async () => {
      await result.current.refetch()
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures to 0 on successful fetch', async () => {
    // Start with failures
    mockFetchSSE.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)

    // Now succeed
    mockFetchSSE.mockResolvedValue([
      { type: 'Normal', reason: 'Pulled', message: 'ok', object: 'Pod/x', namespace: 'ns', cluster: 'c', count: 1 },
    ])
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
  })

  it('silently ignores AbortError without setting error state', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError')
    mockFetchSSE.mockRejectedValue(abortErr)

    const { result } = renderHook(() => useEvents())
    // Give the hook time to process the abort error
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // AbortError should not increment failures or set error
    expect(result.current.error).toBeNull()
  })

  it('demo mode filters events by cluster when specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useEvents('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.events.every(e => e.cluster === 'gke-staging')).toBe(true)
  })

  it('demo mode filters events by namespace when specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useEvents(undefined, 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeGreaterThan(0)
    expect(result.current.events.every(e => e.namespace === 'production')).toBe(true)
  })

  it('demo mode respects the limit parameter', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)
    const DEMO_LIMIT = 2

    const { result } = renderHook(() => useEvents(undefined, undefined, DEMO_LIMIT))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeLessThanOrEqual(DEMO_LIMIT)
  })

  it('SSE result is sliced to the provided limit', async () => {
    const LIMIT = 2
    const manyEvents = Array.from({ length: 10 }, (_, i) => ({
      type: 'Normal', reason: `Reason${i}`, message: `msg${i}`,
      object: `Pod/pod-${i}`, namespace: 'ns', cluster: 'c',
      count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
    }))
    mockFetchSSE.mockResolvedValue(manyEvents)

    const { result } = renderHook(() => useEvents(undefined, undefined, LIMIT))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events.length).toBeLessThanOrEqual(LIMIT)
  })

  it('sets lastUpdated to a Date after successful fetch', async () => {
    mockFetchSSE.mockResolvedValue([
      { type: 'Normal', reason: 'OK', message: 'ok', object: 'Pod/a', namespace: 'ns', cluster: 'c', count: 1 },
    ])

    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.lastUpdated).toBeInstanceOf(Date)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  it('local agent passes cluster, namespace, and limit as query params', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    })

    renderHook(() => useEvents('my-cluster', 'my-ns', 15))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
    expect(url).toContain('limit=15')
  })

  it('handles empty events array from local agent gracefully', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    })

    const { result } = renderHook(() => useEvents('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.events).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles local agent response with missing events key', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no .events key
    })

    const { result } = renderHook(() => useEvents('c1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // data.events || [] should fallback to []
    expect(result.current.events).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
