import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
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
  describe('fetchFromAllClusters edge cases', () => {
    it('throws when no clusters are available from any source', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
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
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')
      vi.unstubAllGlobals()
    })
  })
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
      renderHook(() => useCachedDeploymentIssues('my-cluster'))
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
})
