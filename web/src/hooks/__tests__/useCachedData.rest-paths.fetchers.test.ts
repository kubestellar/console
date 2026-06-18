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
  // ========================================================================
  describe('useCachedWarningEvents fetcher paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('cluster-specific path calls fetchAPI', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          events: [{ type: 'Warning', reason: 'BackOff' }],
        })),
      }))

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents('my-cluster', 'ns')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      vi.unstubAllGlobals()
    }, 15_000)

    it('all-clusters path calls fetchFromAllClusters with limit', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          events: [{ type: 'Warning', reason: 'FailedScheduling' }],
        })),
      }))

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents(undefined, undefined, { limit: 5 })

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result.length).toBeLessThanOrEqual(5)
    }, 15_000)
  })

  // ========================================================================
  // coreFetchers — remaining paths
  // ========================================================================
  describe('coreFetchers — remaining paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('coreFetchers.pods fetches and sorts by restarts', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'p1', restarts: 1 },
            { name: 'p2', restarts: 10 },
          ],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const pods = await coreFetchers.pods()

      expect(pods[0]).toHaveProperty('restarts', 10)
      expect(pods[1]).toHaveProperty('restarts', 1)
    })

    it('coreFetchers.events fetches from API', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          events: [{ type: 'Warning', reason: 'Test' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const events = await coreFetchers.events()

      expect(events).toHaveLength(1)
    })

    it('coreFetchers.services fetches from API', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          services: [{ name: 'svc-1' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const services = await coreFetchers.services()

      expect(services).toHaveLength(1)
    })

    it('coreFetchers.nodes fetches from all clusters', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          nodes: [{ name: 'n1' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const nodes = await coreFetchers.nodes()

      expect(nodes).toHaveLength(1)
    })

    it('coreFetchers.warningEvents fetches from all clusters', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          events: [{ type: 'Warning' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const events = await coreFetchers.warningEvents()

      expect(events).toHaveLength(1)
    })

    it('coreFetchers.deploymentIssues REST fallback path', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          issues: [{ name: 'issue-1', reason: 'ReplicaFailure' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.deploymentIssues()

      expect(issues).toHaveLength(1)
    })

    it('coreFetchers.deployments REST fallback path', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          deployments: [{ name: 'dep-1' }],
        })),
      }))

      const { coreFetchers } = await loadModule()
      const deps = await coreFetchers.deployments()

      expect(deps).toHaveLength(1)
    })

    it('coreFetchers.workloads returns empty on no data from REST', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const workloads = await coreFetchers.workloads()

      expect(workloads).toEqual([])
    })
  })

  // ========================================================================
  // specialtyFetchers actual execution
  // ========================================================================
  describe('specialtyFetchers execution', () => {
    it('prowJobs delegates to fetchProwJobs', async () => {
      mockFetchProwJobs.mockResolvedValue([{ name: 'job-1' }])

      const { specialtyFetchers } = await loadModule()
      const result = await specialtyFetchers.prowJobs()

      expect(mockFetchProwJobs).toHaveBeenCalledWith('prow', 'prow')
      expect(result).toHaveLength(1)
    })

    it('llmdServers delegates to fetchLLMdServers', async () => {
      mockFetchLLMdServers.mockResolvedValue([{ name: 'server-1' }])

      const { specialtyFetchers } = await loadModule()
      const result = await specialtyFetchers.llmdServers()

      expect(mockFetchLLMdServers).toHaveBeenCalledWith(['vllm-d', 'platform-eval'])
      expect(result).toHaveLength(1)
    })

    it('llmdModels delegates to fetchLLMdModels', async () => {
      mockFetchLLMdModels.mockResolvedValue([{ name: 'model-1' }])

      const { specialtyFetchers } = await loadModule()
      const result = await specialtyFetchers.llmdModels()

      expect(mockFetchLLMdModels).toHaveBeenCalledWith(['vllm-d', 'platform-eval'])
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // useCachedPodIssues REST cluster-specific fallback
  // ========================================================================
  describe('useCachedPodIssues REST cluster-specific', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('fetcher uses REST for single cluster when agent unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          issues: [{ name: 'rest-pod', restarts: 5 }],
        })),
      }))

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues('c1', 'ns')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()

      expect(issues).toHaveLength(1)
      expect(issues[0]).toHaveProperty('cluster', 'c1')
    })

    it('fetcher uses REST for all clusters when agent unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          issues: [{ name: 'rest-pod', restarts: 5 }],
        })),
      }))

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()

      expect(issues).toHaveLength(1)
    })
  })

  // ========================================================================
  // useCachedDeploymentIssues REST fallback with single cluster
  // ========================================================================
})
