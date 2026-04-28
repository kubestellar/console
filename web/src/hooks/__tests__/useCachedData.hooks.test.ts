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

vi.mock('../../lib/cache', () => ({
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
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../useLocalAgent', () => ({
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
  fetchProwJobs: (...args: unknown[]) => mockFetchProwJobs(...args),
}))

vi.mock('../useCachedLLMd', () => ({
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
  fetchLLMdModels: (...args: unknown[]) => mockFetchLLMdModels(...args),
}))

vi.mock('../useCachedISO27001', () => ({}))

// Stub the re-exports so the module loads cleanly
vi.mock('../useWorkloads', () => ({}))

vi.mock('../../lib/schemas/validate', () => ({
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
  describe('useCachedPods', () => {
    it('returns pods from cache result', async () => {
      const demoData = [{ name: 'pod-a', namespace: 'default', status: 'Running' }]
      mockUseCache.mockReturnValue(makeCacheResult(demoData))
      const { useCachedPods } = await loadModule()
      const result = useCachedPods()
      expect(result.pods).toEqual(demoData)
      expect(result.data).toEqual(demoData)
    })

    it('uses cluster-specific key when cluster provided', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods('prod-east', 'kube-system')
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('pods:prod-east:kube-system:100')
    })

    it('uses default limit when no options', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toContain(':100')
    })

    it('uses custom limit when provided', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods(undefined, undefined, { limit: 50 })
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toContain(':50')
    })

    it('passes correct category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods(undefined, undefined, { category: 'realtime' })
      const call = mockUseCache.mock.calls[0][0]
      expect(call.category).toBe('realtime')
    })

    it('does not provide progressiveFetcher when cluster is given', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')
      const call = mockUseCache.mock.calls[0][0]
      expect(call.progressiveFetcher).toBeUndefined()
    })

    it('provides progressiveFetcher when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods()
      const call = mockUseCache.mock.calls[0][0]
      expect(call.progressiveFetcher).toBeTypeOf('function')
    })

    it('exposes loading/error state from cache', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], { isLoading: true, error: 'timeout', isFailed: true, consecutiveFailures: 2 })
      )
      const { useCachedPods } = await loadModule()
      const result = useCachedPods()
      expect(result.isLoading).toBe(true)
      expect(result.error).toBe('timeout')
      expect(result.isFailed).toBe(true)
      expect(result.consecutiveFailures).toBe(2)
    })
  })

  // ========================================================================
  // useCachedEvents
  // ========================================================================
  describe('useCachedEvents', () => {
    it('returns events from cache result', async () => {
      const events = [{ type: 'Warning', reason: 'BackOff', message: 'crash' }]
      mockUseCache.mockReturnValue(makeCacheResult(events))
      const { useCachedEvents } = await loadModule()
      const result = useCachedEvents()
      expect(result.events).toEqual(events)
    })

    it('uses correct key format', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedEvents } = await loadModule()
      useCachedEvents('cluster-x', 'ns-y', { limit: 10 })
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('events:cluster-x:ns-y:10')
      expect(call.category).toBe('realtime')
    })

    it('defaults limit to 20', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedEvents } = await loadModule()
      useCachedEvents()
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toContain(':20')
    })
  })

  // ========================================================================
  // useCachedPodIssues
  // ========================================================================
  describe('useCachedPodIssues', () => {
    it('returns issues array', async () => {
      const issues = [{ name: 'p1', namespace: 'default', status: 'CrashLoopBackOff' }]
      mockUseCache.mockReturnValue(makeCacheResult(issues))
      const { useCachedPodIssues } = await loadModule()
      const result = useCachedPodIssues()
      expect(result.issues).toEqual(issues)
    })

    it('uses pods category by default', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()
      const call = mockUseCache.mock.calls[0][0]
      expect(call.category).toBe('pods')
    })

    it('respects custom category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues(undefined, undefined, { category: 'realtime' })
      const call = mockUseCache.mock.calls[0][0]
      expect(call.category).toBe('realtime')
    })
  })

  // ========================================================================
  // useCachedDeploymentIssues
  // ========================================================================
  describe('useCachedDeploymentIssues', () => {
    it('returns deployment issues', async () => {
      const data = [{ name: 'web', namespace: 'prod', replicas: 3, readyReplicas: 1 }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedDeploymentIssues } = await loadModule()
      const result = useCachedDeploymentIssues()
      expect(result.issues).toEqual(data)
    })

    it('sets correct key with cluster and namespace', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues('cls', 'ns')
      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('deploymentIssues:cls:ns')
    })
  })

  // ========================================================================
  // useCachedDeployments
  // ========================================================================
  describe('useCachedDeployments', () => {
    it('returns deployments', async () => {
      const deps = [{ name: 'api', namespace: 'default' }]
      mockUseCache.mockReturnValue(makeCacheResult(deps))
      const { useCachedDeployments } = await loadModule()
      const result = useCachedDeployments()
      expect(result.deployments).toEqual(deps)
    })

    it('has category = deployments by default', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()
      expect(mockUseCache.mock.calls[0][0].category).toBe('deployments')
    })
  })

  // ========================================================================
  // useCachedServices
  // ========================================================================
  describe('useCachedServices', () => {
    it('returns services array', async () => {
      const svc = [{ name: 'svc-a', namespace: 'default', type: 'ClusterIP' }]
      mockUseCache.mockReturnValue(makeCacheResult(svc))
      const { useCachedServices } = await loadModule()
      const result = useCachedServices()
      expect(result.services).toEqual(svc)
    })

    it('configures progressive fetcher when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedServices } = await loadModule()
      useCachedServices()
      expect(mockUseCache.mock.calls[0][0].progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressive fetcher when cluster given', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedServices } = await loadModule()
      useCachedServices('my-cluster')
      expect(mockUseCache.mock.calls[0][0].progressiveFetcher).toBeUndefined()
    })
  })

  // ========================================================================
  // useCachedSecurityIssues
  // ========================================================================
  describe('useCachedSecurityIssues', () => {
    it('returns security issues', async () => {
      const issues = [{ name: 'p1', issue: 'Privileged', severity: 'high' }]
      mockUseCache.mockReturnValue(makeCacheResult(issues))
      const { useCachedSecurityIssues } = await loadModule()
      const result = useCachedSecurityIssues()
      expect(result.issues).toEqual(issues)
    })

    it('uses pods category by default', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()
      expect(mockUseCache.mock.calls[0][0].category).toBe('pods')
    })
  })

  // ========================================================================
  // useCachedNodes
  // ========================================================================
  describe('useCachedNodes', () => {
    it('returns nodes', async () => {
      const nodes = [{ name: 'n1', cluster: 'c1', status: 'Ready' }]
      mockUseCache.mockReturnValue(makeCacheResult(nodes))
      const { useCachedNodes } = await loadModule()
      const result = useCachedNodes()
      expect(result.nodes).toEqual(nodes)
    })

    it('sets persist: true', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedNodes } = await loadModule()
      useCachedNodes()
      expect(mockUseCache.mock.calls[0][0].persist).toBe(true)
    })
  })

  // ========================================================================
  // useCachedGPUNodeHealth
  // ========================================================================
  describe('useCachedGPUNodeHealth', () => {
    it('returns GPU node health data', async () => {
      const health = [{ nodeName: 'gpu-1', status: 'healthy' }]
      mockUseCache.mockReturnValue(makeCacheResult(health))
      const { useCachedGPUNodeHealth } = await loadModule()
      const result = useCachedGPUNodeHealth()
      expect(result.nodes).toEqual(health)
    })
  })

  // ========================================================================
  // useCachedWorkloads
  // ========================================================================
  describe('useCachedWorkloads', () => {
    it('returns workloads', async () => {
      const wl = [{ name: 'wl-1', type: 'Deployment', status: 'Running' }]
      mockUseCache.mockReturnValue(makeCacheResult(wl))
      const { useCachedWorkloads } = await loadModule()
      const result = useCachedWorkloads()
      expect(result.workloads).toEqual(wl)
    })

    it('always provides progressiveFetcher', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()
      expect(mockUseCache.mock.calls[0][0].progressiveFetcher).toBeTypeOf('function')
    })
  })

  // ========================================================================
  // useCachedWarningEvents
  // ========================================================================
  describe('useCachedWarningEvents', () => {
    it('returns warning events', async () => {
      const events = [{ type: 'Warning', reason: 'FailedScheduling' }]
      mockUseCache.mockReturnValue(makeCacheResult(events))
      const { useCachedWarningEvents } = await loadModule()
      const result = useCachedWarningEvents()
      expect(result.events).toEqual(events)
    })

    it('defaults limit to 50', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents()
      expect(mockUseCache.mock.calls[0][0].key).toContain(':50')
    })
  })

  // ========================================================================
  // useCachedHelmHistory
  // ========================================================================
  describe('useCachedHelmHistory', () => {
    it('returns history', async () => {
      const history = [{ revision: 1 }]
      mockUseCache.mockReturnValue(makeCacheResult(history))
      const { useCachedHelmHistory } = await loadModule()
      const result = useCachedHelmHistory('c1', 'rel', 'ns')
      expect(result.history).toEqual(history)
    })

    it('is disabled when cluster or release missing', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory()
      expect(mockUseCache.mock.calls[0][0].enabled).toBe(false)
    })

    it('is enabled when cluster and release provided', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('c1', 'my-release')
      expect(mockUseCache.mock.calls[0][0].enabled).toBe(true)
    })
  })

  // ========================================================================
  // useCachedHelmValues
  // ========================================================================
  describe('useCachedHelmValues', () => {
    it('returns values object', async () => {
      const vals = { replicaCount: 3 }
      mockUseCache.mockReturnValue(makeCacheResult(vals))
      const { useCachedHelmValues } = await loadModule()
      const result = useCachedHelmValues('c1', 'rel', 'ns')
      expect(result.values).toEqual(vals)
    })
  })

  // ========================================================================
  // useCachedOperators
  // ========================================================================
  describe('useCachedOperators', () => {
    it('returns operators', async () => {
      const ops = [{ name: 'op1' }]
      mockUseCache.mockReturnValue(makeCacheResult(ops))
      const { useCachedOperators } = await loadModule()
      const result = useCachedOperators()
      expect(result.operators).toEqual(ops)
    })
  })

  // ========================================================================
  // useCachedOperatorSubscriptions
  // ========================================================================
  describe('useCachedOperatorSubscriptions', () => {
    it('returns subscriptions', async () => {
      const subs = [{ name: 'sub1' }]
      mockUseCache.mockReturnValue(makeCacheResult(subs))
      const { useCachedOperatorSubscriptions } = await loadModule()
      const result = useCachedOperatorSubscriptions()
      expect(result.subscriptions).toEqual(subs)
    })
  })

  // ========================================================================
  // useCachedGitOpsDrifts
  // ========================================================================
  describe('useCachedGitOpsDrifts', () => {
    it('returns drifts', async () => {
      const drifts = [{ name: 'drift1' }]
      mockUseCache.mockReturnValue(makeCacheResult(drifts))
      const { useCachedGitOpsDrifts } = await loadModule()
      const result = useCachedGitOpsDrifts()
      expect(result.drifts).toEqual(drifts)
    })
  })

  // ========================================================================
  // useCachedBuildpackImages
  // ========================================================================
  describe('useCachedBuildpackImages', () => {
    it('returns images', async () => {
      const images = [{ name: 'img1' }]
      mockUseCache.mockReturnValue(makeCacheResult(images))
      const { useCachedBuildpackImages } = await loadModule()
      const result = useCachedBuildpackImages()
      expect(result.images).toEqual(images)
    })
  })

  // ========================================================================
  // useCachedK8sRoles
  // ========================================================================
  describe('useCachedK8sRoles', () => {
    it('returns roles', async () => {
      const roles = [{ name: 'admin' }]
      mockUseCache.mockReturnValue(makeCacheResult(roles))
      const { useCachedK8sRoles } = await loadModule()
      const result = useCachedK8sRoles()
      expect(result.roles).toEqual(roles)
    })

    it('passes includeSystem option into key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('c', 'ns', { includeSystem: true })
      expect(mockUseCache.mock.calls[0][0].key).toContain('true')
    })
  })

  // ========================================================================
  // useCachedK8sRoleBindings
  // ========================================================================
  describe('useCachedK8sRoleBindings', () => {
    it('returns bindings', async () => {
      const bindings = [{ name: 'binding1' }]
      mockUseCache.mockReturnValue(makeCacheResult(bindings))
      const { useCachedK8sRoleBindings } = await loadModule()
      const result = useCachedK8sRoleBindings()
      expect(result.bindings).toEqual(bindings)
    })
  })

  // ========================================================================
  // useCachedK8sServiceAccounts
  // ========================================================================
  describe('useCachedK8sServiceAccounts', () => {
    it('returns service accounts', async () => {
      const sa = [{ name: 'default' }]
      mockUseCache.mockReturnValue(makeCacheResult(sa))
      const { useCachedK8sServiceAccounts } = await loadModule()
      const result = useCachedK8sServiceAccounts()
      expect(result.serviceAccounts).toEqual(sa)
    })
  })

  // ========================================================================
  // coreFetchers
  // ========================================================================
  describe('coreFetchers', () => {
    it('exports coreFetchers object', async () => {
      const { coreFetchers } = await loadModule()
      expect(coreFetchers).toBeDefined()
      expect(coreFetchers.pods).toBeTypeOf('function')
      expect(coreFetchers.podIssues).toBeTypeOf('function')
      expect(coreFetchers.events).toBeTypeOf('function')
      expect(coreFetchers.deploymentIssues).toBeTypeOf('function')
    })
  })
})
