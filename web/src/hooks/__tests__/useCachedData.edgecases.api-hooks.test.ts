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
  // useCachedPods
  // ========================================================================

  // ========================================================================
  // NEW: CoreDNS status computation — additional branches
  // ========================================================================
  describe('fetchRbacAPI — param serialization', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('serializes boolean params into URL search params', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ bindings: [] })),
      }))

      const { useCachedK8sRoleBindings } = await loadModule()
      useCachedK8sRoleBindings('c1', 'ns', { includeSystem: true })

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/rbac/')
      expect(calledUrl).toContain('includeSystem=true')
    })
  })

  // ========================================================================
  // fetchAPI — token missing, non-JSON, undefined params
  // ========================================================================
  describe('fetchAPI — error paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('throws when no token in localStorage', async () => {
      localStorage.removeItem('kc_token')
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedPods } = await loadModule()
      useCachedPods('test-cluster')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('throws when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service Unavailable'),
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedServices } = await loadModule()
      useCachedServices('c1')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 503')
    })

    it('throws when response is non-JSON text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedServices } = await loadModule()
      useCachedServices('c1')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API returned non-JSON response')
    })

    it('skips undefined params in query string', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedPods } = await loadModule()
      useCachedPods('c1', undefined, { limit: 10 })
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('cluster=c1')
      expect(calledUrl).not.toContain('namespace=')
    })
  })

  // ========================================================================
  // fetchFromAllClusters — cluster failure scenarios
  // ========================================================================
  describe('fetchFromAllClusters — failure and empty paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('throws when no clusters are available', async () => {
      // Ensure clusterCacheRef is empty and fetchClusters returns []
      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [] })),
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      // useCachedNodes uses fetchFromAllClusters when no cluster specified
      const { useCachedNodes } = await loadModule()
      useCachedNodes()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow()
    })

    it('throws "All cluster fetches failed" when every cluster errors', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1' }, { name: 'c2' }] })),
        })
        .mockRejectedValue(new Error('network error'))
      )
      // Run tasks so failedCount gets incremented inside fetchFromAllClusters
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
        return Promise.allSettled(tasks.map(t => t()))
      })

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedNodes } = await loadModule()
      useCachedNodes()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow()
    })
  })

  // ========================================================================
  // fetchViaSSE — demo token fallback, SSE error fallback
  // ========================================================================
  describe('fetchViaSSE — fallback paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('falls back to REST when token is demo-token', async () => {
      localStorage.setItem('kc_token', 'demo-token')

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1' }], pods: [{ name: 'p1' }] })),
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedPods } = await loadModule()
      useCachedPods()
      const progressiveFetcher = capturedOpts.progressiveFetcher as ((onProgress: (d: unknown) => void) => Promise<unknown>) | undefined
      if (progressiveFetcher) {
        // Should not call fetchSSE since token is demo
        const onProgress = vi.fn()
        // This will throw because fetchFromAllClusters can't fetch with demo-token
        // but the point is it doesn't attempt SSE
        try { await progressiveFetcher(onProgress) } catch { /* expected */ }
        expect(mockFetchSSE).not.toHaveBeenCalled()
      }
    })
  })

  // ========================================================================
  // fetchGitOpsAPI / fetchViaGitOpsSSE — token and error paths
  // ========================================================================
  describe('fetchGitOpsAPI — error paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('throws when no token for GitOps API', async () => {
      localStorage.removeItem('kc_token')

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      const { useCachedGitOpsDrifts } = await loadModule()
      useCachedGitOpsDrifts()
      const fetcher = capturedOpts.fetcher as (() => Promise<unknown>) | undefined
      if (fetcher) {
        await expect(fetcher()).rejects.toThrow()
      }
    })
  })

  // ========================================================================
  // useCachedHardwareHealth — agent fetcher branches
  // ========================================================================
  describe('useCachedHardwareHealth', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('returns hardware health data', async () => {
      const health = {
        alerts: [{ id: 'a1', nodeName: 'gpu-1', cluster: 'prod', deviceType: 'gpu', severity: 'critical', previousCount: 8, currentCount: 6, droppedCount: 2 }],
        inventory: [],
        nodeCount: 1,
        lastUpdate: new Date().toISOString(),
      }
      mockUseCache.mockReturnValue(makeCacheResult(health))
      const { useCachedHardwareHealth } = await loadModule()
      const result = useCachedHardwareHealth()
      expect(result.data.alerts).toHaveLength(1)
      expect(result.data.nodeCount).toBe(1)
    })

    it('fetcher throws when both agent endpoints fail', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }))

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })
      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('Device endpoints unavailable')
    })

    it('fetcher handles one endpoint ok and the other failed', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ alerts: [{ id: 'x' }], nodeCount: 2, timestamp: 'now' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
      )

      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })
      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const result = await fetcher() as { alerts: unknown[]; nodeCount: number }
      expect(result.alerts).toHaveLength(1)
      expect(result.nodeCount).toBe(2)
    })
  })

  // ========================================================================
  // useGPUHealthCronJob — action success and error paths
  // useGPUHealthCronJob uses useState/useCallback so it requires renderHook
  // ========================================================================
  describe('useGPUHealthCronJob', () => {
    it('returns null status when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null))
      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob())
      expect(result.current.status).toBeNull()
      unmount()
    })

    it('enabled is false when cluster is undefined', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null))
      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob())
      expect(mockUseCache.mock.calls[0][0].enabled).toBe(false)
      unmount()
    })

    it('enabled is true when cluster is given', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null))
      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob('my-cluster'))
      expect(mockUseCache.mock.calls[0][0].enabled).toBe(true)
      unmount()
    })
  })

  // ========================================================================
  // coreFetchers — standalone fetcher paths
  // ========================================================================
  describe('coreFetchers', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('coreFetchers.podIssues returns empty when no agent and no token', async () => {
      localStorage.removeItem('kc_token')
      mockIsAgentUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const result = await coreFetchers.podIssues()
      expect(result).toEqual([])
    })

    it('coreFetchers.deployments returns empty when no agent and no token', async () => {
      localStorage.removeItem('kc_token')
      mockIsAgentUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const result = await coreFetchers.deployments()
      expect(result).toEqual([])
    })

    it('coreFetchers.deploymentIssues returns empty when no sources available', async () => {
      localStorage.removeItem('kc_token')
      mockIsAgentUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const result = await coreFetchers.deploymentIssues()
      expect(result).toEqual([])
    })

    it('coreFetchers.securityIssues returns empty when no sources available', async () => {
      localStorage.removeItem('kc_token')
      mockIsAgentUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const result = await coreFetchers.securityIssues()
      expect(result).toEqual([])
    })

    it('coreFetchers.workloads returns empty when no sources available', async () => {
      localStorage.removeItem('kc_token')
      mockIsAgentUnavailable.mockReturnValue(true)

      const { coreFetchers } = await loadModule()
      const result = await coreFetchers.workloads()
      expect(result).toEqual([])
    })
  })

  // ========================================================================
  // specialtyFetchers — exported correctly
  // ========================================================================
  describe('specialtyFetchers', () => {
    it('specialtyFetchers has prowJobs, llmdServers, llmdModels', async () => {
      const { specialtyFetchers } = await loadModule()
      expect(typeof specialtyFetchers.prowJobs).toBe('function')
      expect(typeof specialtyFetchers.llmdServers).toBe('function')
      expect(typeof specialtyFetchers.llmdModels).toBe('function')
    })
  })
})
