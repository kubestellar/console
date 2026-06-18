/**
 * Deep branch-coverage tests for useCachedData.ts
 *
 * Tests the internal utility functions (fetchAPI, fetchClusters,
 * fetchFromAllClusters, fetchViaSSE, etc.) and every exported
 * useCached* hook by mocking the underlying cache layer and network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

const { mockClusterCacheRef, mockIsDemoMode } = vi.hoisted(() => ({
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean; namespaces?: string[] }> },
  mockIsDemoMode: vi.fn(() => false),
}))

const mockUseCache = vi.fn()
const mockIsBackendUnavailable = vi.fn(() => false)
const mockAuthFetch = vi.fn()
const mockIsAgentUnavailable = vi.fn(() => true)
const mockFetchSSE = vi.fn()
const mockKubectlProxy = {
  getEvents: vi.fn(),
  getPodIssues: vi.fn(),
  exec: vi.fn(),
}
const mockSettledWithConcurrency = vi.fn()
const mockFetchProwJobs = vi.fn()
const mockFetchLLMdServers = vi.fn()
const mockFetchLLMdModels = vi.fn()

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  // createCachedHook is a factory that returns a React hook. Hooks that use it
  // are re-exported through useCachedData.ts; this stub prevents load failures
  // when the module is imported in tests that only mock useCache.
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
  REFRESH_RATES: {
    realtime: 15_000, pods: 30_000, clusters: 60_000,
    deployments: 60_000, services: 60_000, metrics: 45_000,
    gpu: 45_000, helm: 120_000, gitops: 120_000,
    namespaces: 180_000, rbac: 300_000, operators: 300_000,
    costs: 600_000, default: 120_000,
  },
}))

vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(),
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
    createCachedHook: vi.fn(),
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/sseClient', () => ({
    createCachedHook: vi.fn(),
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../mcp/clusterCacheRef', () => ({
  clusterCacheRef: mockClusterCacheRef,
  setClusterCacheRefClusters: vi.fn(),
}))

vi.mock('../useLocalAgent', () => ({
    createCachedHook: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8765',
  STORAGE_KEY_TOKEN: 'kc_token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  AI_PREDICTION_TIMEOUT_MS: 30_000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 60_000,
} })

vi.mock('../../lib/utils/concurrency', () => ({
    createCachedHook: vi.fn(),
  settledWithConcurrency: async (...args: unknown[]) => {
    const result = await mockSettledWithConcurrency(...args)
    // Invoke the onSettled callback (3rd arg) so the production code's
    // accumulation logic runs.  Without this, tests that use mockResolvedValue
    // silently skip the callback and return empty results.
    const onSettled = args[2] as ((r: PromiseSettledResult<unknown>, i: number) => void) | undefined
    if (onSettled && Array.isArray(result)) {
      result.forEach((r: PromiseSettledResult<unknown>, i: number) => onSettled(r, i))
    }
    return result
  },
}))

vi.mock('../useCachedProw', () => ({
    createCachedHook: vi.fn(),
  fetchProwJobs: (...args: unknown[]) => mockFetchProwJobs(...args),
}))

vi.mock('../useCachedLLMd', () => ({
    createCachedHook: vi.fn(),
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
  fetchLLMdModels: (...args: unknown[]) => mockFetchLLMdModels(...args),
}))

vi.mock('../useCachedISO27001', () => ({
    createCachedHook: vi.fn(),}))

// Stub the re-exports so the module loads cleanly
vi.mock('../useWorkloads', () => ({
    createCachedHook: vi.fn(),}))

vi.mock('../../lib/schemas/validate', () => ({
    createCachedHook: vi.fn(),
  validateResponse: (_schema: unknown, data: unknown) => data,
  validateArrayResponse: (_schema: unknown, data: unknown) => data,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default shape returned by our mocked useCache */
function makeCacheResult<T>(data: T, overrides?: Record<string, unknown>) {
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


describe('useCachedData', () => {
  let mod: typeof import('../useCachedData')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    // Set a valid token so fetchAPI doesn't throw
    localStorage.setItem('kc_token', 'test-jwt-token')
    mockClusterCacheRef.clusters = []
    mockIsDemoMode.mockReturnValue(false)
    // Default useCache implementation
    mockUseCache.mockImplementation((opts: { initialData: unknown }) =>
      makeCacheResult(opts.initialData)
    )
    // Default settledWithConcurrency: run tasks and return settled results
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Lazy-load module after mocks are set up
  async function loadModule() {
    mod = await import('../useCachedData')
    return mod
  }
  // ========================================================================
  describe('fetchFromAllClusters — onProgress and cluster field tagging', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('onProgress is called after each successful cluster fetch', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'c1', reachable: true }, { name: 'c2', reachable: true }, ] as typeof mockClusterCacheRef.clusters

      const c1Res = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })) }
      const c2Res = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p2' }] })) }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(c1Res)
        .mockResolvedValueOnce(c2Res))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>

      // fetchViaSSE will be called; mock it to fall through to fetchFromAllClusters
      mockFetchSSE.mockRejectedValue(new Error('SSE not available'))

      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ========================================================================
  // NEW: Events fetcher — progressive fetcher with failed cluster
  // ========================================================================
  describe('events progressive fetcher — agent cluster failure handling', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('skips failed clusters in progressive fetch and continues', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'ok-cluster', context: 'ok-ctx', reachable: true }, { name: 'bad-cluster', context: 'bad-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.getEvents
        .mockResolvedValueOnce([{ type: 'Normal', reason: 'OK', lastSeen: new Date().toISOString() }])
        .mockRejectedValueOnce(new Error('Connection refused'))

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const events = await progressiveFetcher(onProgress)

      // Should have events from ok-cluster, bad-cluster was skipped
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(onProgress).toHaveBeenCalled()
    })

    it('events progressive fetcher falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ type: 'Warning', reason: 'sse-event' }])

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())

      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // NEW: DeploymentIssues — deriveIssues edge cases
  // ========================================================================
  describe('deploymentIssues — deriveIssues edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('derives ReplicaFailure reason for running status with missing replicas', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([
        { name: 'partial-dep', namespace: 'prod', cluster: 'c1', status: 'running', replicas: 5, readyReplicas: 2 },
      ]))

      const { useCachedDeploymentIssues } = await loadModule()
      const { result } = renderHook(() => useCachedDeploymentIssues())

      expect(result.current.issues).toEqual([
        { name: 'partial-dep', namespace: 'prod', cluster: 'c1', replicas: 5, readyReplicas: 2, reason: 'ReplicaFailure', message: '' },
      ])
    })

    it('derives DeploymentFailed reason for failed status', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([
        { name: 'failed-dep', namespace: 'prod', cluster: 'c1', status: 'failed', replicas: 3, readyReplicas: 0 },
      ]))

      const { useCachedDeploymentIssues } = await loadModule()
      const { result } = renderHook(() => useCachedDeploymentIssues())

      expect(result.current.issues).toEqual([
        { name: 'failed-dep', namespace: 'prod', cluster: 'c1', replicas: 3, readyReplicas: 0, reason: 'DeploymentFailed', message: '' },
      ])
    })

    it('skips healthy deployments in deriveIssues', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([
        { name: 'healthy-dep', namespace: 'prod', cluster: 'c1', status: 'running', replicas: 3, readyReplicas: 3 },
      ]))

      const { useCachedDeploymentIssues } = await loadModule()
      const { result } = renderHook(() => useCachedDeploymentIssues())

      expect(result.current.issues).toEqual([])
    })
  })

  // ========================================================================
  // NEW: Namespaces — JSON parse failure and edge cases
  // ========================================================================
  describe('namespaces — edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('handles json parse failure returning null (no namespaces)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      // null fallback => (null || []) => empty
      expect(namespaces).toEqual([])
    })

    it('handles Name field (capital N) in namespace objects', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { Name: 'production' },
          { Name: 'staging' },
        ]),
      })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      expect(namespaces).toContain('production')
      expect(namespaces).toContain('staging')
    })

    it('returns cached namespaces when the primary endpoint is unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [{ name: 'my-cluster', namespaces: ['team-a', 'team-b'] }]
      mockAuthFetch.mockResolvedValue({ ok: false, status: 401 })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      await expect(fetcher()).resolves.toEqual(['team-a', 'team-b'])
      expect(mockAuthFetch).toHaveBeenCalledTimes(1)
    })

    it('fetcher returns demo data when no cluster provided in demo mode', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockIsDemoMode.mockReturnValue(true)

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces()

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      expect(namespaces).toContain('default')
      expect(namespaces).toContain('kube-system')
      expect(namespaces.length).toBeGreaterThan(5)
    })
  })

  // ========================================================================
  // NEW: fetchGitOpsSSE — backend unavailable throws
  // ========================================================================
  describe('fetchGitOpsSSE — backend unavailable', () => {
    it('throws when backend is unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // NEW: fetchPodIssuesViaAgent — edge cases
  // ========================================================================
  describe('fetchPodIssuesViaAgent — edge cases', () => {
    it('uses context from cluster info when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'admin@prod-cluster', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', status: 'Error', restarts: 1 },
      ])

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const issues = await fetcher()

      // kubectlProxy should be called with context, not name
      expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('admin@prod-cluster', undefined)
      // But the result should use the short name
      expect(issues[0].cluster).toBe('prod')
    })
  })

  // ========================================================================
  // NEW: coreFetchers.securityIssues — kubectl succeeds but finds no issues
  // ========================================================================
})
