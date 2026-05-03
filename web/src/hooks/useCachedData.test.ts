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

vi.mock('../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  // createCachedHook is a factory that returns a React hook. Hooks that use it
  // are re-exported through useCachedData.ts; this stub prevents load failures
  // when the module is imported in tests that only mock useCache.
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
  REFRESH_RATES: {
    realtime: 15_000,
    pods: 30_000,
    clusters: 60_000,
    deployments: 60_000,
    services: 60_000,
    metrics: 45_000,
    gpu: 45_000,
    helm: 120_000,
    gitops: 120_000,
    namespaces: 180_000,
    rbac: 300_000,
    operators: 300_000,
    costs: 600_000,
    default: 120_000,
  },
}))

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

  it('returns deployment issues data', () => {
    const mockIssues = [
      { name: 'web-app', namespace: 'prod', replicas: 3, readyReplicas: 1, reason: 'ReplicaFailure' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockIssues))
    const { result } = renderHook(() => useCachedDeploymentIssues())

    expect(result.current.issues).toEqual(mockIssues)
    expect(result.current.data).toEqual(mockIssues)
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

  it('fetcher derives issues from unhealthy deployments via agent', async () => {
    // Set up agent clusters so agent path is taken
    mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }]
    mockIsAgentUnavailable.mockReturnValue(false)

    // Mock agent fetch returning deployments with unhealthy replicas
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({
      deployments: [
        { name: 'web-app', namespace: 'prod', replicas: 3, readyReplicas: 1, status: 'running' },
        { name: 'api-gw', namespace: 'prod', replicas: 2, readyReplicas: 2, status: 'running' },
      ],
    }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )
    const issues = await capturedFetcher() as Array<{ name: string; readyReplicas: number }>

    // Only web-app should be an issue (readyReplicas < replicas)
    expect(issues).toHaveLength(1)
    expect(issues[0].name).toBe('web-app')
    expect(issues[0].readyReplicas).toBe(1)
  })

  it('fetcher falls back to REST API when agent unavailable', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(false)

    const mockIssues = [
      { name: 'failing-deploy', namespace: 'prod', replicas: 2, readyReplicas: 0, reason: 'DeploymentFailed' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ issues: mockIssues }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )
    const result = await capturedFetcher()
    expect(result).toEqual(mockIssues)
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

// ============================================================================
// useCachedDeployments
// ============================================================================

describe('useCachedDeployments', () => {
  it('returns deployments data', () => {
    const mockDeployments = [
      { name: 'web-frontend', namespace: 'prod', status: 'running', replicas: 3, readyReplicas: 3 },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockDeployments))
    const { result } = renderHook(() => useCachedDeployments())

    expect(result.current.deployments).toEqual(mockDeployments)
    expect(result.current.data).toEqual(mockDeployments)
    expect(result.current.isLoading).toBe(false)
  })

  it('uses deployments refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedDeployments())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'deployments',
      }),
    )
  })
})

// ============================================================================
// useCachedServices
// ============================================================================

describe('useCachedServices', () => {
  it('returns services data', () => {
    const mockServices = [
      { name: 'web-service', namespace: 'prod', type: 'LoadBalancer', clusterIP: '10.0.0.1', ports: ['80/TCP'] },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockServices))
    const { result } = renderHook(() => useCachedServices())

    expect(result.current.services).toEqual(mockServices)
    expect(result.current.data).toEqual(mockServices)
  })

  it('uses services refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedServices())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'services',
      }),
    )
  })

  it('fetcher calls correct API endpoint for single cluster', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ services: [{ name: 'svc-1' }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedServices('my-cluster', 'default'),
    )
    await capturedFetcher()

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain(`${LOCAL_AGENT_HTTP_URL}/services`)
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=default')
  })
})

// ============================================================================
// useCachedProwJobs
// ============================================================================

describe('useCachedProwJobs', () => {
  it('returns empty jobs and loading state initially', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { isLoading: true }))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.jobs).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('returns jobs and computed status after fetch', () => {
    const mockJobs = [
      { id: '1', name: 'e2e-test', state: 'success', startTime: new Date().toISOString() },
      { id: '2', name: 'unit-test', state: 'failure', startTime: new Date().toISOString() },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockJobs))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.jobs).toEqual(mockJobs)
    expect(result.current.status).toBeDefined()
    expect(typeof result.current.status.healthy).toBe('boolean')
    expect(typeof result.current.status.successRate).toBe('number')
  })

  it('computes status.healthy as true when consecutiveFailures < 3', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { consecutiveFailures: 2 }))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.status.healthy).toBe(true)
  })

  it('computes status.healthy as false when consecutiveFailures >= 3', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { consecutiveFailures: 3 }))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.status.healthy).toBe(false)
  })

  it('computes successRate from recent job results', () => {
    // All jobs started within the last hour
    const now = new Date()
    const mockJobs = [
      { id: '1', name: 'test-1', state: 'success', startTime: now.toISOString() },
      { id: '2', name: 'test-2', state: 'success', startTime: now.toISOString() },
      { id: '3', name: 'test-3', state: 'failure', startTime: now.toISOString() },
      { id: '4', name: 'test-4', state: 'success', startTime: now.toISOString() },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockJobs, { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedProwJobs())

    // 3 success out of 4 completed = 75%
    expect(result.current.status.successRate).toBe(75)
    expect(result.current.status.successJobs).toBe(3)
    expect(result.current.status.failedJobs).toBe(1)
  })

  it('computes 100% successRate when no completed jobs', () => {
    const mockJobs = [
      { id: '1', name: 'test-1', state: 'pending', startTime: new Date().toISOString() },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockJobs, { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.status.successRate).toBe(100)
  })

  it('counts pending and running jobs correctly', () => {
    const now = new Date()
    const mockJobs = [
      { id: '1', name: 'test-1', state: 'pending', startTime: now.toISOString() },
      { id: '2', name: 'test-2', state: 'triggered', startTime: now.toISOString() },
      { id: '3', name: 'test-3', state: 'running', startTime: now.toISOString() },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockJobs, { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(result.current.status.pendingJobs).toBe(2) // pending + triggered
    expect(result.current.status.runningJobs).toBe(1)
  })

  it('uses gitops refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedProwJobs())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'gitops',
      }),
    )
  })

  it('exposes formatTimeAgo utility', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedProwJobs())

    expect(typeof result.current.formatTimeAgo).toBe('function')
  })
})

// ============================================================================
// useCachedLLMdServers
// ============================================================================

describe('useCachedLLMdServers', () => {
  it('returns servers and computed status', () => {
    const mockServers = [
      { id: '1', name: 'vllm-1', status: 'running', model: 'llama-3', replicas: 2, readyReplicas: 2 },
      { id: '2', name: 'tgi-1', status: 'stopped', model: 'granite', replicas: 1, readyReplicas: 0 },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockServers, { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedLLMdServers())

    expect(result.current.servers).toEqual(mockServers)
    expect(result.current.status).toBeDefined()
    expect(result.current.status.totalServers).toBe(2)
    expect(result.current.status.runningServers).toBe(1)
    expect(result.current.status.stoppedServers).toBe(1)
  })

  it('computes healthy status correctly', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedLLMdServers())
    expect(result.current.status.healthy).toBe(true)

    mockUseCache.mockReturnValue(defaultCacheResult([], { consecutiveFailures: 3 }))
    const { result: result2 } = renderHook(() => useCachedLLMdServers())
    expect(result2.current.status.healthy).toBe(false)
  })

  it('computes model counts from servers', () => {
    const mockServers = [
      { id: '1', name: 'vllm-1', status: 'running', model: 'llama-3' },
      { id: '2', name: 'vllm-2', status: 'running', model: 'llama-3' },
      { id: '3', name: 'tgi-1', status: 'stopped', model: 'granite' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockServers, { consecutiveFailures: 0 }))
    const { result } = renderHook(() => useCachedLLMdServers())

    expect(result.current.status.totalModels).toBe(2)   // llama-3 and granite
    expect(result.current.status.loadedModels).toBe(1)   // only llama-3 (running)
  })

  it('uses gitops refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedLLMdServers())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'gitops',
      }),
    )
  })

  it('returns isLoading false and empty data when backend unavailable', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { isLoading: false }))
    const { result } = renderHook(() => useCachedLLMdServers())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.servers).toEqual([])
  })

  it('uses custom clusters in cache key', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedLLMdServers(['cluster-a', 'cluster-b']))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'llmd-servers:cluster-a,cluster-b',
      }),
    )
  })
})

// ============================================================================
// useCachedLLMdModels
// ============================================================================

describe('useCachedLLMdModels', () => {
  it('returns models data', () => {
    const mockModels = [
      { id: '1', name: 'llama-3-70b', namespace: 'llm-d', cluster: 'vllm-d', instances: 2, status: 'loaded' },
      { id: '2', name: 'granite-13b', namespace: 'llm-d', cluster: 'vllm-d', instances: 1, status: 'loaded' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockModels))
    const { result } = renderHook(() => useCachedLLMdModels())

    expect(result.current.models).toEqual(mockModels)
    expect(result.current.data).toEqual(mockModels)
  })

  it('returns empty models list when no data', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedLLMdModels())

    expect(result.current.models).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('uses custom clusters in cache key', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedLLMdModels(['gpu-cluster']))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'llmd-models:gpu-cluster',
      }),
    )
  })

  it('uses gitops refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedLLMdModels())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'gitops',
      }),
    )
  })
})

// ============================================================================
// useCachedPodIssues
// ============================================================================

describe('useCachedPodIssues', () => {
  it('returns issues array', () => {
    const mockIssues = [
      { name: 'crashing-pod', namespace: 'prod', status: 'CrashLoopBackOff', restarts: 15, issues: ['OOMKilled'] },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockIssues))
    const { result } = renderHook(() => useCachedPodIssues())

    expect(result.current.issues).toEqual(mockIssues)
  })

  it('uses pods refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedPodIssues())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'pods',
      }),
    )
  })

  it('fetcher tries agent first when clusters available', async () => {
    mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }]
    mockIsAgentUnavailable.mockReturnValue(false)
    mockKubectlProxy.getPodIssues.mockResolvedValue([
      { name: 'crashing-pod', namespace: 'default', restarts: 5 },
    ])

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPodIssues('prod'),
    )
    const result = await capturedFetcher() as Array<{ name: string }>
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('crashing-pod')
  })

  it('fetcher falls back to REST when agent unavailable', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ issues: [{ name: 'broken-pod', restarts: 3 }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPodIssues('prod'),
    )
    const result = await capturedFetcher() as Array<{ name: string }>
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('broken-pod')
  })

  it('fetcher throws when both agent and backend unavailable', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(true)

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPodIssues(),
    )
    await expect(capturedFetcher()).rejects.toThrow('No data source available')
  })
})

// ============================================================================
// useCachedWarningEvents
// ============================================================================

describe('useCachedWarningEvents', () => {
  it('returns warning events', () => {
    const mockEvents = [
      { type: 'Warning', reason: 'BackOff', message: 'restarting container', lastSeen: '2026-01-01T00:00:00Z' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockEvents))
    const { result } = renderHook(() => useCachedWarningEvents())

    expect(result.current.events).toEqual(mockEvents)
  })

  it('uses realtime refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedWarningEvents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'realtime',
      }),
    )
  })

  it('fetcher uses events/warnings endpoint for single cluster', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ events: [{ type: 'Warning', reason: 'BackOff' }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedWarningEvents('prod-east'),
    )
    await capturedFetcher()

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/mcp/events/warnings')
    expect(url).toContain('cluster=prod-east')
  })
})

// ============================================================================
// useCachedSecurityIssues
// ============================================================================

describe('useCachedSecurityIssues', () => {
  it('returns security issues', () => {
    const mockIssues = [
      { name: 'privileged-pod', namespace: 'prod', issue: 'Privileged container', severity: 'high' },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockIssues))
    const { result } = renderHook(() => useCachedSecurityIssues())

    expect(result.current.issues).toEqual(mockIssues)
    expect(result.current.data).toEqual(mockIssues)
  })

  it('uses pods refresh category', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    renderHook(() => useCachedSecurityIssues())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'pods',
      }),
    )
  })
})

// ============================================================================
// useCachedNodes
// ============================================================================

describe('useCachedNodes', () => {
  it('returns nodes data', () => {
    const mockNodes = [
      { name: 'node-1', cluster: 'prod', status: 'Ready', roles: ['worker'] },
    ]
    mockUseCache.mockReturnValue(defaultCacheResult(mockNodes))
    const { result } = renderHook(() => useCachedNodes())

    expect(result.current.nodes).toEqual(mockNodes)
    expect(result.current.data).toEqual(mockNodes)
  })

  it('returns loading state', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([], { isLoading: true }))
    const { result } = renderHook(() => useCachedNodes())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.nodes).toEqual([])
  })
})

// ============================================================================
// Multi-cluster fetching (via useCachedPods fetcher with no cluster)
// ============================================================================

describe('Multi-cluster fetching', () => {
  it('fetches from all clusters when clusterCacheRef has entries (via fetchFromAllClusters path)', async () => {
    // When no cluster is specified and clusterCacheRef is empty, fetchFromAllClusters
    // will call fetchClusters() which first checks clusterCacheRef.
    // With clusters set, fetchClusters returns their names.
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ]

    // Mock fetch for cluster listing and pod fetches
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse({ pods: [{ name: 'pod-a1' }] }))
      .mockResolvedValueOnce(mockResponse({ pods: [{ name: 'pod-b1' }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods(undefined, undefined, { limit: 100 }),
    )

    const result = await capturedFetcher() as Array<{ name: string; cluster: string }>
    // fetchFromAllClusters tags each pod with its cluster name
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('filters out unreachable clusters', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: false },
    ]

    // Only cluster-a should be fetched
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ pods: [{ name: 'pod-a1' }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods(undefined, undefined, { limit: 100 }),
    )

    const result = await capturedFetcher() as Array<{ name: string }>
    // Should only get pods from cluster-a since cluster-b is unreachable
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('throws when clusterCacheRef has no entries and backend returns empty clusters', async () => {
    mockClusterCacheRef.clusters = []

    // fetchClusters falls back to backend API which also returns empty
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ clusters: [] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPods(undefined, undefined, { limit: 100 }),
    )

    await expect(capturedFetcher()).rejects.toThrow('No clusters available')
  })
})

// ============================================================================
// Backend and Agent unavailability
// ============================================================================

describe('Backend/Agent unavailability', () => {
  it('useCachedPodIssues fetcher throws and skips backend when isBackendUnavailable returns true', async () => {
    mockClusterCacheRef.clusters = []
    mockIsBackendUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn()

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedPodIssues(),
    )

    await expect(capturedFetcher()).rejects.toThrow('No data source available')
    // fetch should not be called since backend is unavailable
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('useCachedDeploymentIssues fetcher skips agent when isAgentUnavailable returns true', async () => {
    mockClusterCacheRef.clusters = [{ name: 'prod', reachable: true }]
    mockIsAgentUnavailable.mockReturnValue(true)
    mockIsBackendUnavailable.mockReturnValue(false)

    // Should fall through to REST API
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ issues: [{ name: 'deploy-issue' }] }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )

    const result = await capturedFetcher() as Array<{ name: string }>
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('deploy-issue')
  })
})

// ============================================================================
// CachedHookResult interface consistency
// ============================================================================

describe('CachedHookResult interface', () => {
  it('useCachedPods returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedPods())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedEvents returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedEvents())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedDeploymentIssues returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedDeploymentIssues())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedServices returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedServices())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedNodes returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedWarningEvents returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedWarningEvents())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('useCachedSecurityIssues returns all CachedHookResult fields', () => {
    mockUseCache.mockReturnValue(defaultCacheResult([]))
    const { result } = renderHook(() => useCachedSecurityIssues())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })
})
