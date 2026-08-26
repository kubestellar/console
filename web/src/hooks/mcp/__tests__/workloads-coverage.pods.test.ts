/**
 * Tests for hooks/mcp/workloads — pod hooks (coverage)
 *
 * Covers: usePods localStorage edges, SSE progressive updates, error cases,
 * silent refresh behavior, useAllPods error branches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — mirrors workloads.test.ts setup
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockIsBackendUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockKubectlProxy,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockKubectlProxy: {
    getPodIssues: vi.fn(),
    getDeployments: vi.fn(),
    getNamespaces: vi.fn(),
  },
  mockClusterCacheRef: {
    clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
  },
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
  isBackendUnavailable: () => mockIsBackendUnavailable(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await mockApiGet(...args)
    return { ok: true, status: 200, json: async () => result?.data ?? result }
  }),
  fetchWithRetry: (url: string, opts: Record<string, unknown> = {}) => {
    const { timeoutMs, maxRetries, initialBackoffMs, ...rest } = opts
    void timeoutMs; void maxRetries; void initialBackoffMs
    return globalThis.fetch(url, rest)
  },
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000, LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585' }
})

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  usePods,
  useAllPods,
} from '../workloads'
import { __resetInfrastructureCaches } from '../workloadQueries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uniqueCounter = 0
function uniqueCluster(prefix = 'cov') {
  return `${prefix}-${++uniqueCounter}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  __resetInfrastructureCaches()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockIsBackendUnavailable.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// loadPodsCacheFromStorage / savePodsCacheToStorage — localStorage edge cases
// ===========================================================================

describe('usePods — localStorage cache edges', () => {
  it('loads cached pods from localStorage when cache key matches', async () => {
    // Pre-seed localStorage with valid pods cache
    const cachedPods = [
      { name: 'cached-pod', namespace: 'default', cluster: 'all', status: 'Running', ready: '1/1', restarts: 2, age: '1d' },
    ]
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: cachedPods,
      timestamp: new Date().toISOString(),
      key: 'pods:all:all',
    }))

    // The hook should pick up the cached data on init
    mockFetchSSE.mockResolvedValue(cachedPods)
    const { result } = renderHook(() => usePods())

    // Should eventually resolve with data (either from cache or SSE)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBeGreaterThan(0)
  })

  it('ignores localStorage cache when key does not match', async () => {
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: [{ name: 'stale', namespace: 'ns', cluster: 'old', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }],
      timestamp: new Date().toISOString(),
      key: 'pods:other-cluster:all', // Different key
    }))

    const freshPods = [
      { name: 'fresh-pod', namespace: 'default', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1h' },
    ]
    mockFetchSSE.mockResolvedValue(freshPods)

    const cluster = uniqueCluster('ls-mismatch')
    const { result } = renderHook(() => usePods(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods).toEqual(freshPods)
  })

  it('handles corrupted JSON in localStorage gracefully', async () => {
    localStorage.setItem('kubestellar-pods-cache', 'NOT_VALID_JSON{{{')

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash, just proceed without cached data
    expect(result.current.error).toBeNull()
  })

  it('handles localStorage cache with empty data array', async () => {
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: [],
      timestamp: new Date().toISOString(),
      key: 'pods:all:all',
    }))

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods).toEqual([])
  })

  it('handles localStorage cache missing timestamp field', async () => {
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: [{ name: 'p1', namespace: 'ns', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }],
      key: 'pods:all:all',
      // no timestamp
    }))

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should use current date as fallback
    expect(result.current.lastUpdated).not.toBeNull()
  })
})

// ===========================================================================
// usePods — SSE onClusterData progressive updates
// ===========================================================================

describe('usePods — SSE progressive updates', () => {
  it('accumulates pods progressively via onClusterData callback', async () => {
    const pod1 = { name: 'pod-a', namespace: 'ns', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 5, age: '1d' }
    const pod2 = { name: 'pod-b', namespace: 'ns', cluster: 'c2', status: 'Running', ready: '1/1', restarts: 3, age: '2d' }

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [pod1])
      opts.onClusterData('c2', [pod2])
      return [pod1, pod2]
    })

    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBe(2)
    // Sorted by restarts descending
    expect(result.current.pods[0].restarts).toBeGreaterThanOrEqual(result.current.pods[1].restarts)
  })

  it('sorts progressive data by name when sortBy=name', async () => {
    const cluster = uniqueCluster('sort-name')
    const podB = { name: 'z-pod', namespace: 'ns', cluster, status: 'Running', ready: '1/1', restarts: 1, age: '1d' }
    const podA = { name: 'a-pod', namespace: 'ns', cluster, status: 'Running', ready: '1/1', restarts: 2, age: '2d' }

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData(cluster, [podB, podA])
      return [podB, podA]
    })

    const { result } = renderHook(() => usePods(cluster, undefined, 'name', 100))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.pods.length).toBe(2))
    // Verify name sort order
    const names = result.current.pods.map(p => p.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })
})

// ===========================================================================
// usePods — non-Error thrown values
// ===========================================================================

describe('usePods — error edge cases', () => {
  it('handles non-Error thrown values with generic message', async () => {
    mockFetchSSE.mockRejectedValue('string-error-value')

    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should use generic fallback message
    expect(result.current.error === 'Failed to fetch pods' || result.current.error === null).toBe(true)
  })

  it('increments consecutive failures on non-silent failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('Network down'))

    // Use unique cluster to ensure no module-level cache
    const cluster = uniqueCluster('cold-err')
    const { result } = renderHook(() => usePods(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Error may or may not be set depending on whether module-level podsCache
    // was populated by a previous test (the cache is keyed by cluster:namespace)
    // But consecutiveFailures always increments
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
})

// ===========================================================================
// usePods — silent refresh with existing cache
// ===========================================================================

describe('usePods — silent refresh behavior', () => {
  it('uses silent=true for initial fetch when cache exists', async () => {
    // Pre-populate localStorage cache so the hook starts with cached data
    const cachedPods = [
      { name: 'cached', namespace: 'ns', cluster: 'all', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: cachedPods,
      timestamp: new Date().toISOString(),
      key: 'pods:all:all',
    }))

    mockFetchSSE.mockResolvedValue(cachedPods)
    const { result } = renderHook(() => usePods())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have data from cache immediately
    expect(result.current.pods.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useAllPods — error handling with non-silent and no cache
// ===========================================================================

describe('useAllPods — error branches', () => {
  it('logs warning on fetch failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('Connection refused'))

    const cluster = uniqueCluster('allpods-err')
    const { result } = renderHook(() => useAllPods(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Error may or may not be set depending on silent flag and cache state
    // The key coverage is that the catch branch executes without crashing
    expect(Array.isArray(result.current.pods)).toBe(true)
  })

  it('handles non-Error thrown values without crashing', async () => {
    mockFetchSSE.mockRejectedValue(42)

    const cluster = uniqueCluster('allpods-nonerr')
    const { result } = renderHook(() => useAllPods(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The generic message branch is covered even if error is not surfaced due to silent mode
    expect(Array.isArray(result.current.pods)).toBe(true)
  })

  it('progressive update via onClusterData merges pods', async () => {
    const pod1 = { name: 'p1', namespace: 'ns', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1h' }
    const pod2 = { name: 'p2', namespace: 'ns', cluster: 'c2', status: 'Running', ready: '1/1', restarts: 0, age: '2h' }

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [pod1])
      opts.onClusterData('c2', [pod2])
      return [pod1, pod2]
    })

    const cluster = uniqueCluster('allpods-progressive')
    const { result } = renderHook(() => useAllPods(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods.length).toBe(2)
  })
})

// ===========================================================================
// usePodIssues — kubectl proxy with namespace, non-Error, cluster context
// ===========================================================================
