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
      await expect(fetcher()).rejects.toThrow()
    })
  })
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
      localStorage.removeItem('kc_token')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })
    it('fetcher uses same-origin cookies when only kc-has-session is present', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })
      localStorage.removeItem('kc_token')
      localStorage.setItem('kc-has-session', 'true')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'cookie-pod' }] })),
      }))
      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[1].credentials).toBe('same-origin')
      expect(fetchCall[1].headers.Authorization).toBeUndefined()
      expect(fetchCall[1].headers['X-Requested-With']).toBe('XMLHttpRequest')
      vi.unstubAllGlobals()
    })
  })
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
})
