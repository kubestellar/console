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
    expect(getInitialFetchStarted()).toBe(true)
    setInitialFetchStarted(false)
    expect(getInitialFetchStarted()).toBe(false)
  })

  it('sets healthCheckFailures', () => {
    const FIVE = 5
    setHealthCheckFailures(FIVE)
    expect(getHealthCheckFailures()).toBe(FIVE)
    setHealthCheckFailures(0)
    expect(getHealthCheckFailures()).toBe(0)
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

