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

