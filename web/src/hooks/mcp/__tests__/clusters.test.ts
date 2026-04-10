import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth, MCPStatus } from '../types'
import { STORAGE_KEY_TOKEN } from '../../../lib/constants'

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
    clusterCacheRef: m.clusterCacheRef,
    // Stubbed to prevent real network calls
    fetchSingleClusterHealth: mockFetchSingleClusterHealth,
    fullFetchClusters: mockFullFetchClusters,
    connectSharedWebSocket: mockConnectSharedWebSocket,
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
import { useMCPStatus, useClusters, useClusterHealth } from '../clusters'
import {
  clusterSubscribers,
  updateClusterCache,
  setInitialFetchStarted,
  sharedWebSocket,
  deduplicateClustersByServer,
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
  REFRESH_INTERVAL_MS,
  CLUSTER_POLL_INTERVAL_MS,
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
}

// ===========================================================================
// Pure utilities – deduplicateClustersByServer
// ===========================================================================
describe('deduplicateClustersByServer', () => {
  it('keeps all clusters when every server URL is unique', () => {
    const clusters: ClusterInfo[] = [
      { name: 'a', context: 'a', server: 'https://a.example.com' },
      { name: 'b', context: 'b', server: 'https://b.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(2)
    const names = result.map((c) => c.name)
    expect(names).toContain('a')
    expect(names).toContain('b')
  })

  it('selects the preferred (friendly) primary cluster among duplicates', () => {
    const longName = 'default/api-cluster.example.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: longName, context: longName, server: 'https://api.cluster.example.com:6443' },
      { name: 'my-cluster', context: 'my-cluster', server: 'https://api.cluster.example.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-cluster')
  })

  it('preserves aliases for duplicate server entries', () => {
    const longName = 'default/api-cluster.example.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: longName, context: 'ctx-long', server: 'https://api.cluster.example.com:6443' },
      { name: 'my-cluster', context: 'my-cluster', server: 'https://api.cluster.example.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toBeDefined()
    expect(result[0].aliases).toContain(longName)
  })

  it('includes clusters without a server URL without deduplicating them', () => {
    const clusters: ClusterInfo[] = [
      { name: 'no-server-a', context: 'no-server-a' },
      { name: 'no-server-b', context: 'no-server-b' },
      { name: 'has-server', context: 'has-server', server: 'https://srv.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(3)
  })
})

// ===========================================================================
// Pure utilities – shouldMarkOffline / recordClusterFailure / clearClusterFailure
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

// ===========================================================================
// useMCPStatus
// ===========================================================================
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

// ===========================================================================
// useClusters
// ===========================================================================
describe('useClusters', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('returns initial state from shared cache', async () => {
    const testClusters: ClusterInfo[] = [
      { name: 'prod', context: 'prod', server: 'https://prod.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters: testClusters, isLoading: false })
    })
    const { result } = renderHook(() => useClusters())
    expect(result.current.clusters).toHaveLength(1)
    expect(result.current.clusters[0].name).toBe('prod')
  })

  it('returns loading: true by default when no cached cluster data exists', () => {
    // Cache was reset to isLoading: true in beforeEach
    const { result } = renderHook(() => useClusters())
    expect(result.current.isLoading).toBe(true)
  })

  it('fetches clusters on first load', () => {
    renderHook(() => useClusters())
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('shares cache updates across multiple hook instances', async () => {
    const { result: result1 } = renderHook(() => useClusters())
    const { result: result2 } = renderHook(() => useClusters())

    const testClusters: ClusterInfo[] = [
      { name: 'cluster1', context: 'cluster1', server: 'https://c1.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters: testClusters, isLoading: false })
    })

    expect(result1.current.clusters).toHaveLength(1)
    expect(result2.current.clusters).toHaveLength(1)
    expect(result1.current.clusters[0].name).toBe('cluster1')
    expect(result2.current.clusters[0].name).toBe('cluster1')
  })

  it('unsubscribes on unmount so the unmounted hook no longer receives updates', async () => {
    const { result, unmount } = renderHook(() => useClusters())
    const namesBefore = result.current.clusters.map((c) => c.name)

    unmount()

    await act(async () => {
      updateClusterCache({
        clusters: [{ name: 'after-unmount', context: 'after-unmount' }],
        isLoading: false,
      })
    })

    // The snapshot taken before unmount should NOT include the post-unmount update
    expect(namesBefore).not.toContain('after-unmount')
    // The live result ref must also not have updated after unmount
    expect(result.current.clusters.map((c) => c.name)).not.toContain('after-unmount')
  })

  it('re-fetches when demo mode changes', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear() // ignore initial fetch

    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    await act(async () => {
      rerender()
    })

    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('polls every CLUSTER_POLL_INTERVAL_MS', async () => {
    vi.useFakeTimers()
    mockFullFetchClusters.mockClear()
    renderHook(() => useClusters())
    // Initial fetch on mount
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
    // Advance one poll interval then flush microtasks
    act(() => { vi.advanceTimersByTime(CLUSTER_POLL_INTERVAL_MS) })
    await act(() => Promise.resolve())
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

// ===========================================================================
// Shared cache / pub-sub lifecycle
// ===========================================================================
describe('Shared cache / pub-sub', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('two concurrent hook instances receive the same cache update', async () => {
    const { result: r1 } = renderHook(() => useClusters())
    const { result: r2 } = renderHook(() => useClusters())

    const updated: ClusterInfo[] = [
      { name: 'shared-cluster', context: 'shared', server: 'https://shared.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters: updated, isLoading: false })
    })

    expect(r1.current.clusters[0].name).toBe('shared-cluster')
    expect(r2.current.clusters[0].name).toBe('shared-cluster')
  })

  it('removing one hook does not affect remaining subscribers', async () => {
    const { result: r1, unmount: unmount1 } = renderHook(() => useClusters())
    const { result: r2 } = renderHook(() => useClusters())

    unmount1() // r1 unsubscribes

    const updated: ClusterInfo[] = [{ name: 'only-r2', context: 'only-r2' }]
    await act(async () => {
      updateClusterCache({ clusters: updated, isLoading: false })
    })

    // r2 must have received the update
    expect(r2.current.clusters[0].name).toBe('only-r2')
    // r1's last-rendered value must not contain the post-unmount cluster
    expect(r1.current.clusters.map((c) => c.name)).not.toContain('only-r2')
  })

  it('subscriber count matches mounted hook instances', () => {
    expect(clusterSubscribers.size).toBe(0)

    const { unmount: u1 } = renderHook(() => useClusters())
    const { unmount: u2 } = renderHook(() => useClusters())
    expect(clusterSubscribers.size).toBe(2)

    u1()
    expect(clusterSubscribers.size).toBe(1)

    u2()
    expect(clusterSubscribers.size).toBe(0)
  })
})

// ===========================================================================
// Shared WebSocket singleton
// ===========================================================================
describe('Shared WebSocket singleton', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('only one connection is attempted for multiple hook instances', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
    // jsdom default hostname is 'localhost' – satisfies the isLocalhost check
    renderHook(() => useClusters()) // sets initialFetchStarted → true, calls connectSharedWebSocket
    renderHook(() => useClusters()) // initialFetchStarted is now true → block skipped
    renderHook(() => useClusters())

    expect(mockConnectSharedWebSocket).toHaveBeenCalledTimes(1)
  })

  it('connection is not attempted when not on localhost', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')
    // Stub location so hostname is not localhost/127.0.0.1
    vi.stubGlobal('location', { hostname: 'production.example.com', protocol: 'http:' })

    renderHook(() => useClusters())

    expect(mockConnectSharedWebSocket).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('connection is not attempted without an auth token', () => {
    // No token in localStorage
    renderHook(() => useClusters())
    expect(mockConnectSharedWebSocket).not.toHaveBeenCalled()
  })

  it('unmounting one hook instance does not disrupt remaining subscribers', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'test-token')

    const { unmount: u1 } = renderHook(() => useClusters())
    const { result: r2 } = renderHook(() => useClusters())

    u1()

    const updated: ClusterInfo[] = [{ name: 'persists', context: 'persists' }]
    await act(async () => {
      updateClusterCache({ clusters: updated, isLoading: false })
    })

    expect(r2.current.clusters[0].name).toBe('persists')
  })
})

// ===========================================================================
// useClusterHealth
// ===========================================================================
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

// ===========================================================================
// deduplicateClustersByServer — additional regression cases
// ===========================================================================
describe('deduplicateClustersByServer — advanced', () => {
  it('handles null/undefined clusters array gracefully', () => {
    // deduplicateClustersByServer guards with (clusters || [])
    const result = deduplicateClustersByServer(null as unknown as ClusterInfo[])
    expect(result).toEqual([])
  })

  it('handles empty clusters array', () => {
    const result = deduplicateClustersByServer([])
    expect(result).toEqual([])
  })

  it('merges best metrics from multiple clusters sharing same server', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'context-a',
        context: 'ctx-a',
        server: 'https://api.shared.example.com:6443',
        cpuCores: 16,
        memoryGB: 64,
        nodeCount: 3,
        podCount: 20,
      },
      {
        name: 'default/api-shared.example.com:6443/kube:admin',
        context: 'ctx-b',
        server: 'https://api.shared.example.com:6443',
        cpuCores: undefined,
        nodeCount: undefined,
        podCount: 50, // higher pod count
        cpuRequestsCores: 8,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    // Should pick 'context-a' as primary (shorter, user-friendly)
    expect(result[0].name).toBe('context-a')
    // Primary's podCount wins (#6112): we no longer take Math.max, because
    // that caused scale-downs to show stale over-counts.
    expect(result[0].podCount).toBe(20)
    // Should keep cpuCores from the cluster that had them
    expect(result[0].cpuCores).toBe(16)
    // Should pick up cpuRequestsCores from the other cluster
    expect(result[0].cpuRequestsCores).toBe(8)
  })

  it('promotes healthy/reachable status from any duplicate', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'unhealthy-ctx',
        context: 'unhealthy-ctx',
        server: 'https://api.test.com',
        healthy: false,
        reachable: false,
      },
      {
        name: 'healthy-ctx',
        context: 'healthy-ctx',
        server: 'https://api.test.com',
        healthy: true,
        reachable: true,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    // If ANY duplicate is healthy/reachable, the merged result should be too
    expect(result[0].healthy).toBe(true)
    expect(result[0].reachable).toBe(true)
  })

  it('prefers isCurrent context as primary when names are similar length', () => {
    const clusters: ClusterInfo[] = [
      { name: 'cluster-a', context: 'cluster-a', server: 'https://same.example.com', isCurrent: false },
      { name: 'cluster-b', context: 'cluster-b', server: 'https://same.example.com', isCurrent: true },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('cluster-b')
    expect(result[0].aliases).toContain('cluster-a')
  })

  it('prefers cluster with more namespaces', () => {
    const clusters: ClusterInfo[] = [
      { name: 'few-ns', context: 'few-ns', server: 'https://ns-test.example.com', namespaces: ['default'] },
      { name: 'many-ns', context: 'many-ns', server: 'https://ns-test.example.com', namespaces: ['default', 'kube-system', 'monitoring', 'apps'] },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('many-ns')
  })

  it('sets empty aliases array for singleton server groups', () => {
    const clusters: ClusterInfo[] = [
      { name: 'solo', context: 'solo', server: 'https://solo.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('detects OpenShift-style auto-generated names as non-primary', () => {
    const autoGenName = 'default/api-my-cluster.h3s2.p1.openshiftapps.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: autoGenName, context: autoGenName, server: 'https://api.my-cluster.h3s2.p1.openshiftapps.com:6443' },
      { name: 'my-ocp-cluster', context: 'my-ocp-cluster', server: 'https://api.my-cluster.h3s2.p1.openshiftapps.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-ocp-cluster')
    expect(result[0].aliases).toContain(autoGenName)
  })
})

// ===========================================================================
// shareMetricsBetweenSameServerClusters
// ===========================================================================
describe('shareMetricsBetweenSameServerClusters', () => {
  // Import the real implementation through the mock
  let shareMetricsFn: typeof import('../shared').shareMetricsBetweenSameServerClusters

  beforeEach(async () => {
    const mod = await import('../shared')
    shareMetricsFn = mod.shareMetricsBetweenSameServerClusters
  })

  it('copies metrics from a rich cluster to a bare cluster sharing the same server', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'rich-ctx',
        context: 'rich-ctx',
        server: 'https://shared-srv.example.com',
        nodeCount: 5,
        podCount: 40,
        cpuCores: 32,
        memoryGB: 128,
        storageGB: 500,
        cpuRequestsCores: 12,
      },
      {
        name: 'bare-ctx',
        context: 'bare-ctx',
        server: 'https://shared-srv.example.com',
        // No metrics at all
      },
    ]
    const result = shareMetricsFn(clusters)
    const bare = result.find(c => c.name === 'bare-ctx')!
    expect(bare.nodeCount).toBe(5)
    expect(bare.podCount).toBe(40)
    expect(bare.cpuCores).toBe(32)
    expect(bare.cpuRequestsCores).toBe(12)
  })

  it('does not overwrite existing metrics on target cluster', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'source',
        context: 'source',
        server: 'https://same.example.com',
        nodeCount: 10,
        podCount: 100,
        cpuCores: 64,
      },
      {
        name: 'target',
        context: 'target',
        server: 'https://same.example.com',
        nodeCount: 3, // already has its own nodeCount
        podCount: 25,
        cpuCores: 16,
      },
    ]
    const result = shareMetricsFn(clusters)
    const target = result.find(c => c.name === 'target')!
    // Should keep its own values since it already has metrics
    expect(target.cpuCores).toBe(16)
  })

  it('handles clusters without server URLs (no sharing)', () => {
    const clusters: ClusterInfo[] = [
      { name: 'no-server-1', context: 'ctx-1', nodeCount: 5 },
      { name: 'no-server-2', context: 'ctx-2' },
    ]
    const result = shareMetricsFn(clusters)
    // Clusters without server can't share metrics
    expect(result.find(c => c.name === 'no-server-2')?.nodeCount).toBeUndefined()
  })

  it('throws on null input (second-pass .map lacks guard)', () => {
    // Note: the for...of loop guards with (clusters || []) but the return
    // clusters.map() does not, so null input throws. This test documents the
    // current behavior to prevent silent regressions if it gets fixed.
    expect(() => shareMetricsFn(null as unknown as ClusterInfo[])).toThrow()
  })

  it('prefers source cluster with higher metric score (nodes > capacity > requests)', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'has-requests-only',
        context: 'ctx-req',
        server: 'https://score-test.example.com',
        cpuRequestsCores: 4,
        // score = 1 (requests only)
      },
      {
        name: 'has-nodes-and-capacity',
        context: 'ctx-full',
        server: 'https://score-test.example.com',
        nodeCount: 3,
        cpuCores: 16,
        // score = 4 + 2 = 6
      },
      {
        name: 'bare-clone',
        context: 'ctx-bare',
        server: 'https://score-test.example.com',
        // No metrics
      },
    ]
    const result = shareMetricsFn(clusters)
    const bare = result.find(c => c.name === 'bare-clone')!
    // The best source (score=6) should be selected, giving nodeCount=3, cpuCores=16
    expect(bare.nodeCount).toBe(3)
    expect(bare.cpuCores).toBe(16)
  })
})

// ===========================================================================
// useClusters — deduplication integration
// ===========================================================================
describe('useClusters — deduplication integration', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('deduplicatedClusters collapses same-server contexts', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'friendly-name', context: 'friendly', server: 'https://api.prod.example.com:6443' },
      { name: 'default/api-prod.example.com:6443/admin', context: 'long-ctx', server: 'https://api.prod.example.com:6443' },
      { name: 'unique-cluster', context: 'unique', server: 'https://unique.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    const { result } = renderHook(() => useClusters())
    // Raw clusters should include all 3
    expect(result.current.clusters).toHaveLength(3)
    // Deduplicated should collapse the two same-server clusters into 1
    expect(result.current.deduplicatedClusters).toHaveLength(2)
    const names = result.current.deduplicatedClusters.map(c => c.name)
    expect(names).toContain('friendly-name')
    expect(names).toContain('unique-cluster')
  })

  it('deduplicatedClusters updates when cache changes', async () => {
    const { result } = renderHook(() => useClusters())
    expect(result.current.deduplicatedClusters).toHaveLength(0)

    await act(async () => {
      updateClusterCache({
        clusters: [
          { name: 'c1', context: 'c1', server: 'https://s1.example.com' },
          { name: 'c2', context: 'c2', server: 'https://s1.example.com' },
        ],
        isLoading: false,
      })
    })

    // Two clusters same server -> 1 deduplicated
    expect(result.current.deduplicatedClusters).toHaveLength(1)
  })
})

// ===========================================================================
// useClusters — demo mode transition
// ===========================================================================
describe('useClusters — demo mode transitions', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockTriggerAggressiveDetection.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('triggers aggressive detection when switching FROM demo to live mode', async () => {
    // Start in demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    // Switch to live mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    await act(async () => { rerender() })

    expect(mockTriggerAggressiveDetection).toHaveBeenCalledTimes(1)
    // fullFetchClusters should be called after aggressive detection resolves
    await waitFor(() => expect(mockFullFetchClusters).toHaveBeenCalled())
  })

  it('calls fullFetchClusters directly when switching TO demo mode', async () => {
    // Start in live mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    await act(async () => { rerender() })

    // Should NOT trigger aggressive detection for demo mode
    expect(mockTriggerAggressiveDetection).not.toHaveBeenCalled()
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('does not re-fetch if demo mode value stays the same across rerenders', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    // Rerender with same demo mode value
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    await act(async () => { rerender() })

    // Should not trigger a re-fetch since isDemoMode didn't change
    expect(mockFullFetchClusters).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// useClusters — refetch callback
// ===========================================================================
describe('useClusters — refetch', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('refetch() calls fullFetchClusters', () => {
    const { result } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    act(() => { result.current.refetch() })
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('refetch callback identity is stable across renders', async () => {
    const { result, rerender } = renderHook(() => useClusters())
    const refetch1 = result.current.refetch

    await act(async () => {
      updateClusterCache({
        clusters: [{ name: 'new', context: 'new' }],
        isLoading: false,
      })
    })
    rerender()

    const refetch2 = result.current.refetch
    expect(refetch1).toBe(refetch2)
  })
})

// ===========================================================================
// useClusters — cache state fields
// ===========================================================================
describe('useClusters — cache state fields', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('exposes consecutiveFailures and isFailed from cache', async () => {
    const FAILURE_COUNT = 3
    await act(async () => {
      updateClusterCache({
        clusters: [],
        isLoading: false,
        consecutiveFailures: FAILURE_COUNT,
        isFailed: true,
      })
    })

    const { result } = renderHook(() => useClusters())
    expect(result.current.consecutiveFailures).toBe(FAILURE_COUNT)
    expect(result.current.isFailed).toBe(true)
  })

  it('exposes lastUpdated and lastRefresh timestamps', async () => {
    const now = new Date()
    await act(async () => {
      updateClusterCache({
        clusters: [{ name: 'ts-test', context: 'ts-test' }],
        isLoading: false,
        lastUpdated: now,
        lastRefresh: now,
      })
    })

    const { result } = renderHook(() => useClusters())
    expect(result.current.lastUpdated).toEqual(now)
    expect(result.current.lastRefresh).toEqual(now)
  })

  it('exposes isRefreshing state', async () => {
    await act(async () => {
      updateClusterCache({
        clusters: [{ name: 'refreshing', context: 'refreshing' }],
        isLoading: false,
        isRefreshing: true,
      })
    })

    const { result } = renderHook(() => useClusters())
    expect(result.current.isRefreshing).toBe(true)
  })

  it('exposes error from cache', async () => {
    const ERROR_MSG = 'Failed to connect to agent'
    await act(async () => {
      updateClusterCache({
        clusters: [],
        isLoading: false,
        error: ERROR_MSG,
      })
    })

    const { result } = renderHook(() => useClusters())
    expect(result.current.error).toBe(ERROR_MSG)
  })
})

// ===========================================================================
// Additional branch coverage — clusters.ts
// ===========================================================================

describe('useClusters — deduplication and metric sharing', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('deduplicatedClusters removes duplicates sharing the same server URL', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'short-name', context: 'short-name', server: 'https://api.example.com:6443' },
      { name: 'default/api.example.com:6443/user', context: 'long-ctx', server: 'https://api.example.com:6443' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })
    const { result } = renderHook(() => useClusters())
    expect(result.current.deduplicatedClusters).toHaveLength(1)
    expect(result.current.deduplicatedClusters[0].name).toBe('short-name')
  })

  it('deduplicatedClusters retains clusters with different servers', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'alpha', context: 'alpha', server: 'https://alpha.example.com' },
      { name: 'beta', context: 'beta', server: 'https://beta.example.com' },
      { name: 'gamma', context: 'gamma', server: 'https://gamma.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })
    const { result } = renderHook(() => useClusters())
    expect(result.current.deduplicatedClusters).toHaveLength(3)
  })

  it('deduplicatedClusters shares metrics from long-name to short-name cluster', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'short', context: 'short', server: 'https://same.server.com', cpuCores: undefined, memoryGB: undefined },
      { name: 'default/long-context-path/user', context: 'long', server: 'https://same.server.com', cpuCores: 32, memoryGB: 128 },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })
    const { result } = renderHook(() => useClusters())
    // After metric sharing the deduplicated primary should have metrics
    const deduped = result.current.deduplicatedClusters
    expect(deduped).toHaveLength(1)
    expect(deduped[0].cpuCores).toBe(32)
    expect(deduped[0].memoryGB).toBe(128)
  })

  it('refetch() is a stable function reference', () => {
    const { result, rerender } = renderHook(() => useClusters())
    const firstRef = result.current.refetch
    rerender()
    expect(result.current.refetch).toBe(firstRef)
  })

  it('exposes consecutiveFailures and isFailed from cache', async () => {
    const FAILURE_COUNT = 4
    await act(async () => {
      updateClusterCache({
        clusters: [],
        isLoading: false,
        consecutiveFailures: FAILURE_COUNT,
        isFailed: true,
      })
    })
    const { result } = renderHook(() => useClusters())
    expect(result.current.consecutiveFailures).toBe(FAILURE_COUNT)
    expect(result.current.isFailed).toBe(true)
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

describe('useClusters — demo mode transition', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockTriggerAggressiveDetection.mockClear()
  })

  it('calls triggerAggressiveDetection when switching FROM demo to live', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    await act(async () => {
      rerender()
    })

    expect(mockTriggerAggressiveDetection).toHaveBeenCalledTimes(1)
  })

  it('calls fullFetchClusters directly when switching TO demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    await act(async () => {
      rerender()
    })

    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// useClusters — refetch callback
// ===========================================================================
describe('useClusters — refetch callback', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('refetch() triggers fullFetchClusters', async () => {
    const { result } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    await act(async () => {
      result.current.refetch()
    })

    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('refetch function identity is stable across renders', () => {
    const { result, rerender } = renderHook(() => useClusters())
    const first = result.current.refetch
    rerender()
    expect(result.current.refetch).toBe(first)
  })
})

// ===========================================================================
// useClusters — deduplicatedClusters
// ===========================================================================
describe('useClusters — deduplicatedClusters', () => {
  beforeEach(() => {
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  it('returns deduplicated clusters array', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'short-name', context: 'short-ctx', server: 'https://api.example.com:6443' },
      { name: 'default/api.example.com:6443/admin', context: 'long-ctx', server: 'https://api.example.com:6443' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    const { result } = renderHook(() => useClusters())
    // Should return only one cluster since they share the same server
    expect(result.current.deduplicatedClusters).toHaveLength(1)
    expect(result.current.deduplicatedClusters[0].name).toBe('short-name')
  })

  it('returns all clusters when servers are unique', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'a', context: 'a', server: 'https://a.example.com' },
      { name: 'b', context: 'b', server: 'https://b.example.com' },
      { name: 'c', context: 'c', server: 'https://c.example.com' },
    ]
    await act(async () => {
      updateClusterCache({ clusters, isLoading: false })
    })

    const { result } = renderHook(() => useClusters())
    expect(result.current.deduplicatedClusters).toHaveLength(3)
  })
})

// ===========================================================================
// useClusterHealth — additional edge cases
// ===========================================================================
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
