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
    sessionStorage.clear()
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

