import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClusterInfo, ClusterHealth, MCPStatus } from '../types'



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
import { useMCPStatus, useClusterHealth } from '../clusters'
import {
  clusterSubscribers,
  dataSubscribers,
  uiSubscribers,
  updateClusterCache,
  setInitialFetchStarted,
  sharedWebSocket,
  clearClusterFailure,
  REFRESH_INTERVAL_MS,
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

describe('useMCPStatus — additional branches', () => {
  beforeEach(() => {
    mockAgentFetch.mockReset()
  })

  it('sets status to null when fetch errors, even if previous status existed', async () => {
    // Use fake timers BEFORE rendering so subscribePolling creates fake intervals
    vi.useFakeTimers()
    const initialStatus: MCPStatus = {
      opsClient: { available: true, toolCount: 5 },
      deployClient: { available: true, toolCount: 3 },
    }
    mockAgentFetch.mockResolvedValueOnce(new Response(JSON.stringify(initialStatus), { status: 200 }))
    const { result } = renderHook(() => useMCPStatus())
    await act(async () => { await Promise.resolve() })
    expect(result.current.status).toEqual(initialStatus)

    // Subsequent poll error — hang after first rejection to prevent cascade
    // from consecutiveFailures in useEffect deps
    mockAgentFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation(() => new Promise(() => {}))
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    await act(async () => { await Promise.resolve() })
    expect(result.current.error).toBe('MCP bridge not available')
    expect(result.current.status).toBeNull()
    vi.useRealTimers()
  })

  it('clears error when fetch succeeds after failure', async () => {
    // Use fake timers BEFORE rendering so subscribePolling creates fake intervals
    vi.useFakeTimers()
    // First call fails, subsequent hang to prevent cascade
    mockAgentFetch
      .mockRejectedValueOnce(new Error('err'))
      .mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useMCPStatus())
    await act(async () => { await Promise.resolve() })
    expect(result.current.error).toBe('MCP bridge not available')

    // Now succeed — replace mock with success response
    const good: MCPStatus = {
      opsClient: { available: true, toolCount: 1 },
      deployClient: { available: false, toolCount: 0 },
    }
    mockAgentFetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(good), { status: 200 })))
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 4) })
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
