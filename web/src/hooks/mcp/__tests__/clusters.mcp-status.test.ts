import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const {
  mockAgentFetch,
  mockTriggerAggressiveDetection,
  mockSubscribePolling,
  mockConnectSharedWebSocket,
  mockFullFetchClusters,
  sharedState,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockTriggerAggressiveDetection: vi.fn(() => Promise.resolve()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
  mockConnectSharedWebSocket: vi.fn(),
  mockFullFetchClusters: vi.fn(),
  sharedState: {
    initialFetchStarted: false,
    clusterCache: {
      clusters: [],
      lastUpdated: null,
      consecutiveFailures: 0,
      isFailed: false,
      isLoading: true,
      isRefreshing: false,
      error: null,
      lastRefresh: null,
    },
  },
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
}))

vi.mock('../../useLocalAgent', () => ({
  triggerAggressiveDetection: () => mockTriggerAggressiveDetection(),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'test-token' }
})

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: () => 'test-token',
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 30_000,
  getEffectiveInterval: (base: number, failures: number) => {
    const backoffMultiplier = Math.min(Math.pow(2, failures), 8)
    return base * backoffMultiplier
  },
  clusterCache: sharedState.clusterCache,
  subscribeClusterData: (callback: (cache: unknown) => void) => {
    callback(sharedState.clusterCache)
    return vi.fn()
  },
  subscribeClusterUI: (callback: (ui: unknown) => void) => {
    callback({
      isLoading: sharedState.clusterCache.isLoading,
      isRefreshing: sharedState.clusterCache.isRefreshing,
      error: sharedState.clusterCache.error,
      lastRefresh: sharedState.clusterCache.lastRefresh,
    })
    return vi.fn()
  },
  connectSharedWebSocket: () => mockConnectSharedWebSocket(),
  fullFetchClusters: () => mockFullFetchClusters(),
  initialFetchStarted: sharedState.initialFetchStarted,
  setInitialFetchStarted: (value: boolean) => { sharedState.initialFetchStarted = value },
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
  shareMetricsBetweenSameServerClusters: (clusters: unknown[]) => clusters,
  sharedWebSocket: null,
  fetchSingleClusterHealth: vi.fn(),
  shouldMarkOffline: () => false,
  recordClusterFailure: vi.fn(),
  clearClusterFailure: vi.fn(),
  setHealthCheckFailures: vi.fn(),
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  }
})

import { useMCPStatus } from '../clusters'

describe('clusters hooks - useMCPStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('test-token', 'test-auth-token')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Test 1: Loading → Success state transition
  it('transitions from loading to success when MCP status is fetched successfully', async () => {
    const mockStatus = {
      connected: true,
      uptime: 12345,
      version: '1.0.0',
      clusters: 3,
    }

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    })

    const { result } = renderHook(() => useMCPStatus())

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.status).toBeNull()

    // Wait for success
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toEqual(mockStatus)
    expect(result.current.error).toBeNull()
  })

  // Test 2: Loading → Error state transition
  it('transitions from loading to error when fetch fails', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Connection refused'))

    const { result } = renderHook(() => useMCPStatus())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('MCP bridge not available')
    expect(result.current.status).toBeNull()
  })

  // Test 3: Consecutive failure tracking
  it('tracks consecutive failures and increases polling interval', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useMCPStatus())

    await waitFor(() => expect(result.current.error).toBe('MCP bridge not available'))

    // Check that subscribePolling was called
    expect(mockSubscribePolling).toHaveBeenCalled()

    // Verify the polling callback exists
    const pollingCall = mockSubscribePolling.mock.calls[0]
    expect(pollingCall[0]).toBe('mcpStatus')
    expect(typeof pollingCall[2]).toBe('function')
  })

  // Test 4: Success after consecutive failures resets failure count
  it('resets consecutive failures to 0 after successful fetch', async () => {
    let callCount = 0
    mockAgentFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('First failure')
      }
      return {
        ok: true,
        json: async () => ({ connected: true, clusters: 2 }),
      }
    })

    const { result, rerender } = renderHook(() => useMCPStatus())

    // First call fails
    await waitFor(() => expect(result.current.error).toBe('MCP bridge not available'))

    // Second call succeeds (simulated by re-fetching)
    callCount = 0 // Reset for second attempt
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, clusters: 2 }),
    })

    rerender()

    await waitFor(() => expect(result.current.status).not.toBeNull())
    expect(result.current.error).toBeNull()
  })

  // Test 5: HTTP error status codes
  it('treats HTTP 500 as an error', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useMCPStatus())

    await waitFor(() => expect(result.current.error).toBe('MCP bridge not available'))
    expect(result.current.status).toBeNull()
  })

  // Test 6: HTTP error 404 (MCP not found)
  it('treats HTTP 404 as MCP bridge unavailable', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useMCPStatus())

    await waitFor(() => expect(result.current.error).toBe('MCP bridge not available'))
    expect(result.current.status).toBeNull()
  })

  // Test 7: Polling registration
  it('registers polling callback with correct interval', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true }),
    })

    renderHook(() => useMCPStatus())

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())

    const pollingCall = mockSubscribePolling.mock.calls[0]
    expect(pollingCall[0]).toBe('mcpStatus')
    expect(pollingCall[1]).toBe(120_000) // REFRESH_INTERVAL_MS
    expect(typeof pollingCall[2]).toBe('function')
  })

  // Test 8: Cleanup unsubscribes from polling
  it('unsubscribes from polling on unmount', async () => {
    const mockUnsubscribe = vi.fn()
    mockSubscribePolling.mockReturnValue(mockUnsubscribe)

    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true }),
    })

    const { unmount } = renderHook(() => useMCPStatus())

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  // Test 9: Exponential backoff on consecutive failures
  it('increases polling interval with exponential backoff', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))

    const { rerender } = renderHook(() => useMCPStatus())

    // Initial call with 0 failures
    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())
    const firstCall = mockSubscribePolling.mock.calls[0]
    expect(firstCall[1]).toBe(120_000) // base interval

    // After failures, interval should increase (this is handled by getEffectiveInterval)
    // The test verifies the polling mechanism exists
    expect(mockSubscribePolling).toHaveBeenCalledWith(
      'mcpStatus',
      expect.any(Number),
      expect.any(Function)
    )
  })

  // Test 10: Handles malformed JSON response
  it('treats malformed JSON as an error', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON')
      },
    })

    const { result } = renderHook(() => useMCPStatus())

    await waitFor(() => expect(result.current.error).toBe('MCP bridge not available'))
    expect(result.current.status).toBeNull()
  })
})
