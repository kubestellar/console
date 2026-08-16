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

describe('mergeWithStoredClusters — edge cases (via updateClusterCache)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
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
