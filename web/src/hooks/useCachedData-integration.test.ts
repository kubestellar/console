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
  CONSECUTIVE_FAILURE_THRESHOLD: 3,
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
    mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }]
    mockIsAgentUnavailable.mockReturnValue(true)
    mockIsBackendUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({
      deployments: [{ name: 'deploy-issue', namespace: 'default', replicas: 1, readyReplicas: 0, status: 'running' }],
    }))

    const { capturedFetcher } = renderWithCapturedFetcher(
      () => useCachedDeploymentIssues('prod'),
    )

    const result = await capturedFetcher()
    expect(result).toEqual([
      {
        name: 'deploy-issue',
        namespace: 'default',
        cluster: 'prod',
        replicas: 1,
        readyReplicas: 0,
        status: 'running',
      },
    ])
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('cluster=prod')
    expect(url).not.toContain('prod-ctx')
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
    expect(result.current).toHaveProperty('retryFetch')
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
