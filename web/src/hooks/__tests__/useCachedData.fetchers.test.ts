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
  clusterCacheRef: { clusters: [] },
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
  // Fetcher branch coverage: test the fetcher callbacks passed to useCache
  // ========================================================================
  describe('fetcher branch coverage', () => {
    it('useCachedPods fetcher: cluster-specific path', async () => {
      // Capture the useCache options so we can call the fetcher directly
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mock global fetch
      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', 'default')

      // Call the fetcher
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const pods = await fetcher()
      expect(Array.isArray(pods)).toBe(true)

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: no token throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedPods fetcher: non-JSON response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: false,
        status: 500,
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 500')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: sorts by restarts descending', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'p1', restarts: 1 },
            { name: 'p2', restarts: 10 },
            { name: 'p3', restarts: 0 },
          ]
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; restarts: number }>>
      const pods = await fetcher()
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')
      expect(pods[2].name).toBe('p3')

      vi.unstubAllGlobals()
    })

    it('fetchAPI: skips undefined params', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }
      const fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse)
      vi.stubGlobal('fetch', fetchSpy)

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', undefined)

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      // Verify the URL doesn't have undefined in it
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('undefined')
      expect(calledUrl).toContain('cluster=my-cluster')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Cache hit/miss behavior — demoData and initialData shapes
  // ========================================================================
  describe('cache hit/miss behavior', () => {
    it('passes demoData array to useCache for pods hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedPods } = await loadModule()
      useCachedPods()

      // demoData should be a non-empty array (demo pods)
      expect(Array.isArray(capturedOpts.demoData)).toBe(true)
      expect((capturedOpts.demoData as unknown[]).length).toBeGreaterThan(0)
    })

    it('passes empty array as initialData for list hooks', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      expect(capturedOpts.initialData).toEqual([])
    })

    it('passes empty object as initialData for helm values hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'rel', 'ns')

      expect(capturedOpts.initialData).toEqual({})
    })

    it('useCachedHelmReleases uses helm category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()
      expect(mockUseCache.mock.calls[0][0].category).toBe('helm')
    })

    it('useCachedGPUNodes uses gpu category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes()
      expect(mockUseCache.mock.calls[0][0].category).toBe('gpu')
    })
  })

  // ========================================================================
  // Stale-while-revalidate pattern
  // ========================================================================
  describe('stale-while-revalidate pattern', () => {
    it('returns stale data while refreshing', async () => {
      const staleData = [{ name: 'stale-pod', status: 'Running' }]
      mockUseCache.mockReturnValue(
        makeCacheResult(staleData, {
          isRefreshing: true,
          isLoading: false,
          lastRefresh: Date.now() - 60_000,
        })
      )

      const { useCachedPods } = await loadModule()
      const result = useCachedPods()

      // Should have data even while refreshing (stale-while-revalidate)
      expect(result.pods).toEqual(staleData)
      expect(result.isRefreshing).toBe(true)
      expect(result.isLoading).toBe(false)
    })

    it('preserves lastRefresh timestamp from cache', async () => {
      const timestamp = Date.now() - 30_000
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: timestamp })
      )

      const { useCachedEvents } = await loadModule()
      const result = useCachedEvents()

      expect(result.lastRefresh).toBe(timestamp)
    })

    it('lastRefresh is null when no data has been fetched', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: null, isLoading: true })
      )

      const { useCachedNodes } = await loadModule()
      const result = useCachedNodes()

      expect(result.lastRefresh).toBeNull()
      expect(result.isLoading).toBe(true)
    })
  })

  // ========================================================================
  // Error recovery and consecutive failure tracking
  // ========================================================================
  describe('error recovery and consecutive failure tracking', () => {
    it('tracks consecutive failures count from cache', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], {
          consecutiveFailures: 5,
          isFailed: true,
          error: 'Network unreachable',
        })
      )

      const { useCachedDeployments } = await loadModule()
      const result = useCachedDeployments()

      expect(result.consecutiveFailures).toBe(5)
      expect(result.isFailed).toBe(true)
      expect(result.error).toBe('Network unreachable')
    })

    it('resets failure state on successful refetch', async () => {
      // First: failed state
      mockUseCache.mockReturnValue(
        makeCacheResult([], { consecutiveFailures: 3, isFailed: true })
      )

      const { useCachedPods } = await loadModule()
      const result1 = useCachedPods()
      expect(result1.consecutiveFailures).toBe(3)

      // Second: success state (simulating refetch)
      mockUseCache.mockReturnValue(
        makeCacheResult([{ name: 'pod-ok' }], { consecutiveFailures: 0, isFailed: false })
      )
      const result2 = useCachedPods()
      expect(result2.consecutiveFailures).toBe(0)
      expect(result2.isFailed).toBe(false)
    })

    it('useCachedPodIssues fetcher throws when no data source available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      // No agent clusters
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow()
    })

    it('useCachedDeploymentIssues fetcher throws when both sources unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      mockIsAgentUnavailable.mockReturnValue(true)

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // Demo mode integration
  // ========================================================================
  describe('demo mode integration', () => {
    it('passes isDemoFallback through from cache result', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([{ name: 'demo-pod' }], { isDemoFallback: true })
      )

      const { useCachedPods } = await loadModule()
      const result = useCachedPods()

      expect(result.isDemoFallback).toBe(true)
      expect(result.pods).toHaveLength(1)
    })

    it('every hook returns isDemoFallback field', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], { isDemoFallback: false })
      )

      const mod = await loadModule()

      // Test multiple hooks to ensure they all expose isDemoFallback
      expect(mod.useCachedPods().isDemoFallback).toBe(false)
      expect(mod.useCachedEvents().isDemoFallback).toBe(false)
      expect(mod.useCachedNodes().isDemoFallback).toBe(false)
      expect(mod.useCachedServices().isDemoFallback).toBe(false)
      expect(mod.useCachedWorkloads().isDemoFallback).toBe(false)
    })

    it('useCachedPodIssues skips REST when token is demo-token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.setItem('kc_token', 'demo-token')

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // With demo-token and no agent clusters, should throw (no data source)
      await expect(fetcher()).rejects.toThrow()
    })
  })

  // ========================================================================
  // Refetch / subscriber notifications
  // ========================================================================
  describe('refetch and subscriber notifications', () => {
    it('exposes refetch function from cache result', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(
        makeCacheResult([], { refetch: mockRefetch })
      )

      const { useCachedPods } = await loadModule()
      const result = useCachedPods()

      expect(result.refetch).toBe(mockRefetch)
    })

    it('refetch function can be called without arguments', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(
        makeCacheResult([], { refetch: mockRefetch })
      )

      const { useCachedEvents } = await loadModule()
      const result = useCachedEvents()

      await result.refetch()
      expect(mockRefetch).toHaveBeenCalledTimes(1)
    })
  })

  // ========================================================================
  // localStorage / token interactions
  // ========================================================================
  describe('localStorage token interactions', () => {
    it('fetcher reads token from localStorage via STORAGE_KEY_TOKEN', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      // Verify Authorization header was set with the token
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[1].headers.Authorization).toBe('Bearer test-jwt-token')

      vi.unstubAllGlobals()
    })

    it('fetcher uses updated token after localStorage change', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      localStorage.setItem('kc_token', 'updated-token')

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[1].headers.Authorization).toBe('Bearer updated-token')

      vi.unstubAllGlobals()
    })

    it('fetcher throws when localStorage token is removed mid-session', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      // Remove token after hook is set up
      localStorage.removeItem('kc_token')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })
  })

  // ========================================================================
  // Persist flag
  // ========================================================================
  describe('persist flag on hooks', () => {
    it('useCachedGPUNodeHealth sets persist: true', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth()
      expect(mockUseCache.mock.calls[0][0].persist).toBe(true)
    })

    it('useCachedPods does NOT set persist', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      expect(mockUseCache.mock.calls[0][0].persist).toBeUndefined()
    })

    it('useCachedHardwareHealth sets persist: true', async () => {
      mockUseCache.mockReturnValue(makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null }))
      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()
      expect(mockUseCache.mock.calls[0][0].persist).toBe(true)
    })
  })

  // ========================================================================
  // fetchFromAllClusters edge cases via pods fetcher (no cluster)
  // ========================================================================
  describe('fetchFromAllClusters edge cases', () => {
    it('throws when no clusters are available from any source', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchClusters will call fetchAPI('clusters') which returns empty
      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods() // no cluster specified triggers fetchFromAllClusters

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No clusters available')

      vi.unstubAllGlobals()
    })

    it('accumulates pods from multiple clusters and sorts by restarts', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // First call gets cluster list, second/third get pods per cluster
      const clusterResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }] })),
      }
      const podsC1 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1', restarts: 3 }] })),
      }
      const podsC2 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p2', restarts: 10 }] })),
      }

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(clusterResponse) // fetchClusters fallback
        .mockResolvedValueOnce(podsC1)
        .mockResolvedValueOnce(podsC2)
      vi.stubGlobal('fetch', fetchMock)

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; restarts: number }>>
      const pods = await fetcher()

      // p2 (10 restarts) should come before p1 (3 restarts)
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Progressive fetcher patterns
  // ========================================================================
  describe('progressive fetcher patterns', () => {
    it('provides progressiveFetcher for services when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedServices } = await loadModule()
      useCachedServices()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressiveFetcher for services when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedServices } = await loadModule()
      useCachedServices('my-cluster')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('provides progressiveFetcher for warning events when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressiveFetcher for warning events when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents('prod-east')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('omits progressiveFetcher for deployment issues when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues('my-cluster')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('provides progressiveFetcher for nodes when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedNodes } = await loadModule()
      useCachedNodes()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })
  })

  // ========================================================================
  // Enabled flag — conditional fetching
  // ========================================================================
  describe('enabled flag for conditional hooks', () => {
    it('useCachedHelmHistory is disabled when release is missing', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('my-cluster', undefined)

      expect(capturedOpts.enabled).toBe(false)
    })

    it('useCachedHelmValues is disabled when cluster is missing', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues(undefined, 'my-release')

      expect(capturedOpts.enabled).toBe(false)
    })

    it('useCachedHelmValues is enabled when both cluster and release provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'my-release')

      expect(capturedOpts.enabled).toBe(true)
    })

    it('useCachedHelmHistory is enabled when both cluster and release provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('c1', 'my-release', 'ns')

      expect(capturedOpts.enabled).toBe(true)
    })

    it('useCachedHelmHistory key includes cluster, release, and namespace', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('prod', 'nginx', 'web')

      expect(capturedOpts.key).toBe('helmHistory:prod:nginx:web')
    })
  })

  // ========================================================================
  // Cache key construction
  // ========================================================================
  describe('cache key construction', () => {
    it('useCachedWarningEvents includes limit in key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents('c1', 'ns', { limit: 25 })
      expect(mockUseCache.mock.calls[0][0].key).toBe('warningEvents:c1:ns:25')
    })

    it('useCachedDeployments uses all:all when no cluster/namespace', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()
      expect(mockUseCache.mock.calls[0][0].key).toBe('deployments:all:all')
    })

    it('useCachedPVCs includes cluster and namespace in key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs('prod', 'data')
      expect(mockUseCache.mock.calls[0][0].key).toBe('pvcs:prod:data')
    })

    it('useCachedCronJobs constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedCronJobs } = await loadModule()
      useCachedCronJobs('staging', 'batch')
      expect(mockUseCache.mock.calls[0][0].key).toBe('cronJobs:staging:batch')
    })

    it('useCachedIngresses constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedIngresses } = await loadModule()
      useCachedIngresses('prod', 'web')
      expect(mockUseCache.mock.calls[0][0].key).toBe('ingresses:prod:web')
    })

    it('useCachedNetworkPolicies constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedNetworkPolicies } = await loadModule()
      useCachedNetworkPolicies('prod', 'frontend')
      expect(mockUseCache.mock.calls[0][0].key).toBe('networkPolicies:prod:frontend')
    })

    it('useCachedSecrets constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedSecrets } = await loadModule()
      useCachedSecrets('prod', 'apps')
      expect(mockUseCache.mock.calls[0][0].key).toBe('secrets:prod:apps')
    })

    it('useCachedCoreDNSStatus constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('gpu-cluster')
      expect(mockUseCache.mock.calls[0][0].key).toBe('coredns:gpu-cluster')
    })
  })

  // ========================================================================
  // Category assignment
  // ========================================================================
  describe('category assignment', () => {
    it('useCachedPVCs uses default category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs()
      expect(mockUseCache.mock.calls[0][0].category).toBe('default')
    })

    it('useCachedNamespaces uses namespaces category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces()
      expect(mockUseCache.mock.calls[0][0].category).toBe('namespaces')
    })

    it('useCachedK8sRoles uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedK8sRoleBindings uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sRoleBindings } = await loadModule()
      useCachedK8sRoleBindings()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedK8sServiceAccounts uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sServiceAccounts } = await loadModule()
      useCachedK8sServiceAccounts()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedOperators uses operators category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedOperators } = await loadModule()
      useCachedOperators()
      expect(mockUseCache.mock.calls[0][0].category).toBe('operators')
    })

    it('useCachedOperatorSubscriptions uses operators category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedOperatorSubscriptions } = await loadModule()
      useCachedOperatorSubscriptions()
      expect(mockUseCache.mock.calls[0][0].category).toBe('operators')
    })

    it('useCachedGitOpsDrifts uses gitops category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGitOpsDrifts } = await loadModule()
      useCachedGitOpsDrifts()
      expect(mockUseCache.mock.calls[0][0].category).toBe('gitops')
    })

    it('allows overriding category via options', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods(undefined, undefined, { category: 'realtime' })
      expect(mockUseCache.mock.calls[0][0].category).toBe('realtime')
    })
  })

  // ========================================================================
  // Return shape aliases (domain-specific field names)
  // ========================================================================
  describe('return shape aliases', () => {
    it('useCachedPVCs exposes .pvcs alias', async () => {
      const data = [{ name: 'pvc-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedPVCs } = await loadModule()
      const result = useCachedPVCs()
      expect(result.pvcs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedJobs exposes .jobs alias', async () => {
      const data = [{ name: 'job-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedJobs } = await loadModule()
      const result = useCachedJobs()
      expect(result.jobs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedHPAs exposes .hpas alias', async () => {
      const data = [{ name: 'hpa-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedHPAs } = await loadModule()
      const result = useCachedHPAs()
      expect(result.hpas).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedConfigMaps exposes .configmaps alias', async () => {
      const data = [{ name: 'cm-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedConfigMaps } = await loadModule()
      const result = useCachedConfigMaps()
      expect(result.configmaps).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedStatefulSets exposes .statefulsets alias', async () => {
      const data = [{ name: 'sts-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedStatefulSets } = await loadModule()
      const result = useCachedStatefulSets()
      expect(result.statefulsets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedDaemonSets exposes .daemonsets alias', async () => {
      const data = [{ name: 'ds-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedDaemonSets } = await loadModule()
      const result = useCachedDaemonSets()
      expect(result.daemonsets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedCronJobs exposes .cronjobs alias', async () => {
      const data = [{ name: 'cj-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedCronJobs } = await loadModule()
      const result = useCachedCronJobs()
      expect(result.cronjobs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedIngresses exposes .ingresses alias', async () => {
      const data = [{ name: 'ing-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedIngresses } = await loadModule()
      const result = useCachedIngresses()
      expect(result.ingresses).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedNetworkPolicies exposes .networkpolicies alias', async () => {
      const data = [{ name: 'np-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedNetworkPolicies } = await loadModule()
      const result = useCachedNetworkPolicies()
      expect(result.networkpolicies).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedHelmReleases exposes .releases alias', async () => {
      const data = [{ name: 'rel-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedHelmReleases } = await loadModule()
      const result = useCachedHelmReleases()
      expect(result.releases).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedCoreDNSStatus exposes .clusters alias', async () => {
      const data = [{ cluster: 'c1', pods: [], healthy: true, totalRestarts: 0 }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedCoreDNSStatus } = await loadModule()
      const result = useCachedCoreDNSStatus()
      expect(result.clusters).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedReplicaSets exposes .replicasets alias', async () => {
      const data = [{ name: 'rs-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedReplicaSets } = await loadModule()
      const result = useCachedReplicaSets()
      expect(result.replicasets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedNamespaces exposes .namespaces alias', async () => {
      const data = ['default', 'kube-system']
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedNamespaces } = await loadModule()
      const result = useCachedNamespaces()
      expect(result.namespaces).toEqual(data)
      expect(result.data).toEqual(data)
    })
  })
})
