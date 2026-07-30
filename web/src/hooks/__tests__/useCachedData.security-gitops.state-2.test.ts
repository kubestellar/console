/**
 * Deep branch-coverage tests for useCachedData.ts (part 2 of 3).
 *
 * Tests the internal utility functions (fetchAPI, fetchClusters,
 * fetchFromAllClusters, fetchViaSSE, etc.) and every exported
 * useCached* hook by mocking the underlying cache layer and network.
 *
 * Covers: namespaces fetcher, buildpack images 404 handling, GitOps and RBAC API endpoints
 * See also: useCachedData.security-gitops.state.test.ts, useCachedData.security-gitops.state-3.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCachedData - part 2', () => {
  let mod: typeof import('../useCachedData')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    // Set a valid token so fetchAPI doesn't throw
    localStorage.setItem('kc_token', 'test-jwt-token')
    // Reset the shared cluster cache so tests start with a clean slate
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
  // useCachedPods
  // ========================================================================

  // ========================================================================
  // Security issues via kubectl scanning
  // ========================================================================
  describe('namespaces fetcher', () => {
    it('useCachedNamespaces: returns demo data when no cluster in demo mode', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockIsDemoMode.mockReturnValue(true)

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces() // no cluster

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('default')
      expect(namespaces).toContain('kube-system')
    })

    it('useCachedNamespaces: fetches from /api/namespaces when cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const nsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'production' },
          { Name: 'staging' },
          { name: '' }, // empty name filtered out
        ]),
      }
      mockAuthFetch.mockResolvedValue(nsRes)

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('production')
      expect(namespaces).toContain('staging')
      expect(namespaces).not.toContain('')
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/namespaces?cluster=my-cluster', expect.objectContaining({
        headers: { Accept: 'application/json' },
      }))
    })

    it('useCachedNamespaces: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockAuthFetch.mockResolvedValue({ ok: false, status: 403 })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      await expect(fetcher()).rejects.toThrow('API error: 403')
      expect(mockAuthFetch).toHaveBeenNthCalledWith(1, '/api/namespaces?cluster=my-cluster', expect.any(Object))
      expect(mockAuthFetch).toHaveBeenNthCalledWith(2, '/api/mcp/namespaces?cluster=my-cluster', expect.any(Object))
    })
  })

  // ========================================================================
  // Buildpack images 404 handling
  // ========================================================================
  describe('buildpack images 404 handling', () => {
    it('useCachedBuildpackImages: returns empty array on 404 (no CRDs)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchGitOpsAPI will throw with '404' in message
      const errorRes = { ok: false, status: 404 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const images = await fetcher()
      expect(images).toEqual([])

      vi.unstubAllGlobals()
    })

    it('useCachedBuildpackImages: rethrows non-404 errors', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const errorRes = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('500')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // GitOps and RBAC API endpoints
  // ========================================================================
  describe('GitOps and RBAC API endpoints', () => {
    it('useCachedHelmReleases uses fetchGitOpsAPI', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const gitopsRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ releases: [{ name: 'prometheus' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gitopsRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const releases = await fetcher()
      expect(releases).toHaveLength(1)

      // Verify it used /api/gitops/ prefix
      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/gitops/')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const badRes = { ok: true, text: vi.fn().mockResolvedValue('not json') }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedK8sRoles uses fetchRbacAPI with /api/rbac/ prefix', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const rbacRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ roles: [{ name: 'admin' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rbacRes))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('c1', 'ns', { includeSystem: true })

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const roles = await fetcher()
      expect(roles).toHaveLength(1)

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/rbac/')
      expect(calledUrl).toContain('includeSystem=true')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-ok response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 401')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('bad json!') }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsSSE used by helmReleases progressive fetcher', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockFetchSSE.mockResolvedValue([{ name: 'sse-release' }])

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases() // no cluster

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })

    it('fetchGitOpsSSE: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow()
    })

    it('fetchGitOpsSSE: throws when demo-token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.setItem('kc_token', 'demo-token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // coreFetchers direct invocation
  // ========================================================================
})
