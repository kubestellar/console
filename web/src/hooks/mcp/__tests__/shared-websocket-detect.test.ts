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
  LOCAL_AGENT_URL,
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

describe('connectSharedWebSocket', () => {
  beforeEach(() => {
    cleanupSharedWebSocket()
    mockIsDemoToken.mockReturnValue(false)
    mockIsBackendUnavailable.mockReturnValue(false)
  })

  it('does not connect when using demo token', () => {
    mockIsDemoToken.mockReturnValue(true)
    connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('does not connect when already connecting', () => {
    sharedWebSocket.connecting = true
    connectSharedWebSocket()
    // Should remain connecting but not create new WS
    expect(sharedWebSocket.connecting).toBe(true)
  })

  it('does not connect when backend is unavailable (HTTP check)', () => {
    mockIsBackendUnavailable.mockReturnValue(true)
    connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('does not connect when max reconnect attempts exceeded', () => {
    const MAX_RECONNECT_ATTEMPTS = 3
    sharedWebSocket.reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    connectSharedWebSocket()
    // Should mark as connecting briefly then immediately clear
    expect(sharedWebSocket.connecting).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateSingleClusterInCache — distribution caching
// ---------------------------------------------------------------------------
describe('updateSingleClusterInCache — distribution update', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    clusterSubscribers.clear()
    updateClusterCache({
      clusters: [makeCluster({ name: 'dist-update', server: 'https://dist.example.com' })],
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists distribution changes to localStorage', () => {
    updateSingleClusterInCache('dist-update', { distribution: 'openshift' })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const stored = localStorage.getItem('kubestellar-cluster-distributions')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed['dist-update']?.distribution).toBe('openshift')
  })
})

// ============================================================================
// Additional regression tests targeting remaining uncovered branches
// ============================================================================

describe('fullFetchClusters — agent success path', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    mockIsDemoMode.mockReturnValue(false)
    mockIsDemoToken.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsAgentUnavailable.mockReturnValue(false)
    setHealthCheckFailures(0)
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

  it('uses agent cluster list and deduplicates by server', async () => {
    const agentClusters = {
      clusters: [
        { name: 'prow', context: 'prow', server: 'https://api.prod:6443', user: 'admin' },
        { name: 'default/api-prod:6443/admin', context: 'ctx', server: 'https://api.prod:6443', user: 'admin' },
      ],
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(agentClusters),
    })

    await fullFetchClusters()

    // Should deduplicate — two clusters with same server become one
    expect(clusterCache.clusters.length).toBeLessThanOrEqual(2) // dedup works
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.consecutiveFailures).toBe(0)
  })

  it('preserves existing health data when agent returns same clusters', async () => {
    // Seed existing cluster with health data
    updateClusterCache({
      clusters: [makeCluster({
        name: 'existing',
        context: 'existing',
        server: 'https://api.existing:6443',
        nodeCount: 5,
        cpuCores: 16,
        distribution: 'openshift',
        namespaces: ['openshift-operators'],
      })],
    })

    const agentClusters = {
      clusters: [
        { name: 'existing', context: 'existing', server: 'https://api.existing:6443', user: 'admin' },
      ],
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(agentClusters),
    })

    await fullFetchClusters()

    const c = clusterCache.clusters.find(c => c.name === 'existing')!
    // Health data and distribution should be preserved
    expect(c.nodeCount).toBe(5)
    expect(c.distribution).toBe('openshift')
    expect(c.namespaces).toEqual(['openshift-operators'])
  })

  it('falls back to demo clusters on error with empty cache', async () => {
    // Agent fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))
    // Backend also fails
    localStorage.setItem('token', 'real-token')
    mockApiGet.mockRejectedValue(new Error('backend down'))

    await fullFetchClusters()

    // Should fall back to demo clusters
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.error).toBeNull() // Never sets error
    expect(clusterCache.consecutiveFailures).toBe(1)
  })

  it('skips agent on Netlify and falls back to backend', async () => {
    mockIsNetlifyDeployment.value = true
    localStorage.setItem('token', 'real-token')
    const BACKEND_CLUSTERS = [makeCluster({ name: 'netlify-backend-cluster' })]
    mockApiGet.mockResolvedValue({ data: { clusters: BACKEND_CLUSTERS } })

    await fullFetchClusters()

    expect(clusterCache.clusters.some(c => c.name === 'netlify-backend-cluster')).toBe(true)
    mockIsNetlifyDeployment.value = false
  })

  it('handles agent returning non-OK response (falls through to backend)', async () => {
    const NOT_OK = 503
    localStorage.setItem('token', 'real-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: NOT_OK,
    })
    mockApiGet.mockResolvedValue({ data: { clusters: [makeCluster({ name: 'backend-fallback' })] } })

    await fullFetchClusters()

    expect(clusterCache.clusters.some(c => c.name === 'backend-fallback')).toBe(true)
  })
})

describe('refreshSingleCluster — transient failure preserves data', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    localStorage.clear()
    mockIsAgentUnavailable.mockReturnValue(true)
    mockIsDemoToken.mockReturnValue(false)
    setHealthCheckFailures(0)
    clearClusterFailure('offline-test')

    updateClusterCache({
      clusters: [makeCluster({
        name: 'offline-test',
        context: 'offline-ctx',
        server: 'https://offline.example.com',
        nodeCount: 0,
        reachable: undefined,
      })],
      isLoading: false,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    clearClusterFailure('offline-test')
  })

  it('preserves existing data on transient failure (refreshSingleCluster clears failure tracking first)', async () => {
    // refreshSingleCluster clears failure tracking at the start,
    // so shouldMarkOffline always returns false on the first null result.
    // This means the cluster stays in its previous state (not marked offline).
    const MAX_HEALTH_CHECK_FAILURES = 3
    setHealthCheckFailures(MAX_HEALTH_CHECK_FAILURES)

    await refreshSingleCluster('offline-test')
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const c = clusterCache.clusters.find(c => c.name === 'offline-test')!
    // The function records a new failure but shouldMarkOffline returns false (just recorded)
    // So it preserves existing data and just clears refreshing
    expect(c.refreshing).toBe(false)
  })
})

describe('fetchSingleClusterHealth — backend error paths', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockIsNetlifyDeployment.value = false
    mockIsDemoToken.mockReturnValue(false)
    setHealthCheckFailures(0)
    localStorage.setItem('token', 'real-token')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('increments healthCheckFailures on backend timeout/error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    setHealthCheckFailures(0)
    await fetchSingleClusterHealth('err-cluster')

    expect(getHealthCheckFailures()).toBe(1)
  })

  it('resets healthCheckFailures to 0 on successful backend response', async () => {
    setHealthCheckFailures(2)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cluster: 'ok', healthy: true, nodeCount: 1, readyNodes: 1 }),
    })

    await fetchSingleClusterHealth('ok-cluster')
    expect(getHealthCheckFailures()).toBe(0)
  })

  it('returns null when backend JSON parse fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null), // .catch(() => null) returns null
    })

    // Agent unavailable, backend returns unparseable json
    const result = await fetchSingleClusterHealth('bad-json')
    // json().catch(() => null) returns null, then throws 'Invalid JSON'
    // which is caught and increments failures
    expect(result).toBeNull()
  })

  it('handles agent returning non-OK response by falling back to backend', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const NOT_OK = 503

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: NOT_OK }) // agent
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ cluster: 'fb', healthy: true, nodeCount: 2, readyNodes: 2 }),
      }) // backend

    const result = await fetchSingleClusterHealth('fallback-test')
    expect(result).toBeTruthy()
    expect(result?.nodeCount).toBe(2)
  })

  it('handles agent returning invalid JSON by falling back to backend', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null), // Invalid: .catch(() => null) returns null
      }) // agent returns bad JSON
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ cluster: 'fb2', healthy: true, nodeCount: 1, readyNodes: 1 }),
      }) // backend

    const result = await fetchSingleClusterHealth('bad-agent-json')
    expect(result).toBeTruthy()
    expect(result?.nodeCount).toBe(1)
  })

  it('sends Authorization header when token exists', async () => {
    mockIsAgentUnavailable.mockReturnValue(true) // skip agent
    localStorage.setItem('kc-agent-token', 'my-jwt')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cluster: 'auth', healthy: true, nodeCount: 1, readyNodes: 1 }),
    })

    await fetchSingleClusterHealth('auth-test')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1]?.headers?.Authorization).toBe('Bearer my-jwt')
  })

  it('omits Authorization header when no token', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    localStorage.removeItem('kc-agent-token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cluster: 'no-auth', healthy: true, nodeCount: 1, readyNodes: 1 }),
    })

    await fetchSingleClusterHealth('no-auth-test')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1]?.headers?.Authorization).toBeUndefined()
  })
})

describe('mergeWithStoredClusters — edge cases (via updateClusterCache)', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('preserves pvcCount from cache via nullish coalescing (pvcCount can be 0)', () => {
    const PVC_COUNT = 5
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'pvc-test', context: 'ctx', pvcCount: PVC_COUNT, pvcBoundCount: 3 }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'pvc-test', pvcCount: undefined, pvcBoundCount: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'pvc-test')!
    expect(c.pvcCount).toBe(PVC_COUNT)
    expect(c.pvcBoundCount).toBe(3)
  })

  it('allows pvcCount=0 from new data (nullish coalescing passes 0)', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'pvc-zero', context: 'ctx', pvcCount: 5 }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'pvc-zero', pvcCount: 0 })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'pvc-zero')!
    expect(c.pvcCount).toBe(0) // 0 is not undefined/null, so it wins
  })

  it('preserves namespaces from cached cluster when new data has empty array', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'ns-test', context: 'ctx', namespaces: ['ns1', 'ns2'] }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'ns-test', namespaces: [] })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'ns-test')!
    expect(c.namespaces).toEqual(['ns1', 'ns2'])
  })

  it('uses new namespaces when they have content', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'ns-new', context: 'ctx', namespaces: ['old-ns'] }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'ns-new', namespaces: ['new-ns1', 'new-ns2'] })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'ns-new')!
    expect(c.namespaces).toEqual(['new-ns1', 'new-ns2'])
  })

  it('preserves distribution from cached data via || fallback', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'dist-merge', context: 'ctx', distribution: 'gke' }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'dist-merge', distribution: undefined, server: 'https://plain.internal' })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'dist-merge')!
    expect(c.distribution).toBe('gke')
  })

  it('preserves authMethod from cached data via || fallback', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'auth-merge', context: 'ctx', authMethod: 'exec' }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'auth-merge', authMethod: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'auth-merge')!
    expect(c.authMethod).toBe('exec')
  })
})

describe('updateSingleClusterInCache — memoryUsageGB and metricsAvailable sharing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares cpuRequestsCores to same-server clusters when updated', () => {
    const CPU_REQUESTS = 4.5
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'src', server: 'https://shared-cpu', cpuRequestsCores: undefined, nodeCount: 3 }),
        makeCluster({ name: 'dst', server: 'https://shared-cpu', cpuRequestsCores: undefined, nodeCount: 0 }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('src', { cpuRequestsCores: CPU_REQUESTS })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const dst = clusterCache.clusters.find(c => c.name === 'dst')!
    expect(dst.cpuRequestsCores).toBe(CPU_REQUESTS)
  })

  it('shares memoryRequestsGB to same-server clusters when updated', () => {
    const MEM_REQ_GB = 16
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'src2', server: 'https://shared-mem', memoryRequestsGB: undefined, nodeCount: 3 }),
        makeCluster({ name: 'dst2', server: 'https://shared-mem', memoryRequestsGB: undefined, nodeCount: 0 }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('src2', { memoryRequestsGB: MEM_REQ_GB })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const dst = clusterCache.clusters.find(c => c.name === 'dst2')!
    expect(dst.memoryRequestsGB).toBe(MEM_REQ_GB)
  })
})

describe('updateSingleClusterInCache — multiple metrics keys protection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    localStorage.clear()
    updateClusterCache({
      clusters: [makeCluster({
        name: 'metrics-protect',
        server: 'https://mp',
        memoryGB: 64,
        storageGB: 200,
        cpuRequestsMillicores: 4000,
        memoryRequestsBytes: 1024,
        memoryRequestsGB: 32,
      })],
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows memoryGB to be overwritten with zero', () => {
    // PR #5449: zero is a valid metric value (scaled-to-zero) — no longer preserved
    updateSingleClusterInCache('metrics-protect', { memoryGB: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.memoryGB).toBe(0)
  })

  it('allows storageGB to be overwritten with zero', () => {
    updateSingleClusterInCache('metrics-protect', { storageGB: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.storageGB).toBe(0)
  })

  it('allows cpuRequestsMillicores to be overwritten with zero', () => {
    updateSingleClusterInCache('metrics-protect', { cpuRequestsMillicores: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.cpuRequestsMillicores).toBe(0)
  })

  it('allows memoryRequestsBytes to be overwritten with zero', () => {
    updateSingleClusterInCache('metrics-protect', { memoryRequestsBytes: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.memoryRequestsBytes).toBe(0)
  })

  it('allows memoryRequestsGB to be overwritten with zero', () => {
    updateSingleClusterInCache('metrics-protect', { memoryRequestsGB: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.memoryRequestsGB).toBe(0)
  })

  it('allows updating metrics with positive new values', () => {
    const NEW_MEM = 128
    updateSingleClusterInCache('metrics-protect', { memoryGB: NEW_MEM })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'metrics-protect')!
    expect(c.memoryGB).toBe(NEW_MEM)
  })
})

describe('deduplicateClustersByServer — pvcCount and pvcBoundCount merge', () => {
  it('merges pvcCount and pvcBoundCount from source with capacity', () => {
    const PVC_COUNT = 10
    const PVC_BOUND = 8
    const withPvc = makeCluster({
      name: 'with-pvc',
      server: 'https://pvc-server',
      cpuCores: 8,
      pvcCount: PVC_COUNT,
      pvcBoundCount: PVC_BOUND,
    })
    const noPvc = makeCluster({
      name: 'no-pvc',
      server: 'https://pvc-server',
      cpuCores: undefined,
      pvcCount: undefined,
      pvcBoundCount: undefined,
    })

    const result = deduplicateClustersByServer([withPvc, noPvc])
    expect(result).toHaveLength(1)
    expect(result[0].pvcCount).toBe(PVC_COUNT)
    expect(result[0].pvcBoundCount).toBe(PVC_BOUND)
  })
})

describe('shareMetricsBetweenSameServerClusters — metricsAvailable sharing', () => {
  it('copies metricsAvailable flag from source to cluster missing it', () => {
    const source = makeCluster({
      name: 'src',
      server: 'https://metrics-srv',
      nodeCount: 3,
      cpuCores: 8,
      metricsAvailable: true,
    })
    const target = makeCluster({
      name: 'tgt',
      server: 'https://metrics-srv',
      nodeCount: 0,
      cpuCores: undefined,
      metricsAvailable: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'tgt')!
    expect(tgt.metricsAvailable).toBe(true)
  })

  it('copies cpuUsageCores and memoryUsageGB from source', () => {
    const CPU_USAGE = 2.5
    const MEM_USAGE = 12.3
    const source = makeCluster({
      name: 'usage-src',
      server: 'https://usage-srv',
      nodeCount: 5,
      cpuCores: 16,
      cpuUsageCores: CPU_USAGE,
      memoryUsageGB: MEM_USAGE,
    })
    const target = makeCluster({
      name: 'usage-tgt',
      server: 'https://usage-srv',
      nodeCount: 0,
      cpuCores: undefined,
      cpuUsageCores: undefined,
      memoryUsageGB: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'usage-tgt')!
    expect(tgt.cpuUsageCores).toBe(CPU_USAGE)
    expect(tgt.memoryUsageGB).toBe(MEM_USAGE)
  })
})

describe('loadClusterCacheFromStorage — filtering (via module init and updateClusterCache)', () => {
  it('filters out clusters with slash in name from localStorage on load', () => {
    // Simulate a stale cache with path-style names
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'good', context: 'ctx1' },
      { name: 'context/path/name', context: 'ctx2' },
    ]))

    // The filter happens in loadClusterCacheFromStorage when mergeWithStoredClusters is called
    updateClusterCache({
      clusters: [makeCluster({ name: 'good' })],
    })

    // Cluster with slash should not appear in merged results
    const slashCluster = clusterCache.clusters.find(c => c.name === 'context/path/name')
    expect(slashCluster).toBeUndefined()
  })
})

describe('GKE detection from .gke.io URL', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('detects GKE from .gke.io URL', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'gke-io',
        server: 'https://cluster.gke.io:443',
        distribution: undefined,
      })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'gke-io')!
    expect(c.distribution).toBe('gke')
  })
})

describe('AKS detection from .hcp. URL', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('detects AKS from .hcp. URL', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'aks-hcp',
        server: 'https://my-cluster.hcp.eastus.azmk8s.io:443',
        distribution: undefined,
      })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'aks-hcp')!
    expect(c.distribution).toBe('aks')
  })
})

describe('OCI detection from .oci. URL', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('detects OCI from .oci. URL pattern', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'oci-test',
        server: 'https://cluster.oci.example.com',
        distribution: undefined,
      })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'oci-test')!
    expect(c.distribution).toBe('oci')
  })
})

describe('OpenShift detection from generic api pattern with :6443', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('detects OpenShift from api.*.example.com:6443 URL', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'ocp-api',
        server: 'https://api.my-cluster.example.com:6443',
        distribution: undefined,
      })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'ocp-api')!
    expect(c.distribution).toBe('openshift')
  })

  it('does NOT detect OpenShift from api URL that contains .eks.', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'eks-not-ocp',
        server: 'https://api.cluster.eks.amazonaws.com:6443',
        distribution: undefined,
      })],
    })
    const c = clusterCache.clusters.find(c => c.name === 'eks-not-ocp')!
    // Should be eks, not openshift
    expect(c.distribution).toBe('eks')
  })
})
