import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
vi.mock('../useWorkloads', () => ({
    createCachedHook: vi.fn(),}))
vi.mock('../../lib/schemas/validate', () => ({
    createCachedHook: vi.fn(),
  validateResponse: (_schema: unknown, data: unknown) => data,
  validateArrayResponse: (_schema: unknown, data: unknown) => data,
}))
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
describe('useCachedData', () => {
  let mod: typeof import('../useCachedData')
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('kc_token', 'test-jwt-token')
    mockClusterCacheRef.clusters = []
    mockUseCache.mockImplementation((opts: { initialData: unknown }) =>
      makeCacheResult(opts.initialData)
    )
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  async function loadModule() {
    mod = await import('../useCachedData')
    return mod
  }
  describe('SSE streaming data flow', () => {
    it('services progressiveFetcher delivers data via SSE or REST fallback', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'sse-svc' }])
        return [{ name: 'sse-svc' }]
      })
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      const svcRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ services: [{ name: 'rest-svc' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(svcRes))
      const { useCachedServices } = await loadModule()
      useCachedServices()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(result.length).toBeGreaterThanOrEqual(1)
      vi.unstubAllGlobals()
    })
    it('nodes progressive fetcher falls back to REST when SSE fails', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockFetchSSE.mockRejectedValue(new Error('SSE connection failed'))
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      const nodeRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ nodes: [{ name: 'rest-node' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nodeRes))
      const { useCachedNodes } = await loadModule()
      useCachedNodes()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(result.length).toBeGreaterThanOrEqual(1)
      vi.unstubAllGlobals()
    })
    it('fetchViaSSE skips SSE when no token and falls back to REST', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      localStorage.removeItem('kc_token')
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      localStorage.setItem('kc_token', 'test-jwt-token')
      mockIsBackendUnavailable.mockReturnValue(true)
      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'no-sse-pod' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
      vi.unstubAllGlobals()
    })
    it('fetchViaSSE skips SSE when demo-token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      localStorage.setItem('kc_token', 'demo-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
    it('fetchViaSSE skips SSE when backend is unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockIsBackendUnavailable.mockReturnValue(true)
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters
      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
    it('GPU nodes progressiveFetcher delivers data via SSE or REST', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'gpu-n1' }])
        opts.onClusterData('c2', [{ name: 'gpu-n2' }])
        return [{ name: 'gpu-n1' }, { name: 'gpu-n2' }]
      })
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }] as typeof mockClusterCacheRef.clusters
      const nodeRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ nodes: [{ name: 'rest-gpu' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nodeRes))
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes()
      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)
      expect(result.length).toBeGreaterThanOrEqual(1)
      vi.unstubAllGlobals()
    })
  })
  describe('local agent fetcher paths', () => {
    it('useCachedPodIssues fetcher uses agent when clusters available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'crash-pod', namespace: 'default', status: 'CrashLoopBackOff', restarts: 5 },
      ])
      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues('prod')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      expect(issues).toHaveLength(1)
      expect(issues[0]).toHaveProperty('cluster', 'prod')
      expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('prod-ctx', undefined)
    })
    it('useCachedPodIssues fetcher: agent all-clusters path uses fetchPodIssuesViaAgent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [ { name: 'c1', context: 'c1-ctx', reachable: true }, { name: 'c2', context: 'c2-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 2 },
      ])
      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues() // no cluster -> all clusters via agent
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      expect(issues.length).toBeGreaterThanOrEqual(1)
    })
    it('useCachedPodIssues fetcher: falls back to REST when agent unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const issueRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'rest-issue', restarts: 1 }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(issueRes))
      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      expect(issues.length).toBeGreaterThanOrEqual(1)
      vi.unstubAllGlobals()
    })
    it('useCachedDeployments fetcher uses agent for single cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ deployments: [{ name: 'dep1', namespace: 'default' }] }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('prod')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const deployments = await fetcher()
      expect(deployments).toHaveLength(1)
      expect(deployments[0]).toHaveProperty('cluster', 'prod')
      vi.unstubAllGlobals()
    })
    it('useCachedDeployments fetcher: agent returns non-ok response for single cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [ { name: 'prod', context: 'prod-ctx', reachable: true }, { name: 'staging', context: 'staging-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      const agentNonOk = { ok: false, status: 500, json: vi.fn() }
      const agentOk = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'dep2' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(agentNonOk).mockResolvedValue(agentOk))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('prod')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const deployments = await fetcher()
      expect(Array.isArray(deployments)).toBe(true)
      vi.unstubAllGlobals()
    })
    it('useCachedDeployments fetcher: agent JSON parse fails returns empty for single cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)
      const agentBadJson = { ok: true, json: vi.fn().mockRejectedValue(new Error('invalid json')) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentBadJson))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('prod')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const deployments = await fetcher()
      expect(deployments).toEqual([])
      vi.unstubAllGlobals()
    })
    it('useCachedDeployments fetcher: falls back to REST API when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      const restRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ deployments: [{ name: 'rest-dep' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('my-cluster')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const deployments = await fetcher()
      expect(deployments).toHaveLength(1)
      vi.unstubAllGlobals()
    })
    it('useCachedDeployments fetcher: throws when both agent and backend unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()
      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })
})
