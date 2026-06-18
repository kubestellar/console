import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ClusterInfo, ClusterHealth } from '../types'
import {
  makeCluster,
  OFFLINE_THRESHOLD_MS,
  AUTO_GENERATED_NAME_LENGTH_THRESHOLD,
  CLUSTER_NOTIFY_DEBOUNCE_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_BACKOFF_MS,
} from './helpers/mcp-mocks'

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
// Tests
// ---------------------------------------------------------------------------


describe('deduplicateClustersByServer — merge request metrics', () => {
  it('merges cpuRequestsCores from a different duplicate than capacity source', () => {
    const CPU_CORES = 16
    const CPU_REQUESTS = 4.5
    const withCapacity = makeCluster({
      name: 'cap',
      server: 'https://s1',
      cpuCores: CPU_CORES,
      cpuRequestsCores: undefined,
      cpuRequestsMillicores: undefined,
    })
    const withRequests = makeCluster({
      name: 'req',
      server: 'https://s1',
      cpuCores: undefined,
      cpuRequestsCores: CPU_REQUESTS,
      cpuRequestsMillicores: 4500,
    })

    const result = deduplicateClustersByServer([withCapacity, withRequests])
    expect(result).toHaveLength(1)
    expect(result[0].cpuCores).toBe(CPU_CORES)
    expect(result[0].cpuRequestsCores).toBe(CPU_REQUESTS)
  })

  it('merges memoryRequestsGB from a different duplicate', () => {
    const MEM_GB = 64
    const MEM_REQ_GB = 32
    const withMem = makeCluster({
      name: 'mem',
      server: 'https://s1',
      memoryGB: MEM_GB,
      memoryRequestsGB: undefined,
    })
    const withReq = makeCluster({
      name: 'req',
      server: 'https://s1',
      memoryGB: undefined,
      memoryRequestsGB: MEM_REQ_GB,
      memoryRequestsBytes: 32 * 1024 * 1024 * 1024,
    })

    const result = deduplicateClustersByServer([withMem, withReq])
    expect(result).toHaveLength(1)
    expect(result[0].memoryRequestsGB).toBe(MEM_REQ_GB)
  })
})


describe('updateSingleClusterInCache — metric sharing via shareMetricsBetweenSameServerClusters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares nodeCount to alias on same server when nodeCount is updated', () => {
    const NODE_COUNT = 10
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'primary', server: 'https://shared', nodeCount: 0 }),
        makeCluster({ name: 'alias', server: 'https://shared', nodeCount: undefined }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('primary', { nodeCount: NODE_COUNT })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const alias = clusterCache.clusters.find(c => c.name === 'alias')!
    expect(alias.nodeCount).toBe(NODE_COUNT)
  })
})


describe('sharedWebSocket state', () => {
  it('has correct initial state', () => {
    cleanupSharedWebSocket()
    expect(sharedWebSocket.ws).toBeNull()
    expect(sharedWebSocket.connecting).toBe(false)
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
  })
})


describe('ClusterCache interface shape', () => {
  it('clusterCache has all required fields', () => {
    expect(clusterCache).toHaveProperty('clusters')
    expect(clusterCache).toHaveProperty('lastUpdated')
    expect(clusterCache).toHaveProperty('isLoading')
    expect(clusterCache).toHaveProperty('isRefreshing')
    expect(clusterCache).toHaveProperty('error')
    expect(clusterCache).toHaveProperty('consecutiveFailures')
    expect(clusterCache).toHaveProperty('isFailed')
    expect(clusterCache).toHaveProperty('lastRefresh')
  })
})

// ---------------------------------------------------------------------------
// Distribution detection via URL (private function exercised through updateClusterCache)
// ---------------------------------------------------------------------------
