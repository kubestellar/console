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

    it('fetcher reuses the deployments REST path for a single cluster', async () => {
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
          deployments: [
            { name: 'healthy-dep', namespace: 'ns', replicas: 2, readyReplicas: 2, status: 'running' },
            { name: 'dep-issue', namespace: 'ns', replicas: 2, readyReplicas: 1, status: 'running' },
          ],
        })),
      }))

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues('c1', 'ns'))

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; cluster?: string }>>
      const deployments = await fetcher()

      expect(deployments).toHaveLength(2)
      expect(deployments).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'healthy-dep', cluster: 'c1' }),
        expect.objectContaining({ name: 'dep-issue', cluster: 'c1' }),
      ]))
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
})
