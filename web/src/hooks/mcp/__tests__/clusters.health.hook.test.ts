import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth } from '../types'



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
import { useClusterHealth } from '../clusters'
import {
  clusterSubscribers,
  dataSubscribers,
  uiSubscribers,
  updateClusterCache,
  setInitialFetchStarted,
  sharedWebSocket,
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
} from '../shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches the offline threshold in shared.ts (5 minutes). */
const OFFLINE_THRESHOLD_MS = 5 * 60_000

const EMPTY_CACHE = {
  clusters: [] as ClusterInfo[],
  lastUpdated: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  consecutiveFailures: 0,
  isFailed: false,
  lastRefresh: null,
} as const

function resetSharedState() {
  localStorage.clear()
  clusterSubscribers.clear()
  dataSubscribers.clear()
  uiSubscribers.clear()
  setInitialFetchStarted(false)
  sharedWebSocket.ws = null
  sharedWebSocket.connecting = false
  sharedWebSocket.reconnectAttempts = 0
  if (sharedWebSocket.reconnectTimeout) {
    clearTimeout(sharedWebSocket.reconnectTimeout)
    sharedWebSocket.reconnectTimeout = null
  }
  // updateClusterCache modifies the module variable via live binding
  updateClusterCache({ ...EMPTY_CACHE })
  // Clear subscriptions that updateClusterCache may have notified
  clusterSubscribers.clear()
  dataSubscribers.clear()
  uiSubscribers.clear()
}

describe('useClusterHealth', () => {
  const CLUSTER = 'test-cluster'

  beforeEach(() => {
    resetSharedState()
    mockFetchSingleClusterHealth.mockReset()
    mockIsDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    clearClusterFailure(CLUSTER)
    vi.useRealTimers()
  })

  it('starts with isLoading: true and null health', () => {
    // fetch never resolves so state stays at initial
    mockFetchSingleClusterHealth.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.health).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('populates health on successful fetch', async () => {
    const healthData: ClusterHealth = {
      cluster: CLUSTER,
      healthy: true,
      reachable: true,
      nodeCount: 3,
      readyNodes: 3,
      podCount: 20,
    }
    mockFetchSingleClusterHealth.mockResolvedValue(healthData)

    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.health).toEqual(healthData)
    expect(result.current.error).toBeNull()
  })

  it('retains stale data on transient failure (stale-while-revalidate)', async () => {
    const goodHealth: ClusterHealth = {
      cluster: CLUSTER,
      healthy: true,
      reachable: true,
      nodeCount: 2,
      readyNodes: 2,
      podCount: 10,
    }

    // First fetch succeeds → sets prevHealthRef
    mockFetchSingleClusterHealth.mockResolvedValueOnce(goodHealth)
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.health).toEqual(goodHealth))

    // Second fetch returns null (transient failure, below 5-min threshold)
    mockFetchSingleClusterHealth.mockResolvedValueOnce(null)
    await act(async () => { await result.current.refetch() })

    // Must still show the previous good health and be done loading
    expect(result.current.isLoading).toBe(false)
    expect(result.current.health).toEqual(goodHealth)
    expect(result.current.error).toBeNull()
  })

  it('marks cluster offline (reachable: false) after 5 minutes of failures', async () => {
    vi.useFakeTimers()
    mockFetchSingleClusterHealth.mockResolvedValue(null)

    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    // Drive the first refetch (called on mount)
    await act(() => Promise.resolve())

    // Simulate 5+ minutes passing since first failure
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1)

    // Trigger another refetch after the threshold
    await act(async () => { await result.current.refetch() })

    expect(result.current.health?.reachable).toBe(false)
    expect(result.current.health?.healthy).toBe(false)
  })

  it('returns demo health data when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockFetchSingleClusterHealth.mockResolvedValue(null)

    const { result } = renderHook(() => useClusterHealth('kind-local'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // getDemoHealth for 'kind-local' returns nodeCount: 1
    expect(result.current.health?.cluster).toBe('kind-local')
    expect(result.current.health?.nodeCount).toBe(1)
    expect(result.current.error).toBeNull()
  })

  it('resets health state when cluster prop changes', async () => {
    const healthA: ClusterHealth = {
      cluster: 'cluster-a',
      healthy: true,
      reachable: true,
      nodeCount: 5,
      readyNodes: 5,
      podCount: 40,
    }
    const healthB: ClusterHealth = {
      cluster: 'cluster-b',
      healthy: true,
      reachable: true,
      nodeCount: 10,
      readyNodes: 10,
      podCount: 80,
    }
    mockFetchSingleClusterHealth
      .mockResolvedValueOnce(healthA)
      .mockResolvedValueOnce(healthB)

    const { result, rerender } = renderHook(
      ({ cluster }) => useClusterHealth(cluster),
      { initialProps: { cluster: 'cluster-a' } },
    )
    await waitFor(() => expect(result.current.health?.cluster).toBe('cluster-a'))
    expect(result.current.health?.nodeCount).toBe(5)

    // Change to a different cluster
    rerender({ cluster: 'cluster-b' })
    await waitFor(() => expect(result.current.health?.cluster).toBe('cluster-b'))
    expect(result.current.health?.nodeCount).toBe(10)
  })

  it('handles undefined cluster gracefully', async () => {
    const { result } = renderHook(() => useClusterHealth(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.health).toBeNull()
    expect(result.current.error).toBeNull()
    // fetchSingleClusterHealth should NOT be called for undefined cluster
    expect(mockFetchSingleClusterHealth).not.toHaveBeenCalled()
  })

  it('uses cached cluster data when available on mount', async () => {
    // Populate the shared cluster cache with a cluster that has nodeCount
    const cachedClusters: ClusterInfo[] = [
      {
        name: 'cached-cluster',
        context: 'cached-ctx',
        server: 'https://cached.example.com',
        healthy: true,
        reachable: true,
        nodeCount: 7,
        podCount: 55,
        cpuCores: 32,
        memoryGB: 128,
        storageGB: 500,
      },
    ]
    await act(async () => {
      updateClusterCache({ clusters: cachedClusters, isLoading: false })
    })

    // fetchSingleClusterHealth never resolves - we want to test the cached path
    mockFetchSingleClusterHealth.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useClusterHealth('cached-cluster'))
    // Should show cached data immediately (before fetch resolves)
    await waitFor(() => expect(result.current.health).not.toBeNull())
    expect(result.current.health?.cluster).toBe('cached-cluster')
    expect(result.current.health?.nodeCount).toBe(7)
    expect(result.current.health?.podCount).toBe(55)
  })

  it('marks unreachable immediately when agent reports reachable: false', async () => {
    const unreachableData: ClusterHealth = {
      cluster: CLUSTER,
      healthy: false,
      reachable: false,
      nodeCount: 0,
      readyNodes: 0,
      podCount: 0,
      errorMessage: 'Connection refused',
    }
    mockFetchSingleClusterHealth.mockResolvedValue(unreachableData)

    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Agent says reachable: false - trust it immediately, no 5 minute delay
    expect(result.current.health?.reachable).toBe(false)
    expect(result.current.health?.healthy).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('clears failure tracking on successful fetch after previous failures', async () => {
    // Record an initial failure
    recordClusterFailure(CLUSTER)

    const goodHealth: ClusterHealth = {
      cluster: CLUSTER,
      healthy: true,
      reachable: true,
      nodeCount: 3,
      readyNodes: 3,
      podCount: 15,
    }
    mockFetchSingleClusterHealth.mockResolvedValue(goodHealth)

    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.health).toEqual(goodHealth))

    // After successful fetch, failure tracking must be cleared
    expect(shouldMarkOffline(CLUSTER)).toBe(false)
  })

  it('falls back to demo health on exception after offline threshold', async () => {
    vi.useFakeTimers()

    // First call: exception
    mockFetchSingleClusterHealth.mockRejectedValue(new Error('Network timeout'))

    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await act(() => Promise.resolve())

    // Advance past the 5-minute offline threshold
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1)

    // Second call: also exception
    mockFetchSingleClusterHealth.mockRejectedValue(new Error('Still failing'))
    await act(async () => { await result.current.refetch() })

    // After threshold, should set error and fall back to demo health
    expect(result.current.error).toBe('Failed to fetch cluster health')
    expect(result.current.health).not.toBeNull()
    expect(result.current.health?.cluster).toBe(CLUSTER)
  })

  it('preserves previous health on transient exception (before offline threshold)', async () => {
    const goodHealth: ClusterHealth = {
      cluster: CLUSTER,
      healthy: true,
      reachable: true,
      nodeCount: 4,
      readyNodes: 4,
      podCount: 30,
    }

    // First fetch succeeds
    mockFetchSingleClusterHealth.mockResolvedValueOnce(goodHealth)
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.health).toEqual(goodHealth))

    // Second fetch throws (transient error, before 5-minute threshold)
    mockFetchSingleClusterHealth.mockRejectedValueOnce(new Error('transient'))
    await act(async () => { await result.current.refetch() })

    // Should still show previous good health, no error
    expect(result.current.health).toEqual(goodHealth)
    expect(result.current.error).toBeNull()
  })

  it('returns default demo metrics for unknown cluster names', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth('unknown-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Unknown clusters get default demo metrics: nodeCount=3, podCount=45
    expect(result.current.health?.cluster).toBe('unknown-cluster')
    expect(result.current.health?.nodeCount).toBe(3)
    expect(result.current.health?.podCount).toBe(45)
    expect(result.current.health?.healthy).toBe(true)
  })

  it('getDemoHealth marks alibaba-ack-shanghai as unhealthy', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth('alibaba-ack-shanghai'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.health?.cluster).toBe('alibaba-ack-shanghai')
    expect(result.current.health?.healthy).toBe(false)
    expect(result.current.health?.nodeCount).toBe(8)
  })

  it('passes kubectl context from cluster cache to fetchSingleClusterHealth', async () => {
    // Populate cache with a cluster that has a different context than name
    const clusters: ClusterInfo[] = [
      {
        name: 'my-cluster',
        context: 'arn:aws:eks:us-east-1:123456:cluster/my-cluster',
        server: 'https://eks.amazonaws.com',
        nodeCount: 2,
      },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    mockFetchSingleClusterHealth.mockResolvedValue({
      cluster: 'my-cluster',
      healthy: true,
      reachable: true,
      nodeCount: 2,
      readyNodes: 2,
      podCount: 10,
    })

    renderHook(() => useClusterHealth('my-cluster'))
    await waitFor(() => expect(mockFetchSingleClusterHealth).toHaveBeenCalled())

    // Should pass the context (not the name) as the kubectlContext arg
    expect(mockFetchSingleClusterHealth).toHaveBeenCalledWith(
      'my-cluster',
      'arn:aws:eks:us-east-1:123456:cluster/my-cluster',
    )
  })
})
