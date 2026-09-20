import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterHealth, MCPStatus } from '../types'



// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockFullFetchClusters = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockConnectSharedWebSocket = vi.hoisted(() => vi.fn())
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockApiGet = vi.hoisted(() => vi.fn())
const mockAgentFetch = vi.hoisted(() => vi.fn())
const mockTriggerAggressiveDetection = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
const mockFetchSingleClusterHealth = vi.hoisted(() => vi.fn<() => Promise<ClusterHealth | null>>().mockResolvedValue(null))

// ---------------------------------------------------------------------------
// Partially mock ../shared: keep real state & pure-util implementations via
// getters (live-binding proxies) while stubbing network-calling functions.
// ---------------------------------------------------------------------------
vi.mock('../shared', async () => {
  const actual = await vi.importActual<typeof import('../shared')>('../shared')
  const m = actual as Record<string, unknown>
  return {
    // Live-binding getters so callers always see the current module variable
    get clusterCache() {
      return m.clusterCache
    },
    get initialFetchStarted() {
      return m.initialFetchStarted
    },
    get clusterSubscribers() {
      return m.clusterSubscribers
    },
    get dataSubscribers() {
      return m.dataSubscribers
    },
    get uiSubscribers() {
      return m.uiSubscribers
    },
    get sharedWebSocket() {
      return m.sharedWebSocket
    },
    get healthCheckFailures() {
      return m.healthCheckFailures
    },
    // Constants
    REFRESH_INTERVAL_MS: m.REFRESH_INTERVAL_MS,
    CLUSTER_POLL_INTERVAL_MS: m.CLUSTER_POLL_INTERVAL_MS,
    MIN_REFRESH_INDICATOR_MS: m.MIN_REFRESH_INDICATOR_MS,
    CACHE_TTL_MS: m.CACHE_TTL_MS,
    getLocalAgentURL: m.getLocalAgentURL,
    // Forwarded real implementations
    getEffectiveInterval: m.getEffectiveInterval,
    notifyClusterSubscribers: m.notifyClusterSubscribers,
    notifyClusterSubscribersDebounced: m.notifyClusterSubscribersDebounced,
    updateClusterCache: m.updateClusterCache,
    updateSingleClusterInCache: m.updateSingleClusterInCache,
    setInitialFetchStarted: m.setInitialFetchStarted,
    setHealthCheckFailures: m.setHealthCheckFailures,
    deduplicateClustersByServer: m.deduplicateClustersByServer,
    shareMetricsBetweenSameServerClusters: m.shareMetricsBetweenSameServerClusters,
    shouldMarkOffline: m.shouldMarkOffline,
    recordClusterFailure: m.recordClusterFailure,
    clearClusterFailure: m.clearClusterFailure,
    cleanupSharedWebSocket: m.cleanupSharedWebSocket,
    subscribeClusterCache: m.subscribeClusterCache,
    subscribeClusterData: m.subscribeClusterData,
    subscribeClusterUI: m.subscribeClusterUI,
    notifyClusterDataSubscribers: m.notifyClusterDataSubscribers,
    notifyClusterUISubscribers: m.notifyClusterUISubscribers,
    clusterCacheRef: m.clusterCacheRef,
    // Stubbed to prevent real network calls
    fetchSingleClusterHealth: mockFetchSingleClusterHealth,
    fullFetchClusters: mockFullFetchClusters,
    connectSharedWebSocket: mockConnectSharedWebSocket,
    agentFetch: mockAgentFetch,
  }
})

vi.mock('../../../lib/api', () => ({
  api: { get: mockApiGet },
  isBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
  isDemoToken: vi.fn(() => false),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../useLocalAgent', () => ({
  triggerAggressiveDetection: mockTriggerAggressiveDetection,
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataError: vi.fn(),
  reportAgentDataSuccess: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import { useMCPStatus } from '../clusters'
import {
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
  REFRESH_INTERVAL_MS,
} from '../shared'

describe('shouldMarkOffline / recordClusterFailure / clearClusterFailure', () => {
  const TEST_CLUSTER = '__test_offline_cluster__'

  afterEach(() => {
    clearClusterFailure(TEST_CLUSTER)
    vi.useRealTimers()
  })

  it('shouldMarkOffline returns false before the offline threshold', () => {
    vi.useFakeTimers()
    recordClusterFailure(TEST_CLUSTER)
    vi.advanceTimersByTime(60_000) // 1 minute – below 5-minute threshold
    expect(shouldMarkOffline(TEST_CLUSTER)).toBe(false)
  })

  it('shouldMarkOffline returns true after 5 minutes since the first failure', () => {
    vi.useFakeTimers()
    recordClusterFailure(TEST_CLUSTER)
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1)
    expect(shouldMarkOffline(TEST_CLUSTER)).toBe(true)
  })

  it('recordClusterFailure only sets the first failure timestamp once', () => {
    vi.useFakeTimers()
    recordClusterFailure(TEST_CLUSTER)
    vi.advanceTimersByTime(1_000)
    recordClusterFailure(TEST_CLUSTER) // second call must NOT reset the timestamp
    // Should be offline 5 minutes after the FIRST call, not the second
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS)
    expect(shouldMarkOffline(TEST_CLUSTER)).toBe(true)
  })

  it('clearClusterFailure resets offline tracking', () => {
    vi.useFakeTimers()
    recordClusterFailure(TEST_CLUSTER)
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1)
    expect(shouldMarkOffline(TEST_CLUSTER)).toBe(true)
    clearClusterFailure(TEST_CLUSTER)
    expect(shouldMarkOffline(TEST_CLUSTER)).toBe(false)
  })
})

describe('useMCPStatus', () => {
  beforeEach(() => {
    mockAgentFetch.mockReset()
  })

  it('returns { status: null, isLoading: true, error: null } on mount', () => {
    // Never-resolving promise simulates in-flight request
    mockAgentFetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMCPStatus())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.status).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns status data after fetch resolves', async () => {
    const mockStatus: MCPStatus = {
      opsClient: { available: true, toolCount: 5 },
      deployClient: { available: false, toolCount: 0 },
    }
    mockAgentFetch.mockResolvedValue(new Response(JSON.stringify(mockStatus), { status: 200 }))
    const { result } = renderHook(() => useMCPStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toEqual(mockStatus)
    expect(result.current.error).toBeNull()
  })

  it('returns "MCP bridge not available" on fetch error', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useMCPStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('MCP bridge not available')
    expect(result.current.status).toBeNull()
  })

  it('polls every REFRESH_INTERVAL_MS', async () => {
    vi.useFakeTimers()
    mockAgentFetch.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ opsClient: { available: true, toolCount: 1 }, deployClient: { available: true, toolCount: 1 } }), { status: 200 })
    ))
    renderHook(() => useMCPStatus())
    // Flush the initial fetch promise
    await act(() => Promise.resolve())
    const callsAfterMount = mockAgentFetch.mock.calls.length
    expect(callsAfterMount).toBeGreaterThanOrEqual(1)
    // Advance exactly one poll interval then flush
    act(() => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    await act(() => Promise.resolve())
    expect(mockAgentFetch.mock.calls.length).toBeGreaterThan(callsAfterMount)
    vi.useRealTimers()
  })

  it('clears the polling interval on unmount', async () => {
    vi.useFakeTimers()
    mockAgentFetch.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ opsClient: { available: true, toolCount: 1 }, deployClient: { available: true, toolCount: 1 } }), { status: 200 })
    ))
    const { unmount } = renderHook(() => useMCPStatus())
    await act(() => Promise.resolve())
    unmount()
    const countAfterUnmount = mockAgentFetch.mock.calls.length
    // Advance several intervals – no further calls should occur
    act(() => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3) })
    await act(() => Promise.resolve())
    expect(mockAgentFetch.mock.calls.length).toBe(countAfterUnmount)
    vi.useRealTimers()
  })
})
