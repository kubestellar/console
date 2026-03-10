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
})
