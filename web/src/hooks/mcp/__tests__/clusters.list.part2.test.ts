import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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

describe('useClusters — deduplication integration', () => {
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
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockConnectSharedWebSocket.mockClear()
    mockTriggerAggressiveDetection.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('triggers aggressive detection when switching FROM demo to live mode', async () => {
    // Start in demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    // Switch to live mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    await act(async () => { rerender() })

    expect(mockTriggerAggressiveDetection).toHaveBeenCalledTimes(1)
    // fullFetchClusters should be called after aggressive detection resolves
    await waitFor(() => expect(mockFullFetchClusters).toHaveBeenCalled())
  })

  it('calls fullFetchClusters directly when switching TO demo mode', async () => {
    // Start in live mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()
    mockTriggerAggressiveDetection.mockClear()

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    await act(async () => { rerender() })

    // Should NOT trigger aggressive detection for demo mode
    expect(mockTriggerAggressiveDetection).not.toHaveBeenCalled()
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
  })

  it('does not re-fetch if demo mode value stays the same across rerenders', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { rerender } = renderHook(() => useClusters())
    mockFullFetchClusters.mockClear()

    // Rerender with same demo mode value
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    await act(async () => { rerender() })

    // Should not trigger a re-fetch since isDemoMode didn't change
    expect(mockFullFetchClusters).not.toHaveBeenCalled()
  })
})

describe('useClusters — refetch', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    vi.useRealTimers()
    resetSharedState()
    mockFullFetchClusters.mockClear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

