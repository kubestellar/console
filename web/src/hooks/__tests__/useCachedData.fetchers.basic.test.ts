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
      renderHook(() => useCachedDeploymentIssues())

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // Demo mode integration
  // ========================================================================
})
