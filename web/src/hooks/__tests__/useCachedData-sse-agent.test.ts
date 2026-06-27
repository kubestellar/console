/**
 * Deep branch-coverage tests for useCachedData.ts
 *
 * Tests the internal utility functions (fetchAPI, fetchClusters,
 * fetchFromAllClusters, fetchViaSSE, etc.) and every exported
 * useCached* hook by mocking the underlying cache layer and network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

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

const mockClusterCacheRef = vi.hoisted(() => ({ clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> }))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
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
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
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
  describe('coreFetchers — edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('coreFetchers.deploymentIssues returns empty when both unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.deploymentIssues()
      expect(issues).toEqual([])
    })

    it('coreFetchers.deployments returns empty when both unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const deps = await coreFetchers.deployments()
      expect(deps).toEqual([])
    })

    it('coreFetchers.securityIssues uses agent kubectl when available', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [{
            metadata: { name: 'priv-pod', namespace: 'default' },
            spec: {
              containers: [{ securityContext: { privileged: true } }],
            },
          }],
        }),
      })

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()
      expect(issues.length).toBeGreaterThan(0)
    })

    it('coreFetchers.securityIssues returns empty when all unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()
      expect(issues).toEqual([])
    })
  })

  // ========================================================================
  // NEW: Deep branch coverage — SSE streaming paths
  // ========================================================================
  describe('SSE streaming — onClusterData accumulation and catch-fallback', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it.skip('fetchViaSSE accumulates data across multiple onClusterData calls', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // SSE delivers data from two clusters via onClusterData
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'svc-a' }, { name: 'svc-b' }])
        opts.onClusterData('c2', [{ name: 'svc-c' }])
        return [{ name: 'svc-a' }, { name: 'svc-b' }, { name: 'svc-c' }]
      })

      const { useCachedServices } = await loadModule()
      useCachedServices()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      // Three total items from two clusters
      expect(result).toHaveLength(3)
    })

    it('fetchViaSSE catches SSE error and falls back to fetchFromAllClusters', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // SSE throws an error
      mockFetchSSE.mockRejectedValue(new Error('EventSource connection refused'))

      // REST fallback: fetchFromAllClusters needs clusters
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      // REST per-cluster response
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pvcs: [{ name: 'rest-pvc' }] })),
      }))

      const { useCachedPVCs } = await loadModule()
      useCachedPVCs()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())

      // Should have fallen back to REST and gotten data
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('name', 'rest-pvc')
    })

    it.skip('fetchViaSSE calls onProgress during progressive accumulation for pods', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'pod-1', restarts: 5 }])
        opts.onClusterData('c2', [{ name: 'pod-2', restarts: 0 }])
        return [{ name: 'pod-1', restarts: 5 }, { name: 'pod-2', restarts: 0 }]
      })

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      // Should sort by restarts desc and slice to limit
      expect(result[0]).toHaveProperty('restarts', 5)
      expect(result[1]).toHaveProperty('restarts', 0)
    })
  })

  // ========================================================================
  // NEW: Agent fallback chains — fetchDeploymentsViaAgent edge cases
  // ========================================================================
  describe('agent fallback chains — fetchDeploymentsViaAgent', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('fetchDeploymentsViaAgent returns empty when agent is unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })

    it('fetchDeploymentsViaAgent handles agent JSON returning null for each cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      // Agent returns ok but JSON fails (returns null via .catch)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      }))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments() // no cluster => uses fetchDeploymentsViaAgent

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      // fetchDeploymentsViaAgent: null data => throws 'Invalid JSON'
      // settledWithConcurrency settles, accumulated is empty, returns []
      expect(Array.isArray(result)).toBe(true)
    })

    it('fetchDeploymentsViaAgent tags results with short cluster name, not context', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'default/api-server:6443/admin', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [{ name: 'dep-1', namespace: 'default', cluster: 'default/api-server:6443/admin' }],
        }),
      }))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const result = await fetcher()

      // Should use short name 'prod', not the context path
      expect(result[0].cluster).toBe('prod')
    })
  })

  // ========================================================================
  // NEW: fetchWorkloadsFromAgent edge cases
  // ========================================================================
  describe('fetchWorkloadsFromAgent edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('returns null when agent has no clusters', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      // No clusters => null from agent => falls through, backend unavailable => empty
      expect(result).toEqual([])
    })

    it('returns null when agent fetch fails for all clusters', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockIsBackendUnavailable.mockReturnValue(true)

      // Agent fetch throws
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      // All cluster fetches fail => accumulated is empty => returns null => backend unavailable => []
      expect(result).toEqual([])
    })

    it('progressive fetcher for workloads calls onProgress', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [{ name: 'wl-1', status: 'running', replicas: 1, readyReplicas: 1 }],
        }),
      }))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      expect(result).not.toBeNull()
      expect(onProgress).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // NEW: Security scanning via kubectl — additional branch coverage
  // ========================================================================
})
