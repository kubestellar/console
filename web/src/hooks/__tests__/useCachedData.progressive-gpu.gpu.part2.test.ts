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
})
