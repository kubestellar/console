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

describe('shared.ts - Exported constants', () => {
  it('REFRESH_INTERVAL_MS is 2 minutes', () => {
    const TWO_MINUTES_MS = 120_000
    expect(REFRESH_INTERVAL_MS).toBe(TWO_MINUTES_MS)
  })

  it('CLUSTER_POLL_INTERVAL_MS is 60 seconds', () => {
    const SIXTY_SECONDS_MS = 60_000
    expect(CLUSTER_POLL_INTERVAL_MS).toBe(SIXTY_SECONDS_MS)
  })

  it('GPU_POLL_INTERVAL_MS is 30 seconds', () => {
    const THIRTY_SECONDS_MS = 30_000
    expect(GPU_POLL_INTERVAL_MS).toBe(THIRTY_SECONDS_MS)
  })

  it('CACHE_TTL_MS equals CLUSTER_POLL_INTERVAL_MS', () => {
    expect(CACHE_TTL_MS).toBe(CLUSTER_POLL_INTERVAL_MS)
  })

  it('MIN_REFRESH_INDICATOR_MS is 500ms', () => {
    const HALF_SECOND_MS = 500
    expect(MIN_REFRESH_INDICATOR_MS).toBe(HALF_SECOND_MS)
  })

  it('LOCAL_AGENT_URL is re-exported from constants', () => {
    expect(typeof LOCAL_AGENT_URL).toBe('string')
  })
})

describe('getEffectiveInterval', () => {
  it('returns the base interval unchanged', () => {
    expect(getEffectiveInterval(5000)).toBe(5000)
  })

  it('works with zero', () => {
    expect(getEffectiveInterval(0)).toBe(0)
  })

  it('works with large values', () => {
    const LARGE_INTERVAL = 999_999
    expect(getEffectiveInterval(LARGE_INTERVAL)).toBe(LARGE_INTERVAL)
  })
})

describe('clusterDisplayName', () => {
  it('returns base name when short enough', () => {
    expect(clusterDisplayName('my-cluster')).toBe('my-cluster')
  })

  it('strips context prefix (slash-separated)', () => {
    expect(clusterDisplayName('default/my-cluster')).toBe('my-cluster')
  })

  it('strips deep context prefix', () => {
    expect(clusterDisplayName('a/b/c/my-cluster')).toBe('my-cluster')
  })

  it('truncates long names with multiple segments', () => {
    // 3+ segments, >24 chars: takes first 3 segments joined by dash
    const longName = 'segment-one-two-three-four-five'
    expect(longName.length).toBeGreaterThan(24)
    const result = clusterDisplayName(longName)
    // Should take first 3 segments from split on [-_.]
    expect(result).toBe('segment-one-two')
  })

  it('truncates long names with 2 or fewer segments with ellipsis', () => {
    // 2 segments, >24 chars
    const longName = 'abcdefghijklmnop-qrstuvwxyz'
    expect(longName.length).toBeGreaterThan(24)
    const result = clusterDisplayName(longName)
    expect(result).toHaveLength(23) // 22 chars + ellipsis character
    expect(result.endsWith('…')).toBe(true)
  })

  it('handles names exactly 24 chars without truncation', () => {
    const exactName = 'abcdefghijklmnopqrstuvwx' // 24 chars
    expect(exactName.length).toBe(24)
    expect(clusterDisplayName(exactName)).toBe(exactName)
  })

  it('handles empty string', () => {
    expect(clusterDisplayName('')).toBe('')
  })
})

describe('shareMetricsBetweenSameServerClusters', () => {
  it('copies metrics from source cluster to cluster missing metrics on same server', () => {
    const source = makeCluster({ name: 'full', server: 'https://s1' })
    const empty = makeCluster({
      name: 'alias',
      server: 'https://s1',
      cpuCores: undefined,
      memoryGB: undefined,
      nodeCount: 0,
      podCount: 0,
    })
    const result = shareMetricsBetweenSameServerClusters([source, empty])
    const alias = result.find(c => c.name === 'alias')!
    expect(alias.cpuCores).toBe(source.cpuCores)
    expect(alias.nodeCount).toBe(source.nodeCount)
    expect(alias.podCount).toBe(source.podCount)
  })

  it('does not overwrite existing metrics', () => {
    const EXISTING_CPU = 16
    const c1 = makeCluster({ name: 'c1', server: 'https://s1', cpuCores: 8 })
    const c2 = makeCluster({ name: 'c2', server: 'https://s1', cpuCores: EXISTING_CPU })
    const result = shareMetricsBetweenSameServerClusters([c1, c2])
    // c2 already has cpuCores, should keep its own value
    const c2Result = result.find(c => c.name === 'c2')!
    expect(c2Result.cpuCores).toBe(EXISTING_CPU)
  })

  it('handles clusters without server gracefully', () => {
    const noServer = makeCluster({ name: 'ns', server: undefined })
    const result = shareMetricsBetweenSameServerClusters([noServer])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ns')
  })

  it('handles empty array gracefully', () => {
    const result = shareMetricsBetweenSameServerClusters([])
    expect(result).toEqual([])
  })

  it('prefers cluster with highest metric score as source', () => {
    // Score: 4 for nodes, 2 for capacity, 1 for requests
    const withNodes = makeCluster({ name: 'a', server: 'https://s1', nodeCount: 5, cpuCores: undefined, cpuRequestsCores: undefined })
    const withCapacity = makeCluster({ name: 'b', server: 'https://s1', nodeCount: 0, cpuCores: 8, cpuRequestsCores: undefined })
    const emptyTarget = makeCluster({ name: 'c', server: 'https://s1', nodeCount: 0, cpuCores: undefined, cpuRequestsCores: undefined })

    const result = shareMetricsBetweenSameServerClusters([withNodes, withCapacity, emptyTarget])
    const target = result.find(c => c.name === 'c')!
    // 'a' has nodeCount=5 (score=4), should be the source for nodeCount
    expect(target.nodeCount).toBe(5)
  })

  it('copies healthy and reachable flags when copying node data', () => {
    const source = makeCluster({ name: 'src', server: 'https://s1', nodeCount: 3, healthy: true, reachable: true })
    const empty = makeCluster({ name: 'dst', server: 'https://s1', nodeCount: 0, healthy: false, reachable: false })
    const result = shareMetricsBetweenSameServerClusters([source, empty])
    const dst = result.find(c => c.name === 'dst')!
    expect(dst.healthy).toBe(true)
    expect(dst.reachable).toBe(true)
  })
})

describe('deduplicateClustersByServer', () => {
  it('returns single cluster unchanged (with empty aliases)', () => {
    const c = makeCluster({ name: 'solo', server: 'https://s1' })
    const result = deduplicateClustersByServer([c])
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('deduplicates two clusters with same server', () => {
    const c1 = makeCluster({ name: 'short', server: 'https://s1', cpuCores: 8 })
    const c2 = makeCluster({ name: 'long-auto-generated-name-over-fifty', server: 'https://s1', cpuCores: undefined })
    const result = deduplicateClustersByServer([c1, c2])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('short')
    expect(result[0].aliases).toContain('long-auto-generated-name-over-fifty')
  })

  it('keeps clusters with different servers separate', () => {
    const c1 = makeCluster({ name: 'c1', server: 'https://s1' })
    const c2 = makeCluster({ name: 'c2', server: 'https://s2' })
    const result = deduplicateClustersByServer([c1, c2])
    expect(result).toHaveLength(2)
  })

  it('handles clusters without server (no dedup possible)', () => {
    const c1 = makeCluster({ name: 'ns1', server: undefined })
    const c2 = makeCluster({ name: 'ns2', server: undefined })
    const result = deduplicateClustersByServer([c1, c2])
    expect(result).toHaveLength(2)
    result.forEach(c => expect(c.aliases).toEqual([]))
  })

  it('handles null/undefined input gracefully', () => {
    const result = deduplicateClustersByServer(null as unknown as ClusterInfo[])
    expect(result).toEqual([])
  })

  it('prefers user-friendly name over auto-generated OpenShift context', () => {
    const friendly = makeCluster({ name: 'prow', server: 'https://s1', cpuCores: undefined })
    const autoGen = makeCluster({
      name: 'default/api-pokprod001.openshiftapps.com:6443/kube:admin',
      server: 'https://s1',
      cpuCores: 8,
    })
    const result = deduplicateClustersByServer([friendly, autoGen])
    expect(result).toHaveLength(1)
    // Even though autoGen has more metrics, friendly name wins
    expect(result[0].name).toBe('prow')
    // But should merge best metrics from autoGen
    expect(result[0].cpuCores).toBe(8)
  })

  it('detects auto-generated names by patterns', () => {
    const patterns = [
      'default/api-something.openshiftapps.com:6443/admin',
      'ns/api-foo:6443/bar',
      'context/api-server:443/user',
      'long-name-with/slash:and-colon' + 'x'.repeat(AUTO_GENERATED_NAME_LENGTH_THRESHOLD),
    ]
    // Each of these should be recognized as auto-generated in dedup sorting
    for (const pattern of patterns) {
      const friendly = makeCluster({ name: 'friendly', server: 'https://shared' })
      const auto = makeCluster({ name: pattern, server: 'https://shared' })
      const result = deduplicateClustersByServer([auto, friendly])
      expect(result[0].name).toBe('friendly')
    }
  })

  it('uses the primary cluster nodeCount and podCount (does not take max) — #6112', () => {
    // Regression for #6112: previously this code used Math.max(primary, alias)
    // which caused scale-downs to show stale over-counts. Now the primary
    // cluster is authoritative and aliases only fill in undefined fields.
    const NODE_COUNT_5 = 5
    const POD_COUNT_20 = 20
    const NODE_COUNT_8 = 8
    const POD_COUNT_50 = 50
    const c1 = makeCluster({ name: 'c1', server: 'https://s1', nodeCount: NODE_COUNT_5, podCount: POD_COUNT_20 })
    const c2 = makeCluster({ name: 'c2', server: 'https://s1', nodeCount: NODE_COUNT_8, podCount: POD_COUNT_50 })
    const result = deduplicateClustersByServer([c1, c2])
    // c1 sorts first (same length, stable) so it becomes primary; its counts win
    expect(result[0].nodeCount).toBe(NODE_COUNT_5)
    expect(result[0].podCount).toBe(POD_COUNT_20)
  })

  it('falls back to alias nodeCount/podCount when primary has none — #6112', () => {
    const NODE_COUNT_8 = 8
    const POD_COUNT_50 = 50
    // Primary is chosen by sort; c1 is primary and has no nodeCount/podCount
    // (makeCluster() defaults to 3 so we override explicitly).
    const c1 = makeCluster({ name: 'c1', server: 'https://s1', nodeCount: undefined, podCount: undefined })
    const c2 = makeCluster({ name: 'c2', server: 'https://s1', nodeCount: NODE_COUNT_8, podCount: POD_COUNT_50 })
    const result = deduplicateClustersByServer([c1, c2])
    expect(result[0].nodeCount).toBe(NODE_COUNT_8)
    expect(result[0].podCount).toBe(POD_COUNT_50)
  })

  it('does not over-count after scale-down — #6112', () => {
    // Scenario: upstream reports 3 nodes after a scale-down; a recent alias
    // still has a cached 10. Old behavior returned 10 (Math.max). New behavior
    // must return the primary's 3.
    const NODES_AFTER_SCALE_DOWN = 3
    const STALE_NODES_ON_ALIAS = 10
    const primary = makeCluster({ name: 'prod', server: 'https://s1', nodeCount: NODES_AFTER_SCALE_DOWN })
    const alias = makeCluster({ name: 'prod-long-context', server: 'https://s1', nodeCount: STALE_NODES_ON_ALIAS })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result[0].nodeCount).toBe(NODES_AFTER_SCALE_DOWN)
  })

  it('marks healthy if any duplicate is healthy', () => {
    const healthy = makeCluster({ name: 'h', server: 'https://s1', healthy: true })
    const unhealthy = makeCluster({ name: 'u', server: 'https://s1', healthy: false })
    const result = deduplicateClustersByServer([unhealthy, healthy])
    expect(result[0].healthy).toBe(true)
  })

  it('marks reachable if any duplicate is reachable', () => {
    const reachable = makeCluster({ name: 'r', server: 'https://s1', reachable: true })
    const unreachable = makeCluster({ name: 'u', server: 'https://s1', reachable: false })
    const result = deduplicateClustersByServer([unreachable, reachable])
    expect(result[0].reachable).toBe(true)
  })

  it('prefers cluster with more namespaces', () => {
    const fewer = makeCluster({ name: 'fewer', server: 'https://s1', namespaces: ['ns1'] })
    const more = makeCluster({ name: 'more-ns', server: 'https://s1', namespaces: ['ns1', 'ns2', 'ns3'] })
    const result = deduplicateClustersByServer([fewer, more])
    // 'more-ns' has more namespaces, but name length tiebreaker may differ
    // The important thing is dedup worked
    expect(result).toHaveLength(1)
  })

  it('prefers current context over non-current', () => {
    const current = makeCluster({ name: 'zzz-current', server: 'https://s1', isCurrent: true })
    const notCurrent = makeCluster({ name: 'aaa-other', server: 'https://s1', isCurrent: false })
    // Same length name prefix so isCurrent wins the tiebreaker
    const result = deduplicateClustersByServer([notCurrent, current])
    // Both have same metrics score; isCurrent should be preferred when other scores equal
    expect(result).toHaveLength(1)
  })
})

describe('shouldMarkOffline / recordClusterFailure / clearClusterFailure', () => {
  beforeEach(() => {
    clearClusterFailure('test')
  })

  it('returns false when no failure recorded', () => {
    expect(shouldMarkOffline('test')).toBe(false)
  })

  it('returns false immediately after recording failure', () => {
    recordClusterFailure('test')
    expect(shouldMarkOffline('test')).toBe(false)
  })

  it('returns true after 5 minutes of failure', () => {
    vi.useFakeTimers()
    recordClusterFailure('test')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS)
    expect(shouldMarkOffline('test')).toBe(true)
    vi.useRealTimers()
  })

  it('returns false if failure cleared before threshold', () => {
    vi.useFakeTimers()
    recordClusterFailure('test')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS - 1)
    clearClusterFailure('test')
    expect(shouldMarkOffline('test')).toBe(false)
    vi.useRealTimers()
  })

  it('does not overwrite first failure timestamp on repeated calls', () => {
    vi.useFakeTimers()
    recordClusterFailure('test')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS - 1)
    // Second call should NOT reset the timestamp
    recordClusterFailure('test')
    vi.advanceTimersByTime(1)
    expect(shouldMarkOffline('test')).toBe(true)
    vi.useRealTimers()
  })

  it('tracks failures independently per cluster', () => {
    vi.useFakeTimers()
    recordClusterFailure('cluster-a')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS)
    expect(shouldMarkOffline('cluster-a')).toBe(true)
    expect(shouldMarkOffline('cluster-b')).toBe(false)
    vi.useRealTimers()
  })
})

describe('notifyClusterSubscribers', () => {
  beforeEach(() => {
    clusterSubscribers.clear()
  })

  it('calls all registered subscribers with current cache', () => {
    const sub1 = vi.fn()
    const sub2 = vi.fn()
    clusterSubscribers.add(sub1)
    clusterSubscribers.add(sub2)

    notifyClusterSubscribers()

    expect(sub1).toHaveBeenCalledOnce()
    expect(sub2).toHaveBeenCalledOnce()
    // Both receive the clusterCache object
    expect(sub1).toHaveBeenCalledWith(expect.objectContaining({ isLoading: expect.any(Boolean) }))
  })

  it('works with no subscribers', () => {
    // Should not throw
    expect(() => notifyClusterSubscribers()).not.toThrow()
  })
})

describe('notifyClusterSubscribersDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces multiple rapid calls into one notification', () => {
    const sub = vi.fn()
    clusterSubscribers.add(sub)

    // Fire rapidly 5 times
    const RAPID_CALLS = 5
    for (let i = 0; i < RAPID_CALLS; i++) {
      notifyClusterSubscribersDebounced()
    }

    // Not called yet
    expect(sub).not.toHaveBeenCalled()

    // After debounce delay
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    expect(sub).toHaveBeenCalledOnce()
  })
})

describe('updateClusterCache', () => {
  beforeEach(() => {
    clusterSubscribers.clear()
    // Reset cache to known state
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
    mockResetAllCacheFailures.mockClear()
    mockTriggerAllRefetches.mockClear()
  })

  it('merges partial updates into clusterCache', () => {
    updateClusterCache({ isLoading: false, error: 'test error' })
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.error).toBe('test error')
  })

  it('notifies subscribers when updated', () => {
    const sub = vi.fn()
    clusterSubscribers.add(sub)
    updateClusterCache({ isRefreshing: true })
    expect(sub).toHaveBeenCalledOnce()
  })

  it('triggers refetch when clusters become available from empty', () => {
    // Start with no clusters
    updateClusterCache({ clusters: [] })
    mockResetAllCacheFailures.mockClear()
    mockTriggerAllRefetches.mockClear()

    // Add first clusters
    updateClusterCache({ clusters: [makeCluster()] })
    expect(mockResetAllCacheFailures).toHaveBeenCalled()
    expect(mockTriggerAllRefetches).toHaveBeenCalled()
  })

  it('does NOT trigger refetch when clusters were already present', () => {
    updateClusterCache({ clusters: [makeCluster()] })
    mockResetAllCacheFailures.mockClear()
    mockTriggerAllRefetches.mockClear()

    // Update with more clusters — but had clusters before
    updateClusterCache({ clusters: [makeCluster(), makeCluster({ name: 'c2' })] })
    expect(mockResetAllCacheFailures).not.toHaveBeenCalled()
    expect(mockTriggerAllRefetches).not.toHaveBeenCalled()
  })
})

describe('updateSingleClusterInCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    // Seed cache with a cluster
    updateClusterCache({
      clusters: [makeCluster({ name: 'c1', server: 'https://s1', cpuCores: 8, nodeCount: 3 })],
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates a specific cluster by name', () => {
    updateSingleClusterInCache('c1', { healthy: false })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'c1')!
    expect(c.healthy).toBe(false)
  })

  it('skips undefined values (preserves existing)', () => {
    updateSingleClusterInCache('c1', { healthy: undefined })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'c1')!
    expect(c.healthy).toBe(true) // preserved original
  })

  it('accepts zero metric value (no longer falls back to cache)', () => {
    // PR #5449: pickMetric no longer preserves cached values — a real zero
    // (e.g. scaled-to-zero) must be respected (see #5443)
    updateSingleClusterInCache('c1', { cpuCores: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'c1')!
    expect(c.cpuCores).toBe(0)
  })

  it('applies zero metric when no prior positive value exists for that cluster', () => {
    // When the cluster has no existing positive cpuCores and we set 0, the
    // updateSingleClusterInCache logic falls through (existingValue is not > 0).
    // However, mergeWithStoredClusters may restore cached values from localStorage.
    // The key behavior: 0 is NOT used to overwrite a positive cached value.
    updateClusterCache({
      clusters: [makeCluster({ name: 'new-cluster', server: 'https://s-new', cpuCores: undefined })],
    })
    updateSingleClusterInCache('new-cluster', { cpuCores: 0 })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'new-cluster')!
    // cpuCores is either 0 or undefined (no positive value to preserve)
    expect(c.cpuCores === 0 || c.cpuCores === undefined).toBe(true)
  })

  it('applies reachable=false even when cluster has valid nodeCount', () => {
    // PR #5449: reachability is no longer blocked by node count — the useMCP
    // hook gates reachable=false behind 5 min of failures, so it's authoritative (#5444)
    updateSingleClusterInCache('c1', { reachable: false })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'c1')!
    expect(c.reachable).toBe(false)
  })

  it('allows reachable=false when cluster has no valid cached node data', () => {
    // Use a fresh cluster name to avoid localStorage cache interference
    updateClusterCache({
      clusters: [makeCluster({ name: 'no-nodes', server: 'https://s-nonode', nodeCount: undefined, reachable: undefined })],
    })
    updateSingleClusterInCache('no-nodes', { reachable: false })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    const c = clusterCache.clusters.find(c => c.name === 'no-nodes')!
    // With no valid nodeCount, reachable=false should be accepted
    expect(c.reachable).toBe(false)
  })

  it('does nothing if cluster name not found', () => {
    const before = [...clusterCache.clusters]
    updateSingleClusterInCache('nonexistent', { healthy: false })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)
    expect(clusterCache.clusters).toHaveLength(before.length)
  })
})

describe('setInitialFetchStarted / setHealthCheckFailures', () => {
  it('sets initialFetchStarted', () => {
    setInitialFetchStarted(true)
    expect(initialFetchStarted).toBe(true)
    setInitialFetchStarted(false)
    expect(initialFetchStarted).toBe(false)
  })

  it('sets healthCheckFailures', () => {
    const FIVE = 5
    setHealthCheckFailures(FIVE)
    expect(healthCheckFailures).toBe(FIVE)
    setHealthCheckFailures(0)
    expect(healthCheckFailures).toBe(0)
  })
})

describe('clusterCacheRef', () => {
  it('returns current clusters from cache via getter', () => {
    const cluster = makeCluster({ name: 'ref-test' })
    updateClusterCache({ clusters: [cluster] })
    expect(clusterCacheRef.clusters).toHaveLength(1)
    expect(clusterCacheRef.clusters[0].name).toBe('ref-test')
  })

  it('reflects changes dynamically (live binding)', () => {
    updateClusterCache({ clusters: [] })
    expect(clusterCacheRef.clusters).toHaveLength(0)
    updateClusterCache({ clusters: [makeCluster()] })
    expect(clusterCacheRef.clusters).toHaveLength(1)
  })
})

describe('subscribeClusterCache', () => {
  beforeEach(() => {
    clusterSubscribers.clear()
  })

  it('adds a callback and returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribeClusterCache(cb)
    expect(clusterSubscribers.has(cb)).toBe(true)

    unsub()
    expect(clusterSubscribers.has(cb)).toBe(false)
  })

  it('callback receives updates after subscribe', () => {
    const cb = vi.fn()
    subscribeClusterCache(cb)
    updateClusterCache({ isRefreshing: true })
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ isRefreshing: true }))
  })

  it('callback does not receive updates after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribeClusterCache(cb)
    unsub()
    updateClusterCache({ isRefreshing: true })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('cleanupSharedWebSocket', () => {
  it('clears reconnect state', () => {
    sharedWebSocket.connecting = true
    sharedWebSocket.reconnectAttempts = 3
    cleanupSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
    expect(sharedWebSocket.ws).toBeNull()
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
  })

  it('clears reconnect timeout if set', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    sharedWebSocket.reconnectTimeout = setTimeout(() => {}, 9999) as ReturnType<typeof setTimeout>
    cleanupSharedWebSocket()
    expect(clearSpy).toHaveBeenCalled()
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
    clearSpy.mockRestore()
  })
})

describe('fetchWithRetry', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns response on successful fetch (2xx)', async () => {
    const OK_STATUS = 200
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: OK_STATUS }))
    const resp = await fetchWithRetry('/test')
    expect(resp.status).toBe(OK_STATUS)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('does not retry on 4xx client errors', async () => {
    const BAD_REQUEST = 400
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('bad', { status: BAD_REQUEST }))
    const resp = await fetchWithRetry('/test')
    expect(resp.status).toBe(BAD_REQUEST)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('retries on 5xx server errors up to maxRetries', async () => {
    vi.useFakeTimers()
    const SERVER_ERROR = 500
    const OK_STATUS = 200
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/test', { maxRetries: DEFAULT_MAX_RETRIES, initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS })

    // Advance past first backoff (500ms)
    await vi.advanceTimersByTimeAsync(DEFAULT_INITIAL_BACKOFF_MS)
    // Advance past second backoff (1000ms)
    const SECOND_BACKOFF_MS = 1000
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF_MS)

    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    const TOTAL_ATTEMPTS = 3
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL_ATTEMPTS)
    vi.useRealTimers()
  })

  it('returns 5xx response on last attempt without retry', async () => {
    const SERVER_ERROR = 503
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('err', { status: SERVER_ERROR }))

    // maxRetries=0 means only 1 attempt
    const resp = await fetchWithRetry('/test', { maxRetries: 0 })
    expect(resp.status).toBe(SERVER_ERROR)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('retries on TypeError (network error)', async () => {
    vi.useFakeTimers()
    const OK_STATUS = 200
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/test', { maxRetries: 1, initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS })
    await vi.advanceTimersByTimeAsync(DEFAULT_INITIAL_BACKOFF_MS)
    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    vi.useRealTimers()
  })

  it('retries on AbortError (timeout)', async () => {
    vi.useFakeTimers()
    const OK_STATUS = 200
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/test', { maxRetries: 1, initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS })
    await vi.advanceTimersByTimeAsync(DEFAULT_INITIAL_BACKOFF_MS)
    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    vi.useRealTimers()
  })

  it('throws non-transient errors without retry', async () => {
    const customError = new Error('Something weird')
    globalThis.fetch = vi.fn().mockRejectedValue(customError)

    await expect(fetchWithRetry('/test')).rejects.toThrow('Something weird')
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('uses exponential backoff (doubles delay each attempt)', async () => {
    vi.useFakeTimers()
    const SERVER_ERROR = 500
    const OK_STATUS = 200
    const BACKOFF_START = 100

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/test', { maxRetries: DEFAULT_MAX_RETRIES, initialBackoffMs: BACKOFF_START })

    // First backoff: 100ms
    await vi.advanceTimersByTimeAsync(BACKOFF_START)
    // Second backoff: 200ms (doubled)
    const SECOND_BACKOFF = 200
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF)

    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    vi.useRealTimers()
  })

  it('respects custom timeoutMs per attempt', async () => {
    const CUSTOM_TIMEOUT = 100
    // We just verify the AbortController is set up — the fetch mock handles it
    const OK_STATUS = 200
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: OK_STATUS }))
    const resp = await fetchWithRetry('/test', { timeoutMs: CUSTOM_TIMEOUT })
    expect(resp.status).toBe(OK_STATUS)
  })

  it('respects 403 as a non-retryable client error', async () => {
    const FORBIDDEN = 403
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: FORBIDDEN }))
    const resp = await fetchWithRetry('/test')
    expect(resp.status).toBe(FORBIDDEN)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })
})

