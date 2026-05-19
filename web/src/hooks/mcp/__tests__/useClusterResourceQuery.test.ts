import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockRegisterRefetch,
  mockSubscribePolling,
  mockIsClusterModeBackend,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
  mockIsClusterModeBackend: vi.fn(() => false),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: () => mockIsClusterModeBackend(),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 1_000,
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as Parameters<typeof fetch>)),
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { useClusterResourceQuery } from '../useClusterResourceQuery'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    resourceKey: 'testResource',
    endpoint: 'testresources',
    dataField: 'testResource',
    getDemoData: () => [{ id: 1, name: 'demo-item', cluster: 'demo-cluster' }],
    ...overrides,
  }
}

function mockFetchOk(data: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

function mockFetchNotOk(status = 500) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
  })
}

function mockFetchError(message = 'network error') {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error(message))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsDemoMode.mockReturnValue(false)
  mockIsClusterModeBackend.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
  // Polyfill AbortSignal.timeout if not available in jsdom
  if (!('timeout' in AbortSignal)) {
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: (_ms: number) => new AbortController().signal,
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// Tests
// ===========================================================================

describe('useClusterResourceQuery', () => {
  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts in loading state with empty data', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Demo mode
  // -------------------------------------------------------------------------

  describe('demo mode', () => {
    it('returns filtered demo data with filterFn', async () => {
      mockIsDemoMode.mockReturnValue(true)
      const config = makeConfig({
        getDemoData: () => [
          { id: 1, cluster: 'cluster-a' },
          { id: 2, cluster: 'cluster-b' },
        ],
        filterFn: (item: { cluster: string }, cluster?: string) => !cluster || item.cluster === cluster,
        cluster: 'cluster-a',
      })
      const { result } = renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([{ id: 1, cluster: 'cluster-a' }])
      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('returns all demo data when no filterFn provided', async () => {
      mockIsDemoMode.mockReturnValue(true)
      const items = [{ id: 1 }, { id: 2 }]
      const config = makeConfig({
        getDemoData: () => items,
      })
      const { result } = renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(items)
      expect(result.current.isDemoFallback).toBe(true)
    })

    it('forceLive bypasses demo mode and fetches live data', async () => {
      mockIsDemoMode.mockReturnValue(true)
      mockFetchOk({ testResource: [{ id: 99 }] })
      const config = makeConfig({ forceLive: true })
      const { result } = renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.isDemoFallback).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Backend cluster mode (isClusterModeBackend = true)
  // -------------------------------------------------------------------------

  describe('backend cluster mode', () => {
    beforeEach(() => {
      mockIsClusterModeBackend.mockReturnValue(true)
    })

    it('fetches from /api/mcp/:endpoint and returns data field', async () => {
      mockFetchOk({ testResource: [{ id: 10 }, { id: 20 }] })
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([{ id: 10 }, { id: 20 }])
      expect(result.current.isDemoFallback).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.consecutiveFailures).toBe(0)
    })

    it('appends cluster and namespace as URL params', async () => {
      mockFetchOk({ testResource: [] })
      const config = makeConfig({ cluster: 'my-cluster', namespace: 'my-ns' })
      renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('cluster=my-cluster'),
          expect.anything(),
        )
      })
      const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain('namespace=my-ns')
    })

    it('returns empty data when backend response is non-ok', async () => {
      mockFetchNotOk(403)
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([])
    })

    it('falls back gracefully when backend fetch throws a network error', async () => {
      mockFetchError('fetch failed')
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([])
    })

    it('returns empty data field when JSON response is missing the key', async () => {
      mockFetchOk({ otherField: [{ id: 1 }] })
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Local agent mode (isClusterModeBackend = false)
  // -------------------------------------------------------------------------

  describe('local agent mode', () => {
    it('fetches from LOCAL_AGENT_HTTP_URL/:endpoint and returns data field', async () => {
      mockFetchOk({ testResource: [{ id: 5 }] })
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([{ id: 5 }])
      expect(result.current.isDemoFallback).toBe(false)
      expect(result.current.consecutiveFailures).toBe(0)
    })

    it('silences errors and clears data when silentErrors=true (default)', async () => {
      mockFetchNotOk(500)
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.error).toBeNull()
      expect(result.current.data).toEqual([])
    })

    it('sets error message when silentErrors=false', async () => {
      mockFetchNotOk(500)
      const config = makeConfig({ silentErrors: false })
      const { result } = renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.error).toContain('testResource')
    })

    it('increments consecutiveFailures on each fetch error', async () => {
      mockFetchError('timeout')
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.consecutiveFailures).toBe(1)
    })

    it('resets consecutiveFailures to 0 on successful fetch', async () => {
      // Start with a failure to set consecutiveFailures > 0
      mockFetchError('timeout')
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

      // Then succeed on next refetch
      mockFetchOk({ testResource: [{ id: 1 }] })
      act(() => { result.current.refetch() })
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    })
  })

  // -------------------------------------------------------------------------
  // Lifecycle: polling and refetch registration
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('subscribes to polling and registers refetch on mount', async () => {
      mockFetchOk({ testResource: [] })
      renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => {
        expect(mockSubscribePolling).toHaveBeenCalledWith(
          expect.stringContaining('testResource'),
          expect.any(Number),
          expect.any(Function),
        )
      })
      expect(mockRegisterRefetch).toHaveBeenCalledWith(
        expect.stringContaining('testResource'),
        expect.any(Function),
      )
    })

    it('calls cleanup functions on unmount', async () => {
      const unsubscribePolling = vi.fn()
      const unregisterRefetch = vi.fn()
      mockSubscribePolling.mockReturnValue(unsubscribePolling)
      mockRegisterRefetch.mockReturnValue(unregisterRefetch)

      mockFetchOk({ testResource: [] })
      const { unmount } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())

      unmount()
      expect(unsubscribePolling).toHaveBeenCalled()
      expect(unregisterRefetch).toHaveBeenCalled()
    })

    it('includes cluster and namespace in polling key', async () => {
      mockFetchOk({ testResource: [] })
      const config = makeConfig({ cluster: 'prod', namespace: 'default' })
      renderHook(() => useClusterResourceQuery(config))
      await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())
      const pollKey = mockSubscribePolling.mock.calls[0][0] as string
      expect(pollKey).toContain('prod')
      expect(pollKey).toContain('default')
    })
  })

  // -------------------------------------------------------------------------
  // refetch function
  // -------------------------------------------------------------------------

  describe('refetch', () => {
    it('exposes a refetch function that re-triggers the fetch', async () => {
      mockFetchOk({ testResource: [{ id: 1 }] })
      const { result } = renderHook(() => useClusterResourceQuery(makeConfig()))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      mockFetchOk({ testResource: [{ id: 2 }, { id: 3 }] })
      act(() => { result.current.refetch() })
      await waitFor(() => expect(result.current.data).toEqual([{ id: 2 }, { id: 3 }]))
    })
  })
})
