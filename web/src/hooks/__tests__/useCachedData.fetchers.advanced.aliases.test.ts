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
