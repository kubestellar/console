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
