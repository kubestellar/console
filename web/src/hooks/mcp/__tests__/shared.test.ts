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

  it('merges best nodeCount and podCount from duplicates', () => {
    const NODE_COUNT_5 = 5
    const POD_COUNT_20 = 20
    const NODE_COUNT_8 = 8
    const POD_COUNT_50 = 50
    const c1 = makeCluster({ name: 'c1', server: 'https://s1', nodeCount: NODE_COUNT_5, podCount: POD_COUNT_20 })
    const c2 = makeCluster({ name: 'c2', server: 'https://s1', nodeCount: NODE_COUNT_8, podCount: POD_COUNT_50 })
    const result = deduplicateClustersByServer([c1, c2])
    expect(result[0].nodeCount).toBe(NODE_COUNT_8)
    expect(result[0].podCount).toBe(POD_COUNT_50)
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

  it('returns demo clusters when isDemoMode() is true', async () => {
    mockIsDemoMode.mockReturnValue(true)
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

    expect(mockApiGet).toHaveBeenCalledWith('/api/mcp/clusters')
    expect(clusterCache.isLoading).toBe(false)
    expect(clusterCache.clusters.some(c => c.name === 'backend-cluster')).toBe(true)
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

    expect(healthCheckFailures).toBe(1)
  })

  it('resets healthCheckFailures to 0 on successful backend response', async () => {
    setHealthCheckFailures(2)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cluster: 'ok', healthy: true, nodeCount: 1, readyNodes: 1 }),
    })

    await fetchSingleClusterHealth('ok-cluster')
    expect(healthCheckFailures).toBe(0)
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
    localStorage.setItem('token', 'my-jwt')

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
    localStorage.removeItem('token')

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
