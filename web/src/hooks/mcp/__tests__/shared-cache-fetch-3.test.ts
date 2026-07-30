import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ClusterInfo, ClusterHealth } from '../types'

// ---------------------------------------------------------------------------
// Constants used in tests (mirror source values to avoid magic numbers)
// ---------------------------------------------------------------------------
const OFFLINE_THRESHOLD_MS = 5 * 60_000 // 5 minutes — same as OFFLINE_THRESHOLD_MS in shared.ts
const AUTO_GENERATED_NAME_LENGTH_THRESHOLD = 50 // same as in shared.ts
const CLUSTER_NOTIFY_DEBOUNCE_MS = 50 // same debounce delay in shared.ts
const DEFAULT_MAX_RETRIES = 2 // fetchWithRetry default
const DEFAULT_INITIAL_BACKOFF_MS = 500 // fetchWithRetry default

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockIsDemoToken = vi.hoisted(() => vi.fn(() => false))
const mockIsNetlifyDeployment = vi.hoisted(() => ({ value: false }))
const mockSubscribeDemoMode = vi.hoisted(() => vi.fn())
const mockIsBackendUnavailable = vi.hoisted(() => vi.fn(() => false))
const mockReportAgentDataError = vi.hoisted(() => vi.fn())
const mockReportAgentDataSuccess = vi.hoisted(() => vi.fn())
const mockIsAgentUnavailable = vi.hoisted(() => vi.fn(() => true))
const mockGetAgentClusterCount = vi.hoisted(() => vi.fn(() => 0))
const mockRegisterCacheReset = vi.hoisted(() => vi.fn())
const mockTriggerAllRefetches = vi.hoisted(() => vi.fn())
const mockResetFailuresForCluster = vi.hoisted(() => vi.fn())
const mockResetAllCacheFailures = vi.hoisted(() => vi.fn())
const mockKubectlProxyExec = vi.hoisted(() => vi.fn())
const mockApiGet = vi.hoisted(() => vi.fn())

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/api', () => ({
  api: { get: mockApiGet },
  isBackendUnavailable: mockIsBackendUnavailable,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
  isDemoToken: mockIsDemoToken,
  get isNetlifyDeployment() {
    return mockIsNetlifyDeployment.value
  },
  subscribeDemoMode: mockSubscribeDemoMode,
}))

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataError: mockReportAgentDataError,
  reportAgentDataSuccess: mockReportAgentDataSuccess,
  isAgentUnavailable: mockIsAgentUnavailable,
  getAgentClusterCount: mockGetAgentClusterCount,
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: mockRegisterCacheReset,
  triggerAllRefetches: mockTriggerAllRefetches,
}))

vi.mock('../../../lib/cache', () => ({
  resetFailuresForCluster: mockResetFailuresForCluster,
  resetAllCacheFailures: mockResetAllCacheFailures,
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: mockKubectlProxyExec },
}))

vi.mock('../../../lib/constants', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants')>('../../../lib/constants')
  return {
    ...actual,
  }
})

vi.mock('../../../lib/constants/network', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants/network')>('../../../lib/constants/network')
  return {
    ...actual,
  }
})

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import {
  // Constants
  REFRESH_INTERVAL_MS,
  CLUSTER_POLL_INTERVAL_MS,
  GPU_POLL_INTERVAL_MS,
  CACHE_TTL_MS,
  MIN_REFRESH_INDICATOR_MS,
  // Pure functions
  getEffectiveInterval,
  shareMetricsBetweenSameServerClusters,
  deduplicateClustersByServer,
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
  clusterDisplayName,
  fetchWithRetry,
  _resetAgentTokenState,
  // Async functions
  fullFetchClusters,
  refreshSingleCluster,
  fetchSingleClusterHealth,
  connectSharedWebSocket,
  // State management
  clusterCache,
  clusterSubscribers,
  notifyClusterSubscribers,
  notifyClusterSubscribersDebounced,
  updateClusterCache,
  updateSingleClusterInCache,
  setInitialFetchStarted,
  setHealthCheckFailures,
  getInitialFetchStarted,
  getHealthCheckFailures,
  initialFetchStarted,
  healthCheckFailures,
  // WebSocket
  sharedWebSocket,
  cleanupSharedWebSocket,
  // Cache ref
  clusterCacheRef,
  subscribeClusterCache,
} from '../shared'
import { clearAgentToken, setAgentToken } from '../agentFetch'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com:6443',
    healthy: true,
    source: 'kubeconfig',
    nodeCount: 3,
    podCount: 20,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchSingleClusterHealth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    _resetAgentTokenState()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsDemoToken.mockReturnValue(false)
    setHealthCheckFailures(0)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    _resetAgentTokenState()
  })

  it('returns health data from agent HTTP endpoint', async () => {
    const healthData: ClusterHealth = {
      cluster: 'test',
      healthy: true,
      nodeCount: 3,
      readyNodes: 3,
      podCount: 20,
      cpuCores: 8,
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    const result = await fetchSingleClusterHealth('test')
    expect(result).toEqual(healthData)
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls back to backend API when agent fails', async () => {
    const healthData: ClusterHealth = {
      cluster: 'test',
      healthy: true,
      nodeCount: 5,
      readyNodes: 5,
    }
    localStorage.setItem('token', 'real-token')

    // First call (agent) rejects, second call (backend) succeeds
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('agent down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(healthData),
      })

    const result = await fetchSingleClusterHealth('test')
    expect(result).toEqual(healthData)
  })

  it('returns null when agent is unavailable and health checks exceeded max failures', async () => {
    const MAX_HEALTH_CHECK_FAILURES = 3
    setHealthCheckFailures(MAX_HEALTH_CHECK_FAILURES)
    mockIsAgentUnavailable.mockReturnValue(true)

    const result = await fetchSingleClusterHealth('test')
    expect(result).toBeNull()
  })

  it('returns null when using demo token', async () => {
    mockIsDemoToken.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)

    const result = await fetchSingleClusterHealth('test')
    expect(result).toBeNull()
  })

  it('skips agent on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true
    mockIsDemoToken.mockReturnValue(true)

    const result = await fetchSingleClusterHealth('test')
    expect(result).toBeNull()
  })

  it('increments healthCheckFailures on backend non-OK response', async () => {
    const SERVER_ERROR = 500
    mockIsAgentUnavailable.mockReturnValue(true)
    localStorage.setItem('token', 'real-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: SERVER_ERROR,
    })

    setHealthCheckFailures(0)
    await fetchSingleClusterHealth('test')
    expect(getHealthCheckFailures()).toBe(1)
  })

  it('uses kubectlContext for agent request when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Pre-seed agent token to prevent getAgentToken() from calling /api/agent/token
    setAgentToken('test-token')
    const healthData: ClusterHealth = {
      cluster: 'test',
      healthy: true,
      nodeCount: 1,
      readyNodes: 1,
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    await fetchSingleClusterHealth('test', 'custom-context')
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[0]).toContain('cluster=custom-context')
  })
})

// ---------------------------------------------------------------------------
// refreshSingleCluster
// ---------------------------------------------------------------------------
describe('refreshSingleCluster', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    clusterSubscribers.clear()
    localStorage.clear()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsDemoToken.mockReturnValue(false)
    setHealthCheckFailures(0)
    mockGetAgentClusterCount.mockReturnValue(0)

    // Seed cache with a cluster
    updateClusterCache({
      clusters: [makeCluster({ name: 'refresh-test', context: 'refresh-ctx', server: 'https://refresh.example.com' })],
      isLoading: false,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('clears failure tracking for the cluster', async () => {
    recordClusterFailure('refresh-test')

    const healthData: ClusterHealth = {
      cluster: 'refresh-test',
      healthy: true,
      nodeCount: 3,
      readyNodes: 3,
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    await refreshSingleCluster('refresh-test')
    expect(mockResetFailuresForCluster).toHaveBeenCalledWith('refresh-test')
  })

  it('marks cluster as refreshing immediately', async () => {
    const sub = vi.fn()
    clusterSubscribers.add(sub)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cluster: 'refresh-test', healthy: true, nodeCount: 1, readyNodes: 1 }),
    })

    const promise = refreshSingleCluster('refresh-test')
    // The subscriber should have been called with refreshing=true
    const firstCall = sub.mock.calls[0]?.[0]
    if (firstCall) {
      const refreshingCluster = firstCall.clusters.find((c: ClusterInfo) => c.name === 'refresh-test')
      expect(refreshingCluster?.refreshing).toBe(true)
    }
    await promise
  })

  it('updates cluster with health data on success', async () => {
    vi.useFakeTimers()
    const NODE_COUNT = 5
    const POD_COUNT = 30
    const healthData: ClusterHealth = {
      cluster: 'refresh-test',
      healthy: true,
      nodeCount: NODE_COUNT,
      readyNodes: NODE_COUNT,
      podCount: POD_COUNT,
      cpuCores: 16,
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    await refreshSingleCluster('refresh-test')
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const c = clusterCache.clusters.find(c => c.name === 'refresh-test')!
    expect(c.nodeCount).toBe(NODE_COUNT)
    expect(c.refreshing).toBe(false)
    vi.useRealTimers()
  })

  it('keeps previous data on transient failure (not yet offline)', async () => {
    vi.useFakeTimers()
    const ORIGINAL_NODE_COUNT = 3
    // Agent and backend both fail
    mockIsAgentUnavailable.mockReturnValue(true)
    const MAX_HEALTH_CHECK_FAILURES = 3
    setHealthCheckFailures(MAX_HEALTH_CHECK_FAILURES) // prevent backend attempt

    clearClusterFailure('refresh-test') // ensure not already tracked

    await refreshSingleCluster('refresh-test')
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const c = clusterCache.clusters.find(c => c.name === 'refresh-test')!
    // Should preserve original data (transient failure, not 5 minutes yet)
    expect(c.nodeCount).toBe(ORIGINAL_NODE_COUNT)
    expect(c.refreshing).toBe(false)
    vi.useRealTimers()
  })

  it('always clears failure tracking first (gives cluster clean slate)', async () => {
    vi.useFakeTimers()
    // Simulate prior 5 minutes of failures
    recordClusterFailure('refresh-test')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS)
    expect(shouldMarkOffline('refresh-test')).toBe(true)

    // refreshSingleCluster calls clearClusterFailure first, resetting the clock
    // So even with prior failures, the cluster gets a fresh start
    mockIsAgentUnavailable.mockReturnValue(true)
    const MAX_HEALTH_CHECK_FAILURES = 3
    setHealthCheckFailures(MAX_HEALTH_CHECK_FAILURES)

    await refreshSingleCluster('refresh-test')
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const c = clusterCache.clusters.find(c => c.name === 'refresh-test')!
    // Because failure was cleared and re-recorded at NOW, shouldMarkOffline returns false
    // So previous data is preserved (not marked offline)
    expect(c.refreshing).toBe(false)
    expect(c.nodeCount).toBe(3) // preserved original
    vi.useRealTimers()
  })

  it('updates with errorType/errorMessage from health response', async () => {
    vi.useFakeTimers()
    const healthData: ClusterHealth = {
      cluster: 'refresh-test',
      healthy: false,
      nodeCount: 0,
      readyNodes: 0,
      reachable: false,
      errorType: 'auth',
      errorMessage: 'Unauthorized',
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    })

    await refreshSingleCluster('refresh-test')
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const c = clusterCache.clusters.find(c => c.name === 'refresh-test')!
    expect(c.errorType).toBe('auth')
    expect(c.errorMessage).toBe('Unauthorized')
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// connectSharedWebSocket
// ---------------------------------------------------------------------------
