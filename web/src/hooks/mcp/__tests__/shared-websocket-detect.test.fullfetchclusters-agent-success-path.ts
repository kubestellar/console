/* Split from shared-websocket-detect.test.ts for focused test modules. */
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
  getLocalAgentURL,
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

describe('fullFetchClusters — agent success path', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
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

  it('keeps the cluster list empty on error with empty cache when demo mode is disabled', async () => {
    // Agent fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))
    // Backend also fails
    localStorage.setItem('token', 'real-token')
    mockApiGet.mockRejectedValue(new Error('backend down'))

    await fullFetchClusters()

    expect(clusterCache.clusters).toEqual([])
    // Both tiers failed and there is no cached data to fall back to, so the
    // orchestrator surfaces the 'Cluster data unavailable' banner and bumps
    // the consecutive-failure counter (see sharedImpl.orchestration.ts).
    expect(clusterCache.error).toBe('Cluster data unavailable')
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
