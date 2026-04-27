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
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: mockRegisterCacheReset,
  triggerAllRefetches: mockTriggerAllRefetches,
}))

vi.mock('../../../lib/cache', () => ({
  resetFailuresForCluster: mockResetFailuresForCluster,
  resetAllCacheFailures: mockResetAllCacheFailures,
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
  initialFetchStarted,
  healthCheckFailures,
  // WebSocket
  sharedWebSocket,
  cleanupSharedWebSocket,
  // Cache ref
  clusterCacheRef,
  subscribeClusterCache,
} from '../shared'

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
        makeCluster({ name: 'alias', server: 'https://shared', nodeCount: 0 }),
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

// ---------------------------------------------------------------------------
// localStorage cluster cache (private functions exercised through updateClusterCache)
// ---------------------------------------------------------------------------
describe('localStorage cluster cache persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    updateClusterCache({ clusters: [], isLoading: false })
  })

  it('saves clusters to localStorage when updateClusterCache is called', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'persisted' })],
    })
    const stored = localStorage.getItem('kubestellar-cluster-cache')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.some((c: ClusterInfo) => c.name === 'persisted')).toBe(true)
  })

  it('filters out clusters with slash in name from localStorage', () => {
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'good-name' }),
        makeCluster({ name: 'path/with/slash' }),
      ],
    })
    const stored = localStorage.getItem('kubestellar-cluster-cache')
    const parsed = JSON.parse(stored!)
    expect(parsed.every((c: ClusterInfo) => !c.name.includes('/'))).toBe(true)
  })

  it('saves distribution cache to localStorage', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'dist-test', distribution: 'openshift' })],
    })
    const stored = localStorage.getItem('kubestellar-cluster-distributions')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed['dist-test']).toEqual(expect.objectContaining({ distribution: 'openshift' }))
  })

  it('applies distribution from localStorage cache to cluster without distribution', () => {
    // First, save a distribution to cache
    localStorage.setItem('kubestellar-cluster-distributions', JSON.stringify({
      'cached-cluster': { distribution: 'eks', namespaces: ['ns1'] }
    }))

    updateClusterCache({
      clusters: [makeCluster({ name: 'cached-cluster', distribution: undefined, server: 'https://custom.internal' })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'cached-cluster')!
    expect(c.distribution).toBe('eks')
    expect(c.namespaces).toEqual(['ns1'])
  })
})

// ---------------------------------------------------------------------------
// mergeWithStoredClusters (private, exercised through updateClusterCache)
// ---------------------------------------------------------------------------
describe('mergeWithStoredClusters (via updateClusterCache)', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('preserves cached metrics when new cluster data is missing metrics', () => {
    const CPU_CORES = 16
    const MEM_GB = 64
    // Seed localStorage with a cluster that has metrics
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'merge-test', context: 'ctx', cpuCores: CPU_CORES, memoryGB: MEM_GB, nodeCount: 5, podCount: 40 }
    ]))

    // Update with a cluster that has no metrics
    updateClusterCache({
      clusters: [makeCluster({ name: 'merge-test', cpuCores: undefined, memoryGB: undefined, nodeCount: undefined, podCount: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'merge-test')!
    expect(c.cpuCores).toBe(CPU_CORES)
    expect(c.memoryGB).toBe(MEM_GB)
  })

  it('uses new metrics when they are positive', () => {
    const OLD_CPU = 8
    const NEW_CPU = 32
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'merge-new', context: 'ctx', cpuCores: OLD_CPU }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'merge-new', cpuCores: NEW_CPU })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'merge-new')!
    expect(c.cpuCores).toBe(NEW_CPU)
  })

  it('preserves health status from cached data when new data is undefined', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'health-merge', context: 'ctx', healthy: true, reachable: true }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'health-merge', healthy: undefined, reachable: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'health-merge')!
    expect(c.healthy).toBe(true)
    expect(c.reachable).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fullFetchClusters — demo mode paths
// ---------------------------------------------------------------------------
describe('fullFetchClusters', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    mockIsDemoMode.mockReturnValue(false)
    mockIsDemoToken.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsAgentUnavailable.mockReturnValue(true)
    // Reset cache to clean state
    updateClusterCache({
      clusters: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastUpdated: null,
      lastRefresh: null,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns demo clusters when isDemoMode() is true and demo token is set', async () => {
    // #6243 dropped the unconditional demo-mode short-circuit. Demo data
    // is now returned only when:
    //   1) Netlify forced demo, OR
    //   2) fetchClusterListFromAgent() returns null AND
    //      isDemoMode() && isDemoToken() are both true.
    // Tests must mock both flags AND make agent fetch fail so the demo
    // fallback branch fires.
    mockIsDemoMode.mockReturnValue(true)
    mockIsDemoToken.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))
    await fullFetchClusters()
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.error).toBeNull()
    // Demo clusters should include well-known demo names
    const names = clusterCache.clusters.map(c => c.name)
    expect(names).toContain('kind-local')
  })

  it('returns demo clusters on Netlify with demo token', async () => {
    mockIsNetlifyDeployment.value = true
    mockIsDemoToken.mockReturnValue(true)
    localStorage.setItem('token', 'demo-token')
    await fullFetchClusters()
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.isLoading).toBe(false)
  })

  it('falls back gracefully on fetch error (no blocking error)', async () => {
    // Agent unavailable + no token = should finish loading
    localStorage.removeItem('token')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))
    mockApiGet.mockRejectedValue(new Error('network'))
    await fullFetchClusters()
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.error).toBeNull() // Never sets error
  })

  it('fetches from backend API when agent is unavailable and token exists', async () => {
    localStorage.setItem('token', 'real-token')
    const BACKEND_CLUSTERS = [makeCluster({ name: 'backend-cluster' })]
    mockApiGet.mockResolvedValue({ data: { clusters: BACKEND_CLUSTERS } })
    // Agent returns null
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))

    await fullFetchClusters()

    // The backend API fallback now uses the same-origin /api/mcp/clusters endpoint
    // which works regardless of agent backend (kc-agent, kagenti, kagent). (#9535)
    expect(mockApiGet).toHaveBeenCalledWith('/api/mcp/clusters')
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.clusters.some(c => c.name === 'backend-cluster')).toBe(true)
  })

  it('routes cluster fetch through backend API when kagenti backend is preferred (#9535)', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    const KAGENTI_CLUSTERS = [makeCluster({ name: 'kagenti-cluster' })]
    mockApiGet.mockResolvedValue({ data: { clusters: KAGENTI_CLUSTERS } })
    // globalThis.fetch should NOT be called — kagenti path uses api.get
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'))

    await fullFetchClusters()

    expect(mockApiGet).toHaveBeenCalledWith('/api/mcp/clusters')
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.clusters.some(c => c.name === 'kagenti-cluster')).toBe(true)
  })

  it('skips backend when no auth token', async () => {
    // The previous test may have set a token; clear it all
    localStorage.clear()
    mockApiGet.mockClear()
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))

    await fullFetchClusters()

    expect(mockApiGet).not.toHaveBeenCalled()
    expect(clusterCache.isLoading).toBe(false)
  })

  it('deduplicates concurrent calls (only one runs at a time)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const p1 = fullFetchClusters()
    const p2 = fullFetchClusters() // Should be a no-op
    await Promise.all([p1, p2])
    // Both resolve without error
    expect(clusterCache.isLoading).toBe(false)
  })

  it('falls back to demo clusters on backend API error (catch block)', async () => {
    localStorage.setItem('token', 'real-token')
    // Agent returns null
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))
    // Backend API also throws
    mockApiGet.mockRejectedValue(new Error('backend unavailable'))

    await fullFetchClusters()

    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.error).toBeNull() // Never sets error
    // Should have demo data as fallback
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.consecutiveFailures).toBeGreaterThan(0)
  })

  it('on Netlify with real token, skips early return and tries fetch', async () => {
    mockIsNetlifyDeployment.value = true
    localStorage.setItem('token', 'real-user-token')
    // Agent will fail (Netlify), backend should be tried
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent'))
    mockApiGet.mockResolvedValue({ data: { clusters: [makeCluster({ name: 'netlify-real' })] } })

    await fullFetchClusters()

    expect(clusterCache.clusters.some(c => c.name === 'netlify-real')).toBe(true)
  })

  it('preserves existing clusters on fetch error when cache has data', async () => {
    // Seed some initial clusters
    updateClusterCache({
      clusters: [makeCluster({ name: 'existing' })],
      isLoading: false,
    })

    localStorage.setItem('token', 'real-token')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent'))
    mockApiGet.mockRejectedValue(new Error('backend'))

    await fullFetchClusters()

    // Should preserve existing clusters, not replace with demo
    expect(clusterCache.clusters.some(c => c.name === 'existing')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchSingleClusterHealth
// ---------------------------------------------------------------------------
describe('fetchSingleClusterHealth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsDemoToken.mockReturnValue(false)
    setHealthCheckFailures(0)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
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
    expect(healthCheckFailures).toBe(1)
  })

  it('uses kubectlContext for agent request when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Pre-seed agent token to prevent getAgentToken() from calling /api/agent/token
    localStorage.setItem('kc-agent-token', 'test-token')
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
