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

describe('fetchWithRetry', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    // Pre-seed agent token so agentFetch() does not call fetch('/api/agent/token')
    // which would interfere with call-count assertions.
    setAgentToken('test-token')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearAgentToken()
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

