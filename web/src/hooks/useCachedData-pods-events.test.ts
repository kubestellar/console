import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.hoisted runs before vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockUseCache,
  mockIsBackendUnavailable,
  mockIsAgentUnavailable,
  mockKubectlProxy,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockKubectlProxy: { exec: vi.fn(), getPodIssues: vi.fn() },
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cache')>()
  return {
    ...actual,
    useCache: (...args: unknown[]) => mockUseCache(...args),
    // createCachedHook is a factory that returns a React hook. Hooks that use it
    // are re-exported through useCachedData.ts; this stub prevents load failures
    // when the module is imported in tests that only mock useCache.
    createCachedHook: (_config: unknown) => () => mockUseCache(_config),
  }
})

vi.mock('../lib/api', () => ({
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  authFetch: vi.fn().mockRejectedValue(new Error('authFetch not configured for this test')),
}))

vi.mock('./useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../lib/sseClient', () => ({
  fetchSSE: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/schemas/validate', () => ({
  validateResponse: (_schema: unknown, data: unknown) => data,
  validateArrayResponse: (_schema: unknown, data: unknown) => data,
}))

vi.mock('./mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: vi.fn().mockImplementation((...args: unknown[]) => fetch(args[0] as RequestInfo, args[1] as RequestInit)),
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('./mcp/clusterCacheRef', () => ({
  clusterCacheRef: mockClusterCacheRef,
  setClusterCacheRefClusters: vi.fn(),
}))

vi.mock('../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'token',
} })

vi.mock('../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  AI_PREDICTION_TIMEOUT_MS: 30_000,
} })

// ---------------------------------------------------------------------------
// Import hooks under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  useCachedPods,
  useCachedEvents,
  useCachedPodIssues,
  useCachedDeploymentIssues,
  useCachedDeployments,
  useCachedServices,
  useCachedProwJobs,
  useCachedLLMdServers,
  useCachedLLMdModels,
  useCachedWarningEvents,
  useCachedSecurityIssues,
  useCachedNodes,
} from './useCachedData'
// Import the same (mocked) constant the hook uses so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173). The vi.mock
// of '../lib/constants' above overrides LOCAL_AGENT_HTTP_URL to the test
// value, and this import resolves through that mock.
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Response with both .json() and .text() (fetchAPI uses response.text()) */
function mockResponse(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}) {
  const text = JSON.stringify(body)
  return {
    ok,
    status,
    json: async () => body,
    text: async () => text,
  }
}

/** Default cache result shape returned by the mocked useCache */
function defaultCacheResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    retryFetch: vi.fn(),
    clearAndRefetch: vi.fn(),
    ...overrides,
  }
}

/**
 * Render a hook and capture the fetcher that was passed to useCache.
 * Returns both the hook result and the captured fetcher function.
 */
function renderWithCapturedFetcher<T>(
  hookFn: () => T,
  cacheData: unknown = [],
  overrides: Record<string, unknown> = {},
) {
  let capturedFetcher: (() => Promise<unknown>) | undefined
  let capturedOptions: Record<string, unknown> | undefined

  mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
    capturedFetcher = opts.fetcher as () => Promise<unknown>
    capturedOptions = opts
    return defaultCacheResult(cacheData, overrides)
  })

  const hookResult = renderHook(hookFn)
  return { hookResult, capturedFetcher: capturedFetcher!, capturedOptions: capturedOptions! }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockClusterCacheRef.clusters = []
  mockIsBackendUnavailable.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(false)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ============================================================================
// fetchAPI internals (tested indirectly via hook fetchers)
// ============================================================================

describe('fetchAPI internals (via useCachedPods)', () => {
  it('throws "No authentication token" when localStorage has no token', async () => {
    localStorage.removeItem('token')
    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster'),
    )
    await expect(capturedFetcher()).rejects.toThrow('No authentication token')
  })

  it('constructs correct URL with query params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ pods: [] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster', 'default'),
    )
    await capturedFetcher()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`${LOCAL_AGENT_HTTP_URL}/pods?`),
      expect.any(Object),
    )
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('cluster=test-cluster')
    expect(url).toContain('namespace=default')
  })

  it('sets Authorization: Bearer <token> header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ pods: [] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster'),
    )
    await capturedFetcher()

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].headers.Authorization).toBe('Bearer test-token')
  })

  it('throws "API error: 401" on non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster'),
    )
    await expect(capturedFetcher()).rejects.toThrow('API error: 401')
  })

  it('throws "API error: 500" on server error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster'),
    )
    await expect(capturedFetcher()).rejects.toThrow('API error: 500')
  })

  it('uses AbortSignal.timeout on fetch requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ pods: [] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test-cluster'),
    )
    await capturedFetcher()

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].signal).toBeDefined()
  })
})

// ============================================================================
// useCachedPods
// ============================================================================

describe('useCachedPods', () => {
  it('returns loading state on initial mount', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { isLoading: true }))
    const { result } = renderHook(() => useCachedPods())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.pods).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns pod data after successful fetch', () => {
    const mockPods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', restarts: 0 },
      { name: 'pod-2', namespace: 'kube-system', status: 'Running', restarts: 3 },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockPods))
    const { result } = renderHook(() => useCachedPods())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.pods).toEqual(mockPods)
    expect(result.current.data).toEqual(mockPods)
    expect(result.current.error).toBeNull()
  })

  it('returns error state on HTTP 500', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { error: 'API error: 500', isFailed: true }))
    const { result } = renderHook(() => useCachedPods())

    expect(result.current.error).toBe('API error: 500')
    expect(result.current.isFailed).toBe(true)
    expect(result.current.pods).toEqual([])
  })

  it('passes cluster and namespace params to useCache key', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedPods('prod-east', 'monitoring'))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pods:prod-east:monitoring:100',
        category: 'pods',
      }),
    )
  })

  it('uses "all" in cache key when no cluster/namespace specified', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedPods())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pods:all:all:100',
      }),
    )
  })

  it('respects custom limit option', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedPods(undefined, undefined, { limit: 50 }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pods:all:all:50',
      }),
    )
  })

  it('exposes refetch function', () => {
    const mockRefetch = vi.fn()
    mockUseCache.mockReturnValue(defaultCacheResult([], { refetch: mockRefetch }))
    const { result } = renderHook(() => useCachedPods())

    expect(result.current.refetch).toBe(mockRefetch)
  })

  it('fetcher sorts pods by restarts descending and slices to limit', async () => {
    const unsortedPods = [
      { name: 'pod-a', restarts: 1 },
      { name: 'pod-b', restarts: 10 },
      { name: 'pod-c', restarts: 5 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ pods: unsortedPods }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods('test', undefined, { limit: 2 }),
    )
    const result = await capturedFetcher() as Array<{ name: string; restarts: number }>

    expect(result).toHaveLength(2)
    expect(result[0].restarts).toBe(10)
    expect(result[1].restarts).toBe(5)
  })

  it('returns isDemoFallback and isRefreshing flags', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], {
      isDemoFallback: true,
      isRefreshing: true,
    }))
    const { result } = renderHook(() => useCachedPods())

    expect(result.current.isDemoFallback).toBe(true)
    expect(result.current.isRefreshing).toBe(true)
  })
})

// ============================================================================
// useCachedEvents
// ============================================================================

describe('useCachedEvents', () => {
  it('returns events data after successful fetch', () => {
    const mockEvents = [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', lastSeen: '2026-01-01T00:01:00Z' },
      { type: 'Normal', reason: 'Started', message: 'Container started', lastSeen: '2026-01-01T00:00:00Z' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockEvents))
    const { result } = renderHook(() => useCachedEvents())

    expect(result.current.events).toEqual(mockEvents)
    expect(result.current.isLoading).toBe(false)
  })

  it('uses realtime refresh category by default', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedEvents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'realtime',
      }),
    )
  })

  it('includes cluster and namespace in cache key', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedEvents('prod-east', 'default'))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'events:prod-east:default:20',
      }),
    )
  })

  it('fetcher passes limit param to API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ events: [] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedEvents('test', undefined, { limit: 10 }),
    )
    await capturedFetcher()

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('limit=10')
  })

  it('fetcher returns events from single cluster with cluster param', async () => {
    const mockEvents = [
      { type: 'Warning', reason: 'BackOff', message: 'test' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ events: mockEvents }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedEvents('prod-east'),
    )
    const events = await capturedFetcher()
    expect(events).toEqual(mockEvents)
  })
})

// ============================================================================
// useCachedDeploymentIssues
// ============================================================================

describe('useCachedDeploymentIssues', () => {
  it('returns issues array even when empty', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedDeploymentIssues())

    expect(result.current.issues).toEqual([])
    expect(result.current.issues).not.toBeUndefined()
    expect(Array.isArray(result.current.issues)).toBe(true)
  })

  it('derives deployment issues from cached deployments', () => {
    const mockDeployments = [
      { name: 'web-app', namespace: 'prod', cluster: 'prod', replicas: 3, readyReplicas: 1, status: 'running' },
      { name: 'healthy-app', namespace: 'prod', cluster: 'prod', replicas: 2, readyReplicas: 2, status: 'running' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockDeployments))
    const { result } = renderHook(() => useCachedDeploymentIssues())

    expect(result.current.issues).toEqual([
      { name: 'web-app', namespace: 'prod', cluster: 'prod', replicas: 3, readyReplicas: 1, reason: 'ReplicaFailure', message: '' },
    ])
    expect(result.current.data).toEqual(result.current.issues)
  })

  it('uses deployments refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedDeploymentIssues())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'deployments',
      }),
    )
  })

  it('fetcher reuses deployments from the agent path', async () => {
    mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }]
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({
      deployments: [
        { name: 'web-app', namespace: 'prod', replicas: 3, readyReplicas: 1, status: 'running' },
        { name: 'api-gw', namespace: 'prod', replicas: 2, readyReplicas: 2, status: 'running' },
      ],
    }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )
    const deployments = await capturedFetcher() as Array<{ name: string; cluster: string }>

    expect(deployments).toEqual([
      { name: 'web-app', namespace: 'prod', replicas: 3, readyReplicas: 1, status: 'running', cluster: 'prod' },
      { name: 'api-gw', namespace: 'prod', replicas: 2, readyReplicas: 2, status: 'running', cluster: 'prod' },
    ])
  })

  it('fetcher reuses deployments from the REST fallback', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({
      deployments: [
        { name: 'failing-deploy', namespace: 'prod', replicas: 2, readyReplicas: 0, status: 'failed' },
        { name: 'healthy-deploy', namespace: 'prod', replicas: 2, readyReplicas: 2, status: 'running' },
      ],
    }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )
    const result = await capturedFetcher()

    expect(result).toEqual([
      {
        name: 'failing-deploy',
        namespace: 'prod',
        cluster: 'prod',
        replicas: 2,
        readyReplicas: 0,
        status: 'failed',
      },
      {
        name: 'healthy-deploy',
        namespace: 'prod',
        cluster: 'prod',
        replicas: 2,
        readyReplicas: 2,
        status: 'running',
      },
    ])
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain(`${LOCAL_AGENT_HTTP_URL}/deployments?`)
    expect(url).toContain('cluster=prod')
  })

  it('fetcher throws when both agent and backend unavailable', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(true)

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues(),
    )
    await expect(capturedFetcher()).rejects.toThrow('No data source available')
  })
})
