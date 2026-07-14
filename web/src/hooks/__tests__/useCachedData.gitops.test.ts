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

describe('useCachedData', () => {
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
  describe('coreFetchers direct invocation', () => {
    it('coreFetchers.podIssues uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 3 },
      ])
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)
    })

    it('coreFetchers.podIssues falls back to REST when no agent', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const issueRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'p1', restarts: 1 }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(issueRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.podIssues returns empty when both unavailable', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toEqual([])
    })

    it('coreFetchers.deploymentIssues uses agent and derives issues', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'dep1', namespace: 'ns', replicas: 3, readyReplicas: 1, status: 'running' },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.deploymentIssues()
      expect(issues).toHaveLength(1)
      expect(issues[0]).toHaveProperty('reason', 'ReplicaFailure')

      vi.unstubAllGlobals()
    })

    it('coreFetchers.deployments uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'd1' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const deps = await coreFetchers.deployments()
      expect(deps.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.securityIssues tries kubectl then REST', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      // fetchBackendAPI uses raw fetch(), not authFetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'sec1', namespace: 'default', issue: 'Priv', severity: 'high' }] })),
      }))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.workloads uses agent then REST fallback', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const restRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'wl1', namespace: 'prod', type: 'Deployment', cluster: 'c1', status: 'Running', replicas: 1, readyReplicas: 1 },
        ]),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { coreFetchers } = await loadModule()
      const workloads = await coreFetchers.workloads()
      expect(workloads).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // fetchFromAllClusters — partial failures
  // ========================================================================
  describe('fetchFromAllClusters partial failures', () => {
    it('returns data from successful clusters even if some fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }
      const podsC1 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1', restarts: 0 }] })),
      }
      const podsC2 = {
        ok: false,
        status: 500,
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsC1)
        .mockResolvedValueOnce(podsC2))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()
      // Should still have pods from c1 even though c2 failed
      expect(pods.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('throws when ALL cluster fetches fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValue({ ok: false, status: 500 }))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('All cluster fetches failed')

      vi.unstubAllGlobals()
    })

    it('filters out unreachable clusters and clusters with / in name', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [
            { name: 'good', reachable: true },
            { name: 'unreachable', reachable: false },
            { name: 'default/api-server:6443', reachable: true }, // long context path, should be filtered
          ],
        })),
      }
      const podsRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()

      // Only 'good' cluster should be fetched — 1 cluster response + 1 pods response = 2 fetch calls total
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // First call = clusters, second call = pods for 'good'
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(pods).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })
})
