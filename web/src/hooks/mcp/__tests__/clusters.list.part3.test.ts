import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth } from '../types'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockFullFetchClusters = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockConnectSharedWebSocket = vi.hoisted(() => vi.fn())
const mockUseDemoMode = vi.hoisted(() => vi.fn().mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
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

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: vi.fn(() => false),
}
))

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

describe('useClusters — deduplication and metric sharing', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockTriggerAggressiveDetection.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls triggerAggressiveDetection when switching FROM demo to live', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    await act(async () => {
      rerender()
    })

    expect(mockTriggerAggressiveDetection).toHaveBeenCalledTimes(1)
  })

  it('calls fullFetchClusters directly when switching TO demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    await act(async () => {
      rerender()
    })

    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })
})

describe('useClusters — refetch callback', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
