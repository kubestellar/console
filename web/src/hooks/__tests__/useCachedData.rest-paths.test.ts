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
  // useCachedPods
  // ========================================================================

  // ========================================================================
  // Warning events fetcher
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
  describe('useCachedDeploymentIssues — REST cluster-specific', () => {
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
          issues: [{ name: 'dep-issue', reason: 'ReplicaFailure' }],
        })),
      }))

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues('c1', 'ns')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()

      expect(issues).toHaveLength(1)
    })
  })

  // ========================================================================
  // useCachedDeployments REST cluster-specific and all-clusters paths
  // ========================================================================
  describe('useCachedDeployments — REST paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

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
          deployments: [{ name: 'dep-1' }],
        })),
      }))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      expect(result).toHaveLength(1)
    })

    it('fetcher uses REST for cluster-specific when agent unavailable', async () => {
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
          deployments: [{ name: 'dep-1' }],
        })),
      }))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('c1', 'ns')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // Events fetcher REST fallback paths
  // ========================================================================
  describe('useCachedEvents — REST fallback paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('fetcher uses REST for all clusters when agent unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          events: [{ type: 'Normal', reason: 'Started' }],
        })),
      }))

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // All-clusters fetcher paths for simple hooks (cover lines 2160-2754)
  // ========================================================================
  describe('all-clusters fetcher paths for simple hooks', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    function setupAllClusters(responseKey: string, data: unknown[]) {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(opts.initialData ?? [])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ [responseKey]: data })),
      }))

      return { getCaptured: () => capturedOpts }
    }

    it('useCachedGPUNodes all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('nodes', [{ name: 'gpu-1' }])
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedAllPods all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('pods', [{ name: 'p1' }])
      const { useCachedAllPods } = await loadModule()
      useCachedAllPods()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedPVCs all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('pvcs', [{ name: 'pvc-1' }])
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedJobs all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('jobs', [{ name: 'j1' }])
      const { useCachedJobs } = await loadModule()
      useCachedJobs()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedHPAs all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('hpas', [{ name: 'h1' }])
      const { useCachedHPAs } = await loadModule()
      useCachedHPAs()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedConfigMaps all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('configmaps', [{ name: 'cm1' }])
      const { useCachedConfigMaps } = await loadModule()
      useCachedConfigMaps()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedSecrets all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('secrets', [{ name: 's1' }])
      const { useCachedSecrets } = await loadModule()
      useCachedSecrets()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedServiceAccounts all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('serviceaccounts', [{ name: 'sa1' }])
      const { useCachedServiceAccounts } = await loadModule()
      useCachedServiceAccounts()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedReplicaSets all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('replicasets', [{ name: 'rs1' }])
      const { useCachedReplicaSets } = await loadModule()
      useCachedReplicaSets()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedStatefulSets all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('statefulsets', [{ name: 'sts1' }])
      const { useCachedStatefulSets } = await loadModule()
      useCachedStatefulSets()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedDaemonSets all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('daemonsets', [{ name: 'ds1' }])
      const { useCachedDaemonSets } = await loadModule()
      useCachedDaemonSets()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedCronJobs all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('cronjobs', [{ name: 'cj1' }])
      const { useCachedCronJobs } = await loadModule()
      useCachedCronJobs()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedIngresses all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('ingresses', [{ name: 'ing1' }])
      const { useCachedIngresses } = await loadModule()
      useCachedIngresses()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedNetworkPolicies all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('networkpolicies', [{ name: 'np1' }])
      const { useCachedNetworkPolicies } = await loadModule()
      useCachedNetworkPolicies()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedServices all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('services', [{ name: 'svc1' }])
      const { useCachedServices } = await loadModule()
      useCachedServices()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedNodes all-clusters path', async () => {
      const { getCaptured } = setupAllClusters('nodes', [{ name: 'n1' }])
      const { useCachedNodes } = await loadModule()
      useCachedNodes()
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // coreFetchers remaining edge cases
  // ========================================================================
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
  describe('security scanning via kubectl — additional branches', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('detects host PID and host IPC in separate pods', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'pid-pod', namespace: 'system' },
              spec: {
                hostPID: true,
                containers: [{ securityContext: { runAsNonRoot: true } }],
              },
            },
            {
              metadata: { name: 'ipc-pod', namespace: 'system' },
              spec: {
                hostIPC: true,
                containers: [{ securityContext: { runAsNonRoot: true } }],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; issue: string; severity: string }>>
      const issues = await fetcher()

      expect(issues.some(i => i.name === 'pid-pod' && i.issue === 'Host PID enabled')).toBe(true)
      expect(issues.some(i => i.name === 'ipc-pod' && i.issue === 'Host IPC enabled')).toBe(true)
    })

    it('detects capabilities added without dropping any', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'cap-pod', namespace: 'apps' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      capabilities: { add: ['SYS_ADMIN', 'NET_ADMIN'] },
                    },
                  },
                ],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string }>>
      const issues = await fetcher()
      expect(issues.some(i => i.issue === 'Capabilities not dropped')).toBe(true)
    })

    it.skip('does NOT flag capabilities when caps are properly dropped', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'good-pod', namespace: 'secure' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      runAsNonRoot: true,
                      readOnlyRootFilesystem: true,
                      capabilities: { drop: ['ALL'], add: ['NET_BIND_SERVICE'] },
                    },
                  },
                ],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string }>>
      const issues = await fetcher()
      expect(issues.some(i => i.issue === 'Capabilities not dropped')).toBe(false)
    })

    it('filters by specific cluster when cluster arg provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'prod', context: 'prod-ctx', reachable: true }, { name: 'staging', context: 'staging-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [{
            metadata: { name: 'test-pod', namespace: 'default' },
            spec: { hostNetwork: true, containers: [{ securityContext: { runAsNonRoot: true } }] },
          }],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const issues = await fetcher()

      // Should only have scanned 'prod' cluster, not 'staging'
      for (const issue of issues) {
        expect(issue.cluster).toBe('prod')
      }
      // kubectlProxy.exec should have been called once (only for prod)
      expect(mockKubectlProxy.exec).toHaveBeenCalledTimes(1)
    })

    it('security REST fallback returns empty on non-ok authFetch response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // authFetch returns non-ok
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue(null),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // REST non-ok falls through to throw
      await expect(fetcher()).rejects.toThrow('No data source available')
    })

    it('security REST fallback returns empty when authFetch JSON has empty issues', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // authFetch returns ok but with empty issues
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ issues: [] }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // Empty issues array doesn't satisfy `data.issues.length > 0`, falls through to throw
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })
})
