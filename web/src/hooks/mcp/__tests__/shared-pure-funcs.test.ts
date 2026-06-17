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

  it('getLocalAgentURL is re-exported as a function', () => {
    expect(typeof getLocalAgentURL).toBe('function')
    expect(typeof getLocalAgentURL()).toBe('string')
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
    expect(result).toHaveLength(24) // 23 chars + ellipsis character
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
      nodeCount: undefined,
      podCount: undefined,
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
    const withCapacity = makeCluster({ name: 'b', server: 'https://s1', nodeCount: undefined, cpuCores: 8, cpuRequestsCores: undefined })
    const emptyTarget = makeCluster({ name: 'c', server: 'https://s1', nodeCount: undefined, cpuCores: undefined, cpuRequestsCores: undefined })

    const result = shareMetricsBetweenSameServerClusters([withNodes, withCapacity, emptyTarget])
    const target = result.find(c => c.name === 'c')!
    // 'a' has nodeCount=5 (score=4), should be the source for nodeCount
    expect(target.nodeCount).toBe(5)
  })

  it('copies healthy and reachable flags when copying node data', () => {
    const source = makeCluster({ name: 'src', server: 'https://s1', nodeCount: 3, healthy: true, reachable: true })
    const empty = makeCluster({ name: 'dst', server: 'https://s1', nodeCount: undefined, healthy: false, reachable: false })
    const result = shareMetricsBetweenSameServerClusters([source, empty])
    const dst = result.find(c => c.name === 'dst')!
    expect(dst.healthy).toBe(true)
    expect(dst.reachable).toBe(true)
  })
})
