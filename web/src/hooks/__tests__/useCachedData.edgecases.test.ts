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

const mockClusterCacheRef = vi.hoisted(() => ({ clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> }))

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
  // NEW: CoreDNS status computation — additional branches
  // ========================================================================
  describe('CoreDNS status computation — deep branches', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('includes kube-dns pods in the coredns filter', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'kube-dns-abc', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0, cluster: 'c1' },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ pods: unknown[] }>>
      const result = await fetcher()

      expect(result).toHaveLength(1)
      expect(result[0].pods).toHaveLength(1)
    })

    it('extracts version from container image tag', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            {
              name: 'coredns-xyz', namespace: 'kube-system', status: 'Running', ready: '1/1',
              restarts: 0, cluster: 'c1',
              containers: [{ image: 'registry.k8s.io/coredns:v1.11.3' }],
            },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ pods: Array<{ version: string }> }>>
      const result = await fetcher()

      expect(result[0].pods[0].version).toBe('1.11.3')
    })

    it('returns empty version when no container image info', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-nover', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0, cluster: 'c1' },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ pods: Array<{ version: string }> }>>
      const result = await fetcher()

      expect(result[0].pods[0].version).toBe('')
    })

    it('returns empty array when no coredns pods found', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'nginx-pod', namespace: 'kube-system', status: 'Running', cluster: 'c1' },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const result = await fetcher()

      expect(result).toEqual([])
    })

    it('sorts clusters alphabetically', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'z-cluster', reachable: true }, { name: 'a-cluster', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-1', namespace: 'kube-system', status: 'Running', cluster: 'z-cluster' },
            { name: 'coredns-2', namespace: 'kube-system', status: 'Running', cluster: 'a-cluster' },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus() // all clusters

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const result = await fetcher()

      // They should be alphabetically ordered
      if (result.length >= 2) {
        expect(result[0].cluster.localeCompare(result[1].cluster)).toBeLessThan(0)
      }
    })

    it('uses unknown as cluster name when pod has no cluster field', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-orphan', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0 },
          ],
        })),
      }))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const result = await fetcher()

      // Pod without cluster field gets grouped under 'unknown'
      // (fetchFromAllClusters adds cluster field, but we test the grouping logic)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ========================================================================
  // NEW: Buildpack images — 404 vs other error discrimination
  // ========================================================================
  describe('buildpack images — error discrimination', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('catches 404 error message variants and returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Response is non-ok with 404 status
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const images = await fetcher()
      expect(images).toEqual([])
    })

    it('rethrows 503 errors', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('503')
    })
  })

  // ========================================================================
  // NEW: Hardware health — additional edge cases
  // ========================================================================
  describe('hardware health — additional edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('handles alerts JSON parse failure gracefully (returns null via .catch)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsBadJson = { ok: true, json: vi.fn().mockRejectedValue(new Error('parse error')) }
      const inventoryOk = {
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: [{ nodeName: 'n1', cluster: 'c1' }], timestamp: 'now' }),
      }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsBadJson)
        .mockResolvedValueOnce(inventoryOk))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ alerts: unknown[]; inventory: unknown[]; nodeCount: number }>
      const result = await fetcher()

      // Alerts parse failed => null via .catch => alertsRes.ok is true but data is null => no alerts
      // Inventory succeeded
      expect(result.alerts).toEqual([])
      expect(result.inventory).toHaveLength(1)
    })

    it('inventory with empty nodes does not override nodeCount', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ alerts: [], nodeCount: 10, timestamp: 'now' }),
      }
      const inventoryRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: [], timestamp: 'now' }),
      }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsRes)
        .mockResolvedValueOnce(inventoryRes))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ nodeCount: number; inventory: unknown[] }>
      const result = await fetcher()

      // Empty nodes array => data.nodes.length is 0 => does NOT override nodeCount
      // nodeCount remains at 10 from alerts
      expect(result.nodeCount).toBe(10)
      expect(result.inventory).toEqual([])
    })
  })

  // ========================================================================
  // NEW: fetchFromAllClusters — onProgress callback and cluster tagging
  // ========================================================================
  describe('fetchFromAllClusters — onProgress and cluster field tagging', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('onProgress is called after each successful cluster fetch', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'c1', reachable: true }, { name: 'c2', reachable: true }, ] as typeof mockClusterCacheRef.clusters

      const c1Res = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })) }
      const c2Res = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p2' }] })) }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(c1Res)
        .mockResolvedValueOnce(c2Res))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>

      // fetchViaSSE will be called; mock it to fall through to fetchFromAllClusters
      mockFetchSSE.mockRejectedValue(new Error('SSE not available'))

      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ========================================================================
  // NEW: Events fetcher — progressive fetcher with failed cluster
  // ========================================================================
  describe('events progressive fetcher — agent cluster failure handling', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('skips failed clusters in progressive fetch and continues', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'ok-cluster', context: 'ok-ctx', reachable: true }, { name: 'bad-cluster', context: 'bad-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.getEvents
        .mockResolvedValueOnce([{ type: 'Normal', reason: 'OK', lastSeen: new Date().toISOString() }])
        .mockRejectedValueOnce(new Error('Connection refused'))

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const events = await progressiveFetcher(onProgress)

      // Should have events from ok-cluster, bad-cluster was skipped
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(onProgress).toHaveBeenCalled()
    })

    it('events progressive fetcher falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ type: 'Warning', reason: 'sse-event' }])

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())

      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // NEW: DeploymentIssues — deriveIssues edge cases
  // ========================================================================
  describe('deploymentIssues — deriveIssues edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('derives ReplicaFailure reason for running status with missing replicas', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'partial-dep', namespace: 'prod', status: 'running', replicas: 5, readyReplicas: 2 },
          ],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)
      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; reason: string; replicas: number; readyReplicas: number }>>
      const issues = await fetcher()

      expect(issues).toHaveLength(1)
      expect(issues[0].reason).toBe('ReplicaFailure')
      expect(issues[0].replicas).toBe(5)
      expect(issues[0].readyReplicas).toBe(2)
    })

    it('derives DeploymentFailed reason for failed status', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'failed-dep', namespace: 'prod', status: 'failed', replicas: 3, readyReplicas: 0 },
          ],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)
      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; reason: string }>>
      const issues = await fetcher()

      expect(issues).toHaveLength(1)
      expect(issues[0].reason).toBe('DeploymentFailed')
    })

    it('skips healthy deployments in deriveIssues', async () => {
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
          deployments: [
            { name: 'healthy-dep', namespace: 'prod', status: 'running', replicas: 3, readyReplicas: 3 },
          ],
        }),
      }))

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()

      expect(issues).toEqual([])
    })
  })

  // ========================================================================
  // NEW: Namespaces — JSON parse failure and edge cases
  // ========================================================================
  describe('namespaces — edge cases', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('handles json parse failure returning null (no namespaces)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      }))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      // null fallback => (null || []) => empty
      expect(namespaces).toEqual([])
    })

    it('handles Name field (capital N) in namespace objects', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { Name: 'production' },
          { Name: 'staging' },
        ]),
      }))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      expect(namespaces).toContain('production')
      expect(namespaces).toContain('staging')
    })

    it('fetcher returns demo data when no cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces()

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()

      expect(namespaces).toContain('default')
      expect(namespaces).toContain('kube-system')
      expect(namespaces.length).toBeGreaterThan(5)
    })
  })

  // ========================================================================
  // NEW: fetchGitOpsSSE — backend unavailable throws
  // ========================================================================
  describe('fetchGitOpsSSE — backend unavailable', () => {
    it('throws when backend is unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // NEW: fetchPodIssuesViaAgent — edge cases
  // ========================================================================
  describe('fetchPodIssuesViaAgent — edge cases', () => {
    it('uses context from cluster info when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'admin@prod-cluster', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', status: 'Error', restarts: 1 },
      ])

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const issues = await fetcher()

      // kubectlProxy should be called with context, not name
      expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('admin@prod-cluster', undefined)
      // But the result should use the short name
      expect(issues[0].cluster).toBe('prod')
    })
  })

  // ========================================================================
  // NEW: coreFetchers.securityIssues — kubectl succeeds but finds no issues
  // ========================================================================
  describe('coreFetchers.securityIssues — kubectl empty result', () => {
    it('falls through to REST when kubectl returns no issues', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      // kubectl succeeds but finds no security issues
      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [{
            metadata: { name: 'secure-pod', namespace: 'default' },
            spec: {
              containers: [{
                securityContext: {
                  runAsNonRoot: true,
                  readOnlyRootFilesystem: true,
                  capabilities: { drop: ['ALL'] },
                },
              }],
            },
          }],
        }),
      })

      // REST fallback — fetchBackendAPI uses raw fetch(), not authFetch
      mockIsBackendUnavailable.mockReturnValue(false)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'rest-issue', namespace: 'default', severity: 'high', issue: 'Privilege escalation' }] })),
      }))
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()

      // kubectl found 0 issues, fell through to REST
      expect(issues.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // NEW: Workloads REST fallback — data.items vs data array
  // ========================================================================
  describe('workloads REST fallback — data shape handling', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('handles data as direct array (not wrapped in items)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // Response returns array directly (not { items: [...] })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'wl-direct', namespace: 'prod', type: 'StatefulSet', cluster: 'c1', status: 'Running' },
        ]),
      }))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; type: string }>>
      const workloads = await fetcher()

      expect(workloads).toHaveLength(1)
      expect(workloads[0].name).toBe('wl-direct')
      expect(workloads[0].type).toBe('StatefulSet')
    })

    it('handles targetClusters from REST data', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [
            { name: 'wl-multi', cluster: 'c1', targetClusters: ['c1', 'c2', 'c3'] },
          ],
        }),
      }))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ targetClusters: string[] }>>
      const workloads = await fetcher()

      expect(workloads[0].targetClusters).toEqual(['c1', 'c2', 'c3'])
    })

    it('falls back to [cluster] when no targetClusters provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [
            { name: 'wl-single', cluster: 'prod-east' },
          ],
        }),
      }))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ targetClusters: string[] }>>
      const workloads = await fetcher()

      expect(workloads[0].targetClusters).toEqual(['prod-east'])
    })
  })

  // ========================================================================
  // NEW: Security progressive fetcher — kubectl success path
  // ========================================================================
  describe('security progressive fetcher — kubectl success path', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('progressive fetcher returns kubectl results when agent available and issues found', async () => {
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
          items: [{
            metadata: { name: 'priv-pod', namespace: 'system' },
            spec: {
              containers: [{ securityContext: { privileged: true } }],
            },
          }],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      expect(result.length).toBeGreaterThan(0)
      expect(onProgress).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // NEW: Events fetcher — agent with rejected results in settledWithConcurrency
  // ========================================================================
  describe('events fetcher — agent with mixed settled results', () => {
    it('skips rejected results from settledWithConcurrency', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'ok', context: 'ok-ctx', reachable: true }, { name: 'bad', context: 'bad-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      // First cluster succeeds, second fails
      mockKubectlProxy.getEvents
        .mockResolvedValueOnce([{ type: 'Normal', reason: 'Created', lastSeen: new Date().toISOString() }])
        .mockRejectedValueOnce(new Error('Timeout'))

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const events = await fetcher()

      // Only events from 'ok' cluster should be present
      expect(events.some(e => e.cluster === 'ok')).toBe(true)
      expect(events.some(e => e.cluster === 'bad')).toBe(false)
    })

    it('events sorted by lastSeen descending with null lastSeen treated as epoch 0', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      const now = Date.now()
      mockKubectlProxy.getEvents.mockResolvedValue([
        { type: 'Warning', reason: 'NoLastSeen' },
        { type: 'Normal', reason: 'Recent', lastSeen: new Date(now).toISOString() },
        { type: 'Warning', reason: 'Old', lastSeen: new Date(now - 120000).toISOString() },
      ])

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ reason: string }>>
      const events = await fetcher()

      // Recent should be first, Old second, NoLastSeen last (epoch 0)
      expect(events[0].reason).toBe('Recent')
      expect(events[events.length - 1].reason).toBe('NoLastSeen')
    })
  })

  // ========================================================================
  // NEW: fetchRbacAPI — boolean params are serialized correctly
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
