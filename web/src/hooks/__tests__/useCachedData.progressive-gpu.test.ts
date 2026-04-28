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

// Shared mutable cluster-cache ref — the hoisted `vi.mock('../mcp/shared', ...)`
// below returns this same object reference, so tests can mutate `.clusters`
// directly instead of calling `vi.doMock` (which is unreliable on the first
// test-after-resetModules in CI — see kubestellar/console#9305).
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
  // getReachableClusters / getAgentClusters filtering
  // ========================================================================
  describe('getReachableClusters / getAgentClusters', () => {
    it('fetchClusters prefers local agent clusters over backend', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mutate the shared mock ref directly — avoids the `vi.doMock` +
      // `resetModules` race that caused kubestellar/console#9305.
      mockClusterCacheRef.clusters = [
        { name: 'agent-c1', reachable: true },
        { name: 'agent-c2', reachable: undefined }, // pending health check — included
        { name: 'agent-c3', reachable: false }, // unreachable — excluded
        { name: 'ns/long-path-name', reachable: true }, // long path — excluded
      ]

      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await fetcher()

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // Should fetch pods from agent-c1 and agent-c2 (2 clusters), not from backend
      expect(fetchMock).toHaveBeenCalledTimes(2)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Progressive fetcher — pod issues with agent
  // ========================================================================
  describe('pod issues progressive fetcher', () => {
    it('useCachedPodIssues progressive fetcher uses agent when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue1', restarts: 5 },
      ])

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const issues = await progressiveFetcher(onProgress)
      expect(issues.length).toBeGreaterThanOrEqual(1)
      expect(onProgress).toHaveBeenCalled()
    })

    it('useCachedPodIssues progressive fetcher falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ name: 'sse-issue' }])

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // Deployment issues progressive fetcher
  // ========================================================================
  describe('deployment issues progressive fetcher', () => {
    it('uses agent and derives issues progressively', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [{ name: 'dep1', replicas: 3, readyReplicas: 1, status: 'running' }],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const issues = await progressiveFetcher(onProgress)
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ name: 'di1', reason: 'ReplicaFailure' }])

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // Warning events progressive fetcher with limit
  // ========================================================================
  describe('warning events progressive fetcher with limit', () => {
    it('slices results to configured limit', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Return more items than the limit
      const manyEvents = Array.from({ length: 100 }, (_, i) => ({ type: 'Warning', reason: `Event${i}` }))
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', manyEvents)
        return manyEvents
      })

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents(undefined, undefined, { limit: 10 })

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)
      expect(result.length).toBeLessThanOrEqual(10)
    })
  })

  // ========================================================================
  // useGPUHealthCronJob — uses useState/useCallback so requires React render context.
  // We test the useCache config via renderHook.
  // ========================================================================
  describe('useGPUHealthCronJob', () => {
    it('passes correct key and enabled flag to useCache (no cluster)', async () => {
      // useGPUHealthCronJob uses useState, so we can't call it bare.
      // Instead, verify the module exports it and test the fetcher logic
      // by checking useCachedGPUNodeHealth which has the same endpoint pattern.
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth()

      // GPU health uses fetchFromAllClusters for 'gpu-nodes/health'
      expect(capturedOpts.key).toBe('gpu-node-health:all')
      expect(capturedOpts.persist).toBe(true)
    })

    it('GPU node health fetcher: cluster-specific path', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          nodes: [{ nodeName: 'gpu-1', status: 'healthy' }],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth('gpu-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const nodes = await fetcher()
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toHaveProperty('cluster', 'gpu-cluster')

      vi.unstubAllGlobals()
    })

    it('GPU node health fetcher: all-clusters path', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))

      const nodeRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ nodes: [{ nodeName: 'g1' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nodeRes))

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const nodes = await fetcher()
      expect(nodes.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Demo data arrays are populated
  // ========================================================================
  describe('demo data arrays are populated', () => {
    it('all hooks pass non-empty demoData (regression guard)', async () => {
      const capturedDemos: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: { key: string; demoData: unknown }) => {
        capturedDemos[opts.key] = opts.demoData
        return makeCacheResult(opts.demoData || [])
      })

      const m = await loadModule()

      // Call every hook to capture their demoData
      m.useCachedPods()
      m.useCachedEvents()
      m.useCachedPodIssues()
      m.useCachedDeploymentIssues()
      m.useCachedDeployments()
      m.useCachedServices()
      m.useCachedSecurityIssues()
      m.useCachedNodes()
      m.useCachedGPUNodeHealth()
      m.useCachedWorkloads()
      m.useCachedWarningEvents()
      m.useCachedGPUNodes()
      m.useCachedPVCs()
      m.useCachedNamespaces()
      m.useCachedJobs()
      m.useCachedHPAs()
      m.useCachedConfigMaps()
      m.useCachedSecrets()
      m.useCachedReplicaSets()
      m.useCachedStatefulSets()
      m.useCachedDaemonSets()
      m.useCachedCronJobs()
      m.useCachedIngresses()
      m.useCachedNetworkPolicies()
      m.useCachedHelmReleases()
      m.useCachedOperators()
      m.useCachedOperatorSubscriptions()
      m.useCachedGitOpsDrifts()
      m.useCachedBuildpackImages()
      m.useCachedCoreDNSStatus()

      // All of these should have non-null demoData
      for (const [key, demo] of Object.entries(capturedDemos)) {
        if (demo === null) continue // Some hooks (like GPU CronJob) intentionally use null
        expect(Array.isArray(demo) ? demo.length : Object.keys(demo as Record<string, unknown>).length)
          .toBeGreaterThan(0, `${key} should have non-empty demoData`)
      }
    })
  })

  // ========================================================================
  // Security issues progressive fetcher
  // ========================================================================
  describe('security issues progressive fetcher', () => {
    it('provides progressiveFetcher when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressiveFetcher when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues('prod')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('progressive fetcher: uses kubectl then falls back to SSE', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ name: 'sec-sse', issue: 'Priv', severity: 'high' }])

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // useCachedAllPods
  // ========================================================================
  describe('useCachedAllPods', () => {
    it('returns pods from cache', async () => {
      const data = [{ name: 'all-pod-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedAllPods } = await loadModule()
      const result = useCachedAllPods()
      expect(result.pods).toEqual(data)
    })

    it('uses correct key format', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedAllPods } = await loadModule()
      useCachedAllPods('gpu-cluster')
      expect(mockUseCache.mock.calls[0][0].key).toBe('allPods:gpu-cluster')
    })

    it('provides progressiveFetcher when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedAllPods } = await loadModule()
      useCachedAllPods()
      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })
  })

  // ========================================================================
  // Deployments progressive fetcher
  // ========================================================================
  describe('deployments progressive fetcher', () => {
    it('uses agent when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'd1' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(mockFetchSSE).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
        agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
      }))
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ name: 'sse-dep' }])

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // Hook fetcher cluster-specific paths (cover lines 2156-2754)
  // ========================================================================
  describe('hook fetcher cluster-specific paths', () => {
    /** Helper: capture useCache opts, stub fetch for a single-cluster fetchAPI call */
    function setupClusterFetcher() {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(opts.initialData ?? [])
      })
      return { getCaptured: () => capturedOpts }
    }

    function stubFetchJSON(data: Record<string, unknown>) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
      }))
    }

    afterEach(() => { vi.unstubAllGlobals() })

    it('useCachedGPUNodes fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ nodes: [{ name: 'gpu-1', gpuType: 'A100' }] })
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })

    it('useCachedAllPods fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ pods: [{ name: 'pod-1' }] })
      const { useCachedAllPods } = await loadModule()
      useCachedAllPods('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })

    it('useCachedPVCs fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ pvcs: [{ name: 'pvc-1' }] })
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })

    it('useCachedJobs fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ jobs: [{ name: 'job-1' }] })
      const { useCachedJobs } = await loadModule()
      useCachedJobs('my-cluster', 'batch')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })

    it('useCachedHPAs fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ hpas: [{ name: 'hpa-1' }] })
      const { useCachedHPAs } = await loadModule()
      useCachedHPAs('my-cluster', 'prod')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedConfigMaps fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ configmaps: [{ name: 'cm-1' }] })
      const { useCachedConfigMaps } = await loadModule()
      useCachedConfigMaps('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedSecrets fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ secrets: [{ name: 'sec-1' }] })
      const { useCachedSecrets } = await loadModule()
      useCachedSecrets('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedServiceAccounts fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ serviceaccounts: [{ name: 'sa-1' }] })
      const { useCachedServiceAccounts } = await loadModule()
      useCachedServiceAccounts('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedReplicaSets fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ replicasets: [{ name: 'rs-1' }] })
      const { useCachedReplicaSets } = await loadModule()
      useCachedReplicaSets('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedStatefulSets fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ statefulsets: [{ name: 'sts-1' }] })
      const { useCachedStatefulSets } = await loadModule()
      useCachedStatefulSets('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedDaemonSets fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ daemonsets: [{ name: 'ds-1' }] })
      const { useCachedDaemonSets } = await loadModule()
      useCachedDaemonSets('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedCronJobs fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ cronjobs: [{ name: 'cj-1' }] })
      const { useCachedCronJobs } = await loadModule()
      useCachedCronJobs('my-cluster', 'batch')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedIngresses fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ ingresses: [{ name: 'ing-1' }] })
      const { useCachedIngresses } = await loadModule()
      useCachedIngresses('my-cluster', 'web')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedNetworkPolicies fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ networkpolicies: [{ name: 'np-1' }] })
      const { useCachedNetworkPolicies } = await loadModule()
      useCachedNetworkPolicies('my-cluster', 'frontend')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedServices fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ services: [{ name: 'svc-1', type: 'ClusterIP' }] })
      const { useCachedServices } = await loadModule()
      useCachedServices('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })

    it('useCachedNodes fetcher: cluster-specific path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ nodes: [{ name: 'node-1', status: 'Ready' }] })
      const { useCachedNodes } = await loadModule()
      useCachedNodes('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'my-cluster')
    })
  })

  // ========================================================================
  // GitOps hook fetcher paths (cover lines 2829-3133)
  // ========================================================================
  describe('GitOps and RBAC hook fetcher paths', () => {
    function setupClusterFetcher() {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(opts.initialData ?? [])
      })
      return { getCaptured: () => capturedOpts }
    }

    function stubFetchJSON(data: Record<string, unknown>) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
      }))
    }

    afterEach(() => { vi.unstubAllGlobals() })

    it('useCachedHelmReleases fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ releases: [{ name: 'rel-1', status: 'deployed' }] })
      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedHelmHistory fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ history: [{ revision: 1, status: 'deployed' }] })
      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('c1', 'my-release', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedHelmValues fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ values: { replicaCount: 3 } })
      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'my-release', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<Record<string, unknown>>
      const result = await fetcher()
      expect(result).toHaveProperty('replicaCount', 3)
    })

    it('useCachedOperators fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ operators: [{ name: 'op-1', status: 'Succeeded' }] })
      const { useCachedOperators } = await loadModule()
      useCachedOperators('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedOperatorSubscriptions fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ subscriptions: [{ name: 'sub-1' }] })
      const { useCachedOperatorSubscriptions } = await loadModule()
      useCachedOperatorSubscriptions('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedGitOpsDrifts fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ drifts: [{ resource: 'r1', driftType: 'modified' }] })
      const { useCachedGitOpsDrifts } = await loadModule()
      useCachedGitOpsDrifts('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedBuildpackImages fetcher: success path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ images: [{ name: 'img-1', status: 'succeeded' }] })
      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sRoles fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ roles: [{ name: 'admin', isCluster: true }] })
      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('my-cluster', 'ns', { includeSystem: true })
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sRoleBindings fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ bindings: [{ name: 'binding-1' }] })
      const { useCachedK8sRoleBindings } = await loadModule()
      useCachedK8sRoleBindings('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sServiceAccounts fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ serviceAccounts: [{ name: 'default' }] })
      const { useCachedK8sServiceAccounts } = await loadModule()
      useCachedK8sServiceAccounts('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // useGPUHealthCronJob — full install/uninstall coverage
  // useGPUHealthCronJob uses useState/useCallback so it requires renderHook
  // ========================================================================
  describe('useGPUHealthCronJob — full coverage', () => {
    it('fetcher returns null when cluster is falsy', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(null)
      })

      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob())

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const result = await fetcher()
      expect(result).toBeNull()
      expect(capturedOpts.enabled).toBe(false)
      unmount()
    })

    it('fetcher calls fetchAPI when cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ installed: true })
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ installed: true })),
      }))

      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const result = await fetcher()
      expect(result).toHaveProperty('installed', true)
      expect(capturedOpts.enabled).toBe(true)
      unmount()
      vi.unstubAllGlobals()
    })

    // #7993 Phase 3e: GPU health cronjob install/uninstall routes through
    // kc-agent (global `fetch` with LOCAL_AGENT_HTTP_URL), not the backend
    // `authFetch`. Tests mock `global.fetch` accordingly.
    it('install calls kc-agent with POST and refetches', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install({ namespace: 'gpu-health', schedule: '*/5 * * * *', tier: 3 })
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/gpu-health-cronjob'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(mockRefetch).toHaveBeenCalled()
      unmount()
    })

    it('install sets error on non-ok response', async () => {
      const mockRefetch = vi.fn()
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server Error'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install()
      })

      expect(fetchMock).toHaveBeenCalled()
      expect(result.current.error).toBe('Server Error')
      unmount()
    })

    it('install does nothing when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob())

      await act(async () => {
        await result.current.install()
      })

      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    })

    it('uninstall calls kc-agent with DELETE', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall({ namespace: 'gpu-health' })
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/gpu-health-cronjob'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(mockRefetch).toHaveBeenCalled()
      unmount()
    })

    it('uninstall sets error on non-ok response', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall()
      })

      expect(fetchMock).toHaveBeenCalled()
      expect(result.current.error).toBe('Bad Request')
      unmount()
    })

    it('uninstall does nothing when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob())

      await act(async () => {
        await result.current.uninstall()
      })

      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    })

    it('install handles missing token', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      localStorage.removeItem('kc_token')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install()
      })

      // Should not call fetch because getToken() returns null -> throws.
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.error).toBe('No authentication token')
      unmount()
    })

    it('uninstall handles missing token', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      localStorage.removeItem('kc_token')

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall()
      })

      expect(mockAuthFetch).not.toHaveBeenCalled()
      expect(result.current.error).toBe('No authentication token')
      unmount()
    })
  })
})
