/**
 * Tests for hooks/mcp/shared.ts — metrics sharing, dedup, cache loading,
 * and cloud-provider (GKE/AKS/OCI/OpenShift) URL detection.
 *
 * Split from shared-websocket-detect.test.ts (see kubestellar/console#22772).
 */

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

describe('updateSingleClusterInCache — memoryUsageGB and metricsAvailable sharing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    localStorage.clear()
    sessionStorage.clear()
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
        makeCluster({ name: 'dst2', server: 'https://shared-mem', memoryRequestsGB: undefined, nodeCount: undefined }),
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
    sessionStorage.clear()
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
    sessionStorage.clear()
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
    sessionStorage.clear()
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
    sessionStorage.clear()
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
    sessionStorage.clear()
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

