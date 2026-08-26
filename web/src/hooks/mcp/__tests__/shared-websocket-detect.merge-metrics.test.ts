import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ClusterInfo } from '../types'

// ---------------------------------------------------------------------------
// Constants used in tests (mirror source values to avoid magic numbers)
// ---------------------------------------------------------------------------
const CLUSTER_NOTIFY_DEBOUNCE_MS = 50 // same debounce delay in shared.ts

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
  // Pure functions
  shareMetricsBetweenSameServerClusters,
  deduplicateClustersByServer,
  // Async functions
  // State management
  clusterCache,
  clusterSubscribers,
  updateClusterCache,
  updateSingleClusterInCache,
  // WebSocket
  // Cache ref
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


