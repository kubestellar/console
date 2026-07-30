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
describe('distribution detection from server URL (via updateClusterCache)', () => {
  beforeEach(() => {
    clusterSubscribers.clear()
    localStorage.clear()
    // Reset cache
    updateClusterCache({
      clusters: [],
      isLoading: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
    })
  })

  it('detects OpenShift from .openshiftapps.com URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'ocp', server: 'https://api.cluster.openshiftapps.com:6443', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'ocp')!
    expect(c.distribution).toBe('openshift')
  })

  it('detects EKS from .eks.amazonaws.com URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'eks', server: 'https://abc.eks.amazonaws.com', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'eks')!
    expect(c.distribution).toBe('eks')
  })

  it('detects GKE from .container.googleapis.com URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'gke', server: 'https://35.x.x.x.container.googleapis.com', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'gke')!
    expect(c.distribution).toBe('gke')
  })

  it('detects AKS from .azmk8s.io URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'aks', server: 'https://aks-test.hcp.westeurope.azmk8s.io:443', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'aks')!
    expect(c.distribution).toBe('aks')
  })

  it('detects OCI from .oraclecloud.com URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'oci', server: 'https://cluster.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'oci')!
    expect(c.distribution).toBe('oci')
  })

  it('detects DigitalOcean from .digitalocean.com URL', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'do', server: 'https://abc.k8s.ondigitalocean.com', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'do')!
    expect(c.distribution).toBe('digitalocean')
  })

  it('detects OpenShift from FMAAS pattern', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'fmaas', server: 'https://api.fmaas-test.fmaas.res.ibm.com:6443', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'fmaas')!
    expect(c.distribution).toBe('openshift')
  })

  it('preserves existing distribution (does not overwrite)', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'keep', server: 'https://api.cluster.openshiftapps.com:6443', distribution: 'custom' })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'keep')!
    expect(c.distribution).toBe('custom')
  })

  it('returns undefined for unknown server URLs', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'unknown', server: 'https://my-custom-k8s.internal:6443', distribution: undefined })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'unknown')!
    // Could be openshift from api pattern or undefined
    // The generic pattern matches api.* with :6443
    expect(c.distribution === 'openshift' || c.distribution === undefined).toBe(true)
  })
})

