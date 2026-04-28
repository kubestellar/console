import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { ClusterInfo, ClusterHealth } from '../types'


// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before any import resolution
// ---------------------------------------------------------------------------
const mockFullFetchClusters = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockConnectSharedWebSocket = vi.hoisted(() => vi.fn())
const mockUseDemoMode = vi.hoisted(() => vi.fn().mockReturnValue({ isDemoMode: false }))
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockApiGet = vi.hoisted(() => vi.fn())
const mockTriggerAggressiveDetection = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
const mockFetchSingleClusterHealth = vi.hoisted(() => vi.fn<() => Promise<ClusterHealth | null>>().mockResolvedValue(null))

// ---------------------------------------------------------------------------
// Partially mock ../shared: keep real state & pure-util implementations via
// getters (live-binding proxies) while stubbing network-calling functions.
// ---------------------------------------------------------------------------
vi.mock('../shared', async () => {
  const actual = await vi.importActual<typeof import('../shared')>('../shared')
  const m = actual as Record<string, unknown>
  return {
    // Live-binding getters so callers always see the current module variable
    get clusterCache() {
      return m.clusterCache
    },
    get initialFetchStarted() {
      return m.initialFetchStarted
    },
    get clusterSubscribers() {
      return m.clusterSubscribers
    },
    get dataSubscribers() {
      return m.dataSubscribers
    },
    get uiSubscribers() {
      return m.uiSubscribers
    },
    get sharedWebSocket() {
      return m.sharedWebSocket
    },
    get healthCheckFailures() {
      return m.healthCheckFailures
    },
    // Constants
    REFRESH_INTERVAL_MS: m.REFRESH_INTERVAL_MS,
    CLUSTER_POLL_INTERVAL_MS: m.CLUSTER_POLL_INTERVAL_MS,
    MIN_REFRESH_INDICATOR_MS: m.MIN_REFRESH_INDICATOR_MS,
    CACHE_TTL_MS: m.CACHE_TTL_MS,
    LOCAL_AGENT_URL: m.LOCAL_AGENT_URL,
    // Forwarded real implementations
    getEffectiveInterval: m.getEffectiveInterval,
    notifyClusterSubscribers: m.notifyClusterSubscribers,
    notifyClusterSubscribersDebounced: m.notifyClusterSubscribersDebounced,
    updateClusterCache: m.updateClusterCache,
    updateSingleClusterInCache: m.updateSingleClusterInCache,
    setInitialFetchStarted: m.setInitialFetchStarted,
    setHealthCheckFailures: m.setHealthCheckFailures,
    deduplicateClustersByServer: m.deduplicateClustersByServer,
    shareMetricsBetweenSameServerClusters: m.shareMetricsBetweenSameServerClusters,
    shouldMarkOffline: m.shouldMarkOffline,
    recordClusterFailure: m.recordClusterFailure,
    clearClusterFailure: m.clearClusterFailure,
    cleanupSharedWebSocket: m.cleanupSharedWebSocket,
    subscribeClusterCache: m.subscribeClusterCache,
    subscribeClusterData: m.subscribeClusterData,
    subscribeClusterUI: m.subscribeClusterUI,
    notifyClusterDataSubscribers: m.notifyClusterDataSubscribers,
    notifyClusterUISubscribers: m.notifyClusterUISubscribers,
    clusterCacheRef: m.clusterCacheRef,
    // Stubbed to prevent real network calls
    fetchSingleClusterHealth: mockFetchSingleClusterHealth,
    fullFetchClusters: mockFullFetchClusters,
    connectSharedWebSocket: mockConnectSharedWebSocket,
  }
})

vi.mock('../../../lib/api', () => ({
  api: { get: mockApiGet },
  isBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
  isDemoToken: vi.fn(() => false),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: mockUseDemoMode,
}))

vi.mock('../../useLocalAgent', () => ({
  triggerAggressiveDetection: mockTriggerAggressiveDetection,
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataError: vi.fn(),
  reportAgentDataSuccess: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are installed)
// ---------------------------------------------------------------------------
import {
  deduplicateClustersByServer,
} from '../shared'

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ===========================================================================
// Pure utilities – deduplicateClustersByServer
// ===========================================================================

describe('deduplicateClustersByServer', () => {
  it('keeps all clusters when every server URL is unique', () => {
    const clusters: ClusterInfo[] = [
      { name: 'a', context: 'a', server: 'https://a.example.com' },
      { name: 'b', context: 'b', server: 'https://b.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(2)
    const names = result.map((c) => c.name)
    expect(names).toContain('a')
    expect(names).toContain('b')
  })

  it('selects the preferred (friendly) primary cluster among duplicates', () => {
    const longName = 'default/api-cluster.example.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: longName, context: longName, server: 'https://api.cluster.example.com:6443' },
      { name: 'my-cluster', context: 'my-cluster', server: 'https://api.cluster.example.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-cluster')
  })

  it('preserves aliases for duplicate server entries', () => {
    const longName = 'default/api-cluster.example.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: longName, context: 'ctx-long', server: 'https://api.cluster.example.com:6443' },
      { name: 'my-cluster', context: 'my-cluster', server: 'https://api.cluster.example.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toBeDefined()
    expect(result[0].aliases).toContain(longName)
  })

  it('includes clusters without a server URL without deduplicating them', () => {
    const clusters: ClusterInfo[] = [
      { name: 'no-server-a', context: 'no-server-a' },
      { name: 'no-server-b', context: 'no-server-b' },
      { name: 'has-server', context: 'has-server', server: 'https://srv.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(3)
  })
})

describe('deduplicateClustersByServer — advanced', () => {
  it('handles null/undefined clusters array gracefully', () => {
    // deduplicateClustersByServer guards with (clusters || [])
    const result = deduplicateClustersByServer(null as unknown as ClusterInfo[])
    expect(result).toEqual([])
  })

  it('handles empty clusters array', () => {
    const result = deduplicateClustersByServer([])
    expect(result).toEqual([])
  })

  it('merges best metrics from multiple clusters sharing same server', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'context-a',
        context: 'ctx-a',
        server: 'https://api.shared.example.com:6443',
        cpuCores: 16,
        memoryGB: 64,
        nodeCount: 3,
        podCount: 20,
      },
      {
        name: 'default/api-shared.example.com:6443/kube:admin',
        context: 'ctx-b',
        server: 'https://api.shared.example.com:6443',
        cpuCores: undefined,
        nodeCount: undefined,
        podCount: 50, // higher pod count
        cpuRequestsCores: 8,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    // Should pick 'context-a' as primary (shorter, user-friendly)
    expect(result[0].name).toBe('context-a')
    // Primary's podCount wins (#6112): we no longer take Math.max, because
    // that caused scale-downs to show stale over-counts.
    expect(result[0].podCount).toBe(20)
    // Should keep cpuCores from the cluster that had them
    expect(result[0].cpuCores).toBe(16)
    // Should pick up cpuRequestsCores from the other cluster
    expect(result[0].cpuRequestsCores).toBe(8)
  })

  it('promotes healthy/reachable status from any duplicate', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'unhealthy-ctx',
        context: 'unhealthy-ctx',
        server: 'https://api.test.com',
        healthy: false,
        reachable: false,
      },
      {
        name: 'healthy-ctx',
        context: 'healthy-ctx',
        server: 'https://api.test.com',
        healthy: true,
        reachable: true,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    // If ANY duplicate is healthy/reachable, the merged result should be too
    expect(result[0].healthy).toBe(true)
    expect(result[0].reachable).toBe(true)
  })

  it('prefers isCurrent context as primary when names are similar length', () => {
    const clusters: ClusterInfo[] = [
      { name: 'cluster-a', context: 'cluster-a', server: 'https://same.example.com', isCurrent: false },
      { name: 'cluster-b', context: 'cluster-b', server: 'https://same.example.com', isCurrent: true },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('cluster-b')
    expect(result[0].aliases).toContain('cluster-a')
  })

  it('prefers cluster with more namespaces', () => {
    const clusters: ClusterInfo[] = [
      { name: 'few-ns', context: 'few-ns', server: 'https://ns-test.example.com', namespaces: ['default'] },
      { name: 'many-ns', context: 'many-ns', server: 'https://ns-test.example.com', namespaces: ['default', 'kube-system', 'monitoring', 'apps'] },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('many-ns')
  })

  it('sets empty aliases array for singleton server groups', () => {
    const clusters: ClusterInfo[] = [
      { name: 'solo', context: 'solo', server: 'https://solo.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('detects OpenShift-style auto-generated names as non-primary', () => {
    const autoGenName = 'default/api-my-cluster.h3s2.p1.openshiftapps.com:6443/kube:admin'
    const clusters: ClusterInfo[] = [
      { name: autoGenName, context: autoGenName, server: 'https://api.my-cluster.h3s2.p1.openshiftapps.com:6443' },
      { name: 'my-ocp-cluster', context: 'my-ocp-cluster', server: 'https://api.my-cluster.h3s2.p1.openshiftapps.com:6443' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-ocp-cluster')
    expect(result[0].aliases).toContain(autoGenName)
  })
})

describe('shareMetricsBetweenSameServerClusters', () => {
  // Import the real implementation through the mock
  let shareMetricsFn: typeof import('../shared').shareMetricsBetweenSameServerClusters

  beforeEach(async () => {
    const mod = await import('../shared')
    shareMetricsFn = mod.shareMetricsBetweenSameServerClusters
  })

  it('copies metrics from a rich cluster to a bare cluster sharing the same server', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'rich-ctx',
        context: 'rich-ctx',
        server: 'https://shared-srv.example.com',
        nodeCount: 5,
        podCount: 40,
        cpuCores: 32,
        memoryGB: 128,
        storageGB: 500,
        cpuRequestsCores: 12,
      },
      {
        name: 'bare-ctx',
        context: 'bare-ctx',
        server: 'https://shared-srv.example.com',
        // No metrics at all
      },
    ]
    const result = shareMetricsFn(clusters)
    const bare = result.find(c => c.name === 'bare-ctx')!
    expect(bare.nodeCount).toBe(5)
    expect(bare.podCount).toBe(40)
    expect(bare.cpuCores).toBe(32)
    expect(bare.cpuRequestsCores).toBe(12)
  })

  it('does not overwrite existing metrics on target cluster', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'source',
        context: 'source',
        server: 'https://same.example.com',
        nodeCount: 10,
        podCount: 100,
        cpuCores: 64,
      },
      {
        name: 'target',
        context: 'target',
        server: 'https://same.example.com',
        nodeCount: 3, // already has its own nodeCount
        podCount: 25,
        cpuCores: 16,
      },
    ]
    const result = shareMetricsFn(clusters)
    const target = result.find(c => c.name === 'target')!
    // Should keep its own values since it already has metrics
    expect(target.cpuCores).toBe(16)
  })

  it('handles clusters without server URLs (no sharing)', () => {
    const clusters: ClusterInfo[] = [
      { name: 'no-server-1', context: 'ctx-1', nodeCount: 5 },
      { name: 'no-server-2', context: 'ctx-2' },
    ]
    const result = shareMetricsFn(clusters)
    // Clusters without server can't share metrics
    expect(result.find(c => c.name === 'no-server-2')?.nodeCount).toBeUndefined()
  })

  it('throws on null input (second-pass .map lacks guard)', () => {
    // Note: the for...of loop guards with (clusters || []) but the return
    // clusters.map() does not, so null input throws. This test documents the
    // current behavior to prevent silent regressions if it gets fixed.
    expect(() => shareMetricsFn(null as unknown as ClusterInfo[])).toThrow()
  })

  it('prefers source cluster with higher metric score (nodes > capacity > requests)', () => {
    const clusters: ClusterInfo[] = [
      {
        name: 'has-requests-only',
        context: 'ctx-req',
        server: 'https://score-test.example.com',
        cpuRequestsCores: 4,
        // score = 1 (requests only)
      },
      {
        name: 'has-nodes-and-capacity',
        context: 'ctx-full',
        server: 'https://score-test.example.com',
        nodeCount: 3,
        cpuCores: 16,
        // score = 4 + 2 = 6
      },
      {
        name: 'bare-clone',
        context: 'ctx-bare',
        server: 'https://score-test.example.com',
        // No metrics
      },
    ]
    const result = shareMetricsFn(clusters)
    const bare = result.find(c => c.name === 'bare-clone')!
    // The best source (score=6) should be selected, giving nodeCount=3, cpuCores=16
    expect(bare.nodeCount).toBe(3)
    expect(bare.cpuCores).toBe(16)
  })
})
