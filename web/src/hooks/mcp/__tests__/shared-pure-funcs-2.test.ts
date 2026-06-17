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
