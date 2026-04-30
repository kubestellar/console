import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth, MCPStatus } from '../types'


// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockFullFetchClusters = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockConnectSharedWebSocket = vi.hoisted(() => vi.fn())
const mockUseDemoMode = vi.hoisted(() => vi.fn().mockReturnValue({ isDemoMode: false }))
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockApiGet = vi.hoisted(() => vi.fn())
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
    LOCAL_AGENT_URL: m.LOCAL_AGENT_URL,
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
    agentFetch: m.agentFetch,
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

vi.mock('../../useDemoMode', () => ({
  useDemoMode: mockUseDemoMode,
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
import { useMCPStatus, useClusterHealth } from '../clusters'
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
  REFRESH_INTERVAL_MS,
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

// ===========================================================================
// Pure utilities – deduplicateClustersByServer
// ===========================================================================

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
    mockApiGet.mockReset()
  })

  it('returns { status: null, isLoading: true, error: null } on mount', () => {
    // Never-resolving promise simulates in-flight request
    mockApiGet.mockReturnValue(new Promise(() => {}))
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
    mockApiGet.mockResolvedValue({ data: mockStatus })
    const { result } = renderHook(() => useMCPStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toEqual(mockStatus)
    expect(result.current.error).toBeNull()
  })

  it('returns "MCP bridge not available" on fetch error', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useMCPStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('MCP bridge not available')
    expect(result.current.status).toBeNull()
  })

  it('polls every REFRESH_INTERVAL_MS', async () => {
    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({
      data: { opsClient: { available: true, toolCount: 1 }, deployClient: { available: true, toolCount: 1 } },
    })
    renderHook(() => useMCPStatus())
    // Flush the initial fetch promise
    await act(() => Promise.resolve())
    const callsAfterMount = mockApiGet.mock.calls.length
    expect(callsAfterMount).toBeGreaterThanOrEqual(1)
    // Advance exactly one poll interval then flush
    act(() => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    await act(() => Promise.resolve())
    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsAfterMount)
    vi.useRealTimers()
  })

  it('clears the polling interval on unmount', async () => {
    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({
      data: { opsClient: { available: true, toolCount: 1 }, deployClient: { available: true, toolCount: 1 } },
    })
    const { unmount } = renderHook(() => useMCPStatus())
    await act(() => Promise.resolve())
    unmount()
    const countAfterUnmount = mockApiGet.mock.calls.length
    // Advance several intervals – no further calls should occur
    act(() => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3) })
    await act(() => Promise.resolve())
    expect(mockApiGet.mock.calls.length).toBe(countAfterUnmount)
    vi.useRealTimers()
  })
})

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

describe('useMCPStatus — additional branches', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
  })

  it('sets status to null when fetch errors, even if previous status existed', async () => {
    // Use fake timers BEFORE rendering so subscribePolling creates fake intervals
    vi.useFakeTimers()
    const initialStatus: MCPStatus = {
      opsClient: { available: true, toolCount: 5 },
      deployClient: { available: true, toolCount: 3 },
    }
    mockApiGet.mockResolvedValueOnce({ data: initialStatus })
    const { result } = renderHook(() => useMCPStatus())
    await act(async () => { await Promise.resolve() })
    expect(result.current.status).toEqual(initialStatus)

    // Subsequent poll errors
    mockApiGet.mockRejectedValue(new Error('Network error'))
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    await act(async () => { await Promise.resolve() })
    expect(result.current.error).toBe('MCP bridge not available')
    expect(result.current.status).toBeNull()
    vi.useRealTimers()
  })

  it('clears error when fetch succeeds after failure', async () => {
    // Use fake timers BEFORE rendering so subscribePolling creates fake intervals
    vi.useFakeTimers()
    mockApiGet.mockRejectedValueOnce(new Error('err'))
    const { result } = renderHook(() => useMCPStatus())
    await act(async () => { await Promise.resolve() })
    expect(result.current.error).toBe('MCP bridge not available')

    // Now succeed
    const good: MCPStatus = {
      opsClient: { available: true, toolCount: 1 },
      deployClient: { available: false, toolCount: 0 },
    }
    mockApiGet.mockResolvedValue({ data: good })
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    await act(async () => { await Promise.resolve() })
    expect(result.current.error).toBeNull()
    expect(result.current.status).toEqual(good)
    vi.useRealTimers()
  })
})

describe('useClusterHealth — additional branches', () => {
  const CLUSTER = 'branch-coverage-cluster'

  beforeEach(() => {
    resetSharedState()
    mockFetchSingleClusterHealth.mockReset()
    mockIsDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    clearClusterFailure(CLUSTER)
    vi.useRealTimers()
  })

  it('getCachedHealth returns null when cluster is undefined', async () => {
    const { result } = renderHook(() => useClusterHealth(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.health).toBeNull()
  })

  it('getCachedHealth returns null when cluster has no nodeCount in cache', async () => {
    // Populate cache with a cluster that has NO nodeCount
    await act(async () => {
      updateClusterCache({
        clusters: [{ name: CLUSTER, context: CLUSTER, server: 'https://x.com' }],
        isLoading: false,
      })
    })
    mockFetchSingleClusterHealth.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    // Without nodeCount, getCachedHealth returns null so no initial data
    expect(result.current.health).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('falls back to getCachedHealth when data is null and no prevHealth (transient)', async () => {
    // Populate cache with cluster that has nodeCount
    await act(async () => {
      updateClusterCache({
        clusters: [{
          name: CLUSTER, context: CLUSTER, server: 'https://x.com',
          nodeCount: 5, podCount: 30, cpuCores: 16, memoryGB: 64, storageGB: 200,
          healthy: true, reachable: true,
        }],
        isLoading: false,
      })
    })
    // Fetch returns null (transient failure), no prevHealth set yet
    mockFetchSingleClusterHealth.mockResolvedValue(null)
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have fallen back to getCachedHealth
    expect(result.current.health).not.toBeNull()
    expect(result.current.health?.nodeCount).toBe(5)
  })

  it('returns demo health for known demo clusters with correct metrics', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth('eks-prod-us-east-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.health?.cluster).toBe('eks-prod-us-east-1')
    expect(result.current.health?.nodeCount).toBe(12)
    expect(result.current.health?.podCount).toBe(156)
    expect(result.current.health?.cpuCores).toBe(96)
  })

  it('demo health includes memoryBytes and storageBytes computed from GB', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth('kind-local'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const health = result.current.health
    expect(health).not.toBeNull()
    // kind-local: memoryGB=8 => memoryBytes=8*1024*1024*1024
    const EXPECTED_MEM_BYTES = 8 * 1024 * 1024 * 1024
    expect(health?.memoryBytes).toBe(EXPECTED_MEM_BYTES)
    // storageGB=50 => storageBytes=50*1024*1024*1024
    const EXPECTED_STORAGE_BYTES = 50 * 1024 * 1024 * 1024
    expect(health?.storageBytes).toBe(EXPECTED_STORAGE_BYTES)
  })

  it('demo health returns empty issues array', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth('gke-staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.health?.issues).toEqual([])
  })

  it('demo health defaults cluster to "default" when cluster is undefined', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useClusterHealth(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.health?.cluster).toBe('default')
  })
})

describe('useClusterHealth — additional edge cases', () => {
  const CLUSTER = 'edge-cluster'

  beforeEach(() => {
    resetSharedState()
    mockFetchSingleClusterHealth.mockReset()
    mockIsDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    clearClusterFailure(CLUSTER)
    vi.useRealTimers()
  })

  it('getCachedHealth returns null when cluster has no nodeCount', async () => {
    // Cluster without nodeCount should not provide cached health
    const clusters: ClusterInfo[] = [
      { name: CLUSTER, context: 'ctx', server: 'https://api.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    // fetchSingleClusterHealth never resolves, so we depend on cache
    mockFetchSingleClusterHealth.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useClusterHealth(CLUSTER))
    // Should still be loading since no cached data available
    expect(result.current.isLoading).toBe(true)
  })

  it('returns demo health for all known demo cluster names', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const knownClusters = [
      'minikube', 'k3s-edge', 'eks-prod-us-east-1', 'gke-staging',
      'aks-dev-westeu', 'openshift-prod', 'oci-oke-phoenix',
    ]

    for (const name of knownClusters) {
      const { result } = renderHook(() => useClusterHealth(name))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.health?.cluster).toBe(name)
      expect(result.current.health?.nodeCount).toBeGreaterThan(0)
    }
  })

  it('uses cached health from cluster cache when fetch returns null', async () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'cached-for-null',
        context: 'ctx',
        server: 'https://cached.example.com',
        healthy: true,
        reachable: true,
        nodeCount: 5,
        podCount: 30,
        cpuCores: 16,
        memoryGB: 64,
        storageGB: 200,
      },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    // First fetch succeeds with real data
    const healthData: ClusterHealth = {
      cluster: 'cached-for-null', healthy: true, reachable: true,
      nodeCount: 5, readyNodes: 5, podCount: 30,
    }
    mockFetchSingleClusterHealth.mockResolvedValueOnce(healthData)
    const { result } = renderHook(() => useClusterHealth('cached-for-null'))
    await waitFor(() => expect(result.current.health?.nodeCount).toBe(5))

    // Second fetch returns null — should keep previous health
    mockFetchSingleClusterHealth.mockResolvedValueOnce(null)
    await act(async () => { await result.current.refetch() })
    expect(result.current.health?.nodeCount).toBe(5)
  })

  it('refetch function is stable identity', () => {
    mockFetchSingleClusterHealth.mockReturnValue(new Promise(() => {}))
    const { result, rerender } = renderHook(() => useClusterHealth(CLUSTER))
    const first = result.current.refetch
    rerender()
    expect(result.current.refetch).toBe(first)
  })
})
