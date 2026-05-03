import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth } from '../types'
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
import { useClusters } from '../clusters'
import {
  clusterSubscribers,
  dataSubscribers,
  uiSubscribers,
  updateClusterCache,
  setInitialFetchStarted,
  sharedWebSocket,
  CLUSTER_POLL_INTERVAL_MS,
} from '../shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


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
    // After the data/UI split (#7865), each useClusters instance registers
    // one data subscriber AND one UI subscriber, so the per-slice count
    // equals the number of mounted hooks.
    expect(dataSubscribers.size).toBe(0)
    expect(uiSubscribers.size).toBe(0)

    const { unmount: u1 } = renderHook(() => useClusters())
    const { unmount: u2 } = renderHook(() => useClusters())
    expect(dataSubscribers.size).toBe(2)
    expect(uiSubscribers.size).toBe(2)

    u1()
    expect(dataSubscribers.size).toBe(1)
    expect(uiSubscribers.size).toBe(1)

    u2()
    expect(dataSubscribers.size).toBe(0)
    expect(uiSubscribers.size).toBe(0)
  })
})

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
