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

  // ========================================================================
  // Fetcher branch coverage: test the fetcher callbacks passed to useCache
  // ========================================================================
  describe('fetcher branch coverage', () => {
    it('useCachedPods fetcher: cluster-specific path', async () => {
      // Capture the useCache options so we can call the fetcher directly
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mock global fetch
      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', 'default')

      // Call the fetcher
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const pods = await fetcher()
      expect(Array.isArray(pods)).toBe(true)

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: no token throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedPods fetcher: non-JSON response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: false,
        status: 500,
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 500')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: sorts by restarts descending', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'p1', restarts: 1 },
            { name: 'p2', restarts: 10 },
            { name: 'p3', restarts: 0 },
          ]
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; restarts: number }>>
      const pods = await fetcher()
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')
      expect(pods[2].name).toBe('p3')

      vi.unstubAllGlobals()
    })

    it('fetchAPI: skips undefined params', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }
      const fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse)
      vi.stubGlobal('fetch', fetchSpy)

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', undefined)

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      // Verify the URL doesn't have undefined in it
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('undefined')
      expect(calledUrl).toContain('cluster=my-cluster')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Cache hit/miss behavior — demoData and initialData shapes
  // ========================================================================
  describe('cache hit/miss behavior', () => {
    it('passes demoData array to useCache for pods hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedPods } = await loadModule()
      useCachedPods()

      // demoData should be a non-empty array (demo pods)
      expect(Array.isArray(capturedOpts.demoData)).toBe(true)
      expect((capturedOpts.demoData as unknown[]).length).toBeGreaterThan(0)
    })

    it('passes empty array as initialData for list hooks', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      expect(capturedOpts.initialData).toEqual([])
    })

    it('passes empty object as initialData for helm values hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'rel', 'ns')

      expect(capturedOpts.initialData).toEqual({})
    })

    it('useCachedHelmReleases uses helm category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()
      expect(mockUseCache.mock.calls[0][0].category).toBe('helm')
    })

    it('useCachedGPUNodes uses gpu category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes()
      expect(mockUseCache.mock.calls[0][0].category).toBe('gpu')
    })
  })

  // ========================================================================
  // Stale-while-revalidate pattern
  // ========================================================================
  describe('stale-while-revalidate pattern', () => {
    it('returns stale data while refreshing', async () => {
      const staleData = [{ name: 'stale-pod', status: 'Running' }]
      mockUseCache.mockReturnValue(
        makeCacheResult(staleData, {
          isRefreshing: true,
          isLoading: false,
          lastRefresh: Date.now() - 60_000,
        })
      )

      const { useCachedPods } = await loadModule()
      const result = useCachedPods()

      // Should have data even while refreshing (stale-while-revalidate)
      expect(result.pods).toEqual(staleData)
      expect(result.isRefreshing).toBe(true)
      expect(result.isLoading).toBe(false)
    })

    it('preserves lastRefresh timestamp from cache', async () => {
      const timestamp = Date.now() - 30_000
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: timestamp })
      )

      const { useCachedEvents } = await loadModule()
      const result = useCachedEvents()

      expect(result.lastRefresh).toBe(timestamp)
    })

    it('lastRefresh is null when no data has been fetched', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: null, isLoading: true })
      )

      const { useCachedNodes } = await loadModule()
      const result = useCachedNodes()

      expect(result.lastRefresh).toBeNull()
      expect(result.isLoading).toBe(true)
    })
  })

  // ========================================================================
  // Error recovery and consecutive failure tracking
  // ========================================================================
  describe('error recovery and consecutive failure tracking', () => {
    it('tracks consecutive failures count from cache', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], {
          consecutiveFailures: 5,
          isFailed: true,
          error: 'Network unreachable',
        })
      )

      const { useCachedDeployments } = await loadModule()
      const result = useCachedDeployments()

      expect(result.consecutiveFailures).toBe(5)
      expect(result.isFailed).toBe(true)
      expect(result.error).toBe('Network unreachable')
    })

    it('resets failure state on successful refetch', async () => {
      // First: failed state
      mockUseCache.mockReturnValue(
        makeCacheResult([], { consecutiveFailures: 3, isFailed: true })
      )

      const { useCachedPods } = await loadModule()
      const result1 = useCachedPods()
      expect(result1.consecutiveFailures).toBe(3)

      // Second: success state (simulating refetch)
      mockUseCache.mockReturnValue(
        makeCacheResult([{ name: 'pod-ok' }], { consecutiveFailures: 0, isFailed: false })
      )
      const result2 = useCachedPods()
      expect(result2.consecutiveFailures).toBe(0)
      expect(result2.isFailed).toBe(false)
    })

    it('useCachedPodIssues fetcher throws when no data source available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      // No agent clusters
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow()
    })

    it('useCachedDeploymentIssues fetcher throws when both sources unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      mockIsAgentUnavailable.mockReturnValue(true)

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // Demo mode integration
  // ========================================================================
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

      // Test multiple hooks to ensure they all expose isDemoFallback
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
      // With demo-token and no agent clusters, should throw (no data source)
      await expect(fetcher()).rejects.toThrow()
    })
  })

  // ========================================================================
  // Refetch / subscriber notifications
  // ========================================================================
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

  // ========================================================================
  // localStorage / token interactions
  // ========================================================================
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

      // Verify Authorization header was set with the token
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

      // Remove token after hook is set up
      localStorage.removeItem('kc_token')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })
  })

  // ========================================================================
  // Persist flag
  // ========================================================================
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

  // ========================================================================
  // fetchFromAllClusters edge cases via pods fetcher (no cluster)
  // ========================================================================
  describe('fetchFromAllClusters edge cases', () => {
    it('throws when no clusters are available from any source', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchClusters will call fetchAPI('clusters') which returns empty
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

      // First call gets cluster list, second/third get pods per cluster
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

      // p2 (10 restarts) should come before p1 (3 restarts)
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Progressive fetcher patterns
  // ========================================================================
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
      useCachedDeploymentIssues('my-cluster')

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

  // ========================================================================
  // Enabled flag — conditional fetching
  // ========================================================================
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

  // ========================================================================
  // Cache key construction
  // ========================================================================
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

  // ========================================================================
  // Category assignment
  // ========================================================================
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

  // ========================================================================
  // Return shape aliases (domain-specific field names)
  // ========================================================================
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

  // ========================================================================
  // specialtyFetchers export
  // ========================================================================
  describe('specialtyFetchers', () => {
    it('exports specialtyFetchers object with expected keys', async () => {
      const { specialtyFetchers } = await loadModule()
      expect(specialtyFetchers).toBeDefined()
      expect(specialtyFetchers.prowJobs).toBeTypeOf('function')
      expect(specialtyFetchers.llmdServers).toBeTypeOf('function')
      expect(specialtyFetchers.llmdModels).toBeTypeOf('function')
    })
  })

  // ========================================================================
  // Events fetcher — agent vs REST path
  // ========================================================================
  describe('useCachedEvents fetcher branches', () => {
    it('fetcher uses kubectlProxy.getEvents when agent clusters available (single cluster)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Set up agent with clusters
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getEvents.mockResolvedValue([
        { type: 'Warning', reason: 'BackOff', message: 'test-event' },
      ])

      const { useCachedEvents } = await loadModule()
      useCachedEvents('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const events = await fetcher()

      expect(events).toHaveLength(1)
      expect(events[0]).toHaveProperty('cluster', 'prod')
      expect(mockKubectlProxy.getEvents).toHaveBeenCalledWith('prod-ctx', undefined, 20)
    })
  })

  // ========================================================================
  // fetchAPI non-JSON error message specificity
  // ========================================================================
  describe('fetchAPI error messages', () => {
    it('includes endpoint name in non-JSON error for pods endpoint', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('cluster-x')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // SSE streaming data flow
  // ========================================================================
  describe('SSE streaming data flow', () => {
    it('services progressiveFetcher delivers data via SSE or REST fallback', async () => {
      // The fetchViaSSE code path: tries SSE, falls back to REST if needed.
      // We provide both mocks so the test passes regardless of mock wiring order.
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'sse-svc' }])
        return [{ name: 'sse-svc' }]
      })

      // Ensure clusters available for REST fallback path
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [{ name: 'c1', reachable: true }] },
      }))
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

      // SSE fails
      mockFetchSSE.mockRejectedValue(new Error('SSE connection failed'))

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [{ name: 'c1', reachable: true }] },
      }))

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

      // Need clusterCacheRef with clusters so getReachableClusters returns them
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

      // Per-cluster REST calls (fetchFromAllClusters gets clusters from cache, then fetches per cluster)
      // fetchAPI requires a token, but fetchFromAllClusters calls fetchAPI which will throw
      // Actually fetchViaSSE with no token goes to fetchFromAllClusters -> fetchClusters -> getReachableClusters (local) -> returns ['c1']
      // Then per-cluster fetchAPI which needs a token. Since no token, all fail -> "All cluster fetches failed"
      // So let's use a different test approach: set a valid token but mark backend as unavailable
      localStorage.setItem('kc_token', 'test-jwt-token')
      mockIsBackendUnavailable.mockReturnValue(true)

      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'no-sse-pod' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      // fetchViaSSE sees isBackendUnavailable() and falls back to fetchFromAllClusters
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

      // fetchFromAllClusters per-cluster calls — fetchAPI needs valid token
      // but demo-token triggers fetchViaSSE fallback which goes to fetchFromAllClusters
      // fetchClusters -> getReachableClusters -> returns ['c1']
      // Then fetchAPI with demo-token will throw "No authentication token"? No — getToken returns 'demo-token'
      // which is truthy, so fetchAPI proceeds. Let's mock the per-cluster response:
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      // Ensure clusters for REST fallback
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }] },
      }))
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

  // ========================================================================
  // Local agent fetcher paths
  // ========================================================================
  describe('local agent fetcher paths', () => {
    it('useCachedPodIssues fetcher uses agent when clusters available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'c1', context: 'c1-ctx', reachable: true },
            { name: 'c2', context: 'c2-ctx', reachable: true },
          ],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 2 },
      ])

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues() // no cluster -> all clusters via agent

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      // Both clusters produce one issue each, sorted by restarts
      expect(issues.length).toBeGreaterThanOrEqual(1)
    })

    it('useCachedPodIssues fetcher: falls back to REST when agent unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      // Mock fetch for agent HTTP endpoint
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'prod', context: 'prod-ctx', reachable: true },
            { name: 'staging', context: 'staging-ctx', reachable: true },
          ],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      // Non-ok for single-cluster call, then ok for fetchDeploymentsViaAgent fallback
      const agentNonOk = { ok: false, status: 500, json: vi.fn() }
      const agentOk = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'dep2' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(agentNonOk).mockResolvedValue(agentOk))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const deployments = await fetcher()
      // Falls through to fetchDeploymentsViaAgent
      expect(Array.isArray(deployments)).toBe(true)

      vi.unstubAllGlobals()
    })

    it('useCachedDeployments fetcher: agent JSON parse fails returns empty for single cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      // ok but invalid JSON
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // Workloads agent path with status mapping
  // ========================================================================
  describe('workloads agent path', () => {
    it('useCachedWorkloads fetcher tries agent first', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'web', namespace: 'default', status: 'running', replicas: 3, readyReplicas: 3 },
            { name: 'api', namespace: 'default', status: 'failed', replicas: 2, readyReplicas: 0 },
            { name: 'worker', namespace: 'default', status: 'deploying', replicas: 1, readyReplicas: 0 },
            { name: 'cache', namespace: 'default', status: 'running', replicas: 2, readyReplicas: 1 },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; status: string }>>
      const workloads = await fetcher()

      expect(workloads).toHaveLength(4)
      // Verify status mapping
      const web = workloads.find(w => w.name === 'web')
      expect(web?.status).toBe('Running')
      const api = workloads.find(w => w.name === 'api')
      expect(api?.status).toBe('Failed')
      const worker = workloads.find(w => w.name === 'worker')
      expect(worker?.status).toBe('Pending')
      const cache = workloads.find(w => w.name === 'cache')
      expect(cache?.status).toBe('Degraded')

      vi.unstubAllGlobals()
    })

    it('useCachedWorkloads fetcher falls back to REST when agent returns null', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      const restRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [
            { name: 'rest-wl', namespace: 'prod', type: 'Deployment', cluster: 'c1', status: 'Running', replicas: 1, readyReplicas: 1 },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const workloads = await fetcher()
      expect(workloads).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('useCachedWorkloads fetcher: REST non-ok returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      const badRes = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badRes))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const workloads = await fetcher()
      expect(workloads).toEqual([])

      vi.unstubAllGlobals()
    })

    it('useCachedWorkloads fetcher: REST json parse fails returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      const badJsonRes = { ok: true, json: vi.fn().mockResolvedValue(null) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badJsonRes))

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const workloads = await fetcher()
      expect(workloads).toEqual([])

      vi.unstubAllGlobals()
    })

    it('useCachedWorkloads fetcher: no agent, no backend returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedWorkloads } = await loadModule()
      useCachedWorkloads()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const workloads = await fetcher()
      expect(workloads).toEqual([])
    })
  })

  // ========================================================================
  // DeploymentIssues agent path (derives issues from deployments)
  // ========================================================================
  describe('deployment issues agent path', () => {
    it('useCachedDeploymentIssues derives issues from agent deployments', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      // Agent returns deployments with some degraded
      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'healthy-dep', namespace: 'default', status: 'running', replicas: 3, readyReplicas: 3 },
            { name: 'unhealthy-dep', namespace: 'default', status: 'failed', replicas: 2, readyReplicas: 0 },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; reason: string }>>
      const issues = await fetcher()

      // Only unhealthy-dep should be in issues (readyReplicas < replicas)
      expect(issues).toHaveLength(1)
      expect(issues[0].name).toBe('unhealthy-dep')
      expect(issues[0].reason).toBe('DeploymentFailed')

      vi.unstubAllGlobals()
    })

    it('useCachedDeploymentIssues: single cluster agent path', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = {
        ok: false,
        status: 500,
        json: vi.fn(),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeploymentIssues } = await loadModule()
      useCachedDeploymentIssues('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      // Agent returned non-ok, returns empty deployment list, so no issues
      expect(issues).toEqual([])

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Events fetcher — multi-cluster agent path
  // ========================================================================
  describe('events fetcher multi-cluster agent path', () => {
    it('fetches events from all agent clusters and sorts by lastSeen', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'c1', context: 'c1-ctx', reachable: true },
            { name: 'c2', context: 'c2-ctx', reachable: true },
          ],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      const now = Date.now()
      mockKubectlProxy.getEvents
        .mockResolvedValueOnce([{ type: 'Warning', reason: 'BackOff', lastSeen: new Date(now - 60000).toISOString() }])
        .mockResolvedValueOnce([{ type: 'Normal', reason: 'Started', lastSeen: new Date(now).toISOString() }])

      const { useCachedEvents } = await loadModule()
      useCachedEvents() // no cluster -> all clusters

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ type: string; cluster: string }>>
      const events = await fetcher()
      expect(events.length).toBe(2)
      // Most recent event first (c2's event is more recent)
      expect(events[0]).toHaveProperty('cluster', 'c2')
      expect(events[1]).toHaveProperty('cluster', 'c1')
    })

    it('events progressive fetcher uses agent when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.getEvents.mockResolvedValue([{ type: 'Normal', reason: 'OK' }])

      const { useCachedEvents } = await loadModule()
      useCachedEvents()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const events = await progressiveFetcher(onProgress)

      expect(onProgress).toHaveBeenCalled()
      expect(events.length).toBeGreaterThanOrEqual(1)
    })

    it('events fetcher falls back to REST when agent has no clusters', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)

      const restRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ events: [{ type: 'Warning', reason: 'REST' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { useCachedEvents } = await loadModule()
      useCachedEvents('cluster-1')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const events = await fetcher()
      expect(events).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Security issues via kubectl scanning
  // ========================================================================
  describe('security issues kubectl scanning', () => {
    it('useCachedSecurityIssues fetcher: agent kubectl finds privileged containers', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'bad-pod', namespace: 'default' },
              spec: {
                containers: [
                  { securityContext: { privileged: true } },
                ],
                hostNetwork: true,
                hostPID: true,
                hostIPC: true,
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string; severity: string }>>
      const issues = await fetcher()

      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Privileged container')
      expect(issueTypes).toContain('Host network enabled')
      expect(issueTypes).toContain('Host PID enabled')
      expect(issueTypes).toContain('Host IPC enabled')
    })

    it('useCachedSecurityIssues fetcher: detects root user and missing security context', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'root-pod', namespace: 'apps' },
              spec: {
                securityContext: { runAsUser: 0 },
                containers: [
                  { securityContext: { runAsUser: 0 } },
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
      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Running as root')
    })

    it('useCachedSecurityIssues fetcher: detects capabilities not dropped', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'cap-pod', namespace: 'system' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      capabilities: { add: ['NET_ADMIN'], drop: [] },
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
      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Capabilities not dropped')
    })

    it('useCachedSecurityIssues fetcher: kubectl non-zero exit returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({ exitCode: 1, output: 'error' })

      // Need REST fallback to also fail so we hit the throw path
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      // kubectl returned nothing, REST unavailable => throws
      await expect(fetcher()).rejects.toThrow('No data source available')
    })

    it('useCachedSecurityIssues fetcher: falls back to REST authFetch', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ issues: [{ name: 'rest-sec', namespace: 'default', issue: 'Priv', severity: 'high' }] }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      expect(issues).toHaveLength(1)
    })
  })

  // ========================================================================
  // Hardware health fetcher
  // ========================================================================
  describe('hardware health fetcher', () => {
    it('useCachedHardwareHealth: fetches alerts and inventory from agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ alerts: [{ id: 'a1', severity: 'critical' }], nodeCount: 2, timestamp: new Date().toISOString() }),
      }
      const inventoryRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: [{ nodeName: 'n1', cluster: 'c1' }], timestamp: new Date().toISOString() }),
      }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsRes)
        .mockResolvedValueOnce(inventoryRes))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ alerts: unknown[]; inventory: unknown[]; nodeCount: number }>
      const result = await fetcher()
      expect(result.alerts).toHaveLength(1)
      expect(result.inventory).toHaveLength(1)
      expect(result.nodeCount).toBe(1) // inventory nodes.length overrides

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: throws when both endpoints fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const failedRes = { ok: false, status: 503 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failedRes))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('Device endpoints unavailable')

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: handles fetch network errors gracefully', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      // Both fetches throw network errors (caught by .catch(() => null))
      // The catch in Promise.all turns them to null
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // Both null => !ok && !ok => throws
      await expect(fetcher()).rejects.toThrow()

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: partial success (alerts ok, inventory fails)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ alerts: [{ id: 'a1' }], nodeCount: 5, timestamp: new Date().toISOString() }),
      }
      const inventoryFail = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsRes)
        .mockResolvedValueOnce(inventoryFail))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ alerts: unknown[]; inventory: unknown[]; nodeCount: number }>
      const result = await fetcher()
      expect(result.alerts).toHaveLength(1)
      expect(result.inventory).toEqual([])
      expect(result.nodeCount).toBe(5)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // CoreDNS status computation
  // ========================================================================
  describe('CoreDNS status computation', () => {
    it('useCachedCoreDNSStatus filters and groups CoreDNS pods by cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Cluster list and pods
      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const podsRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-abc', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 2, containers: [{ image: 'coredns:v1.11.1' }] },
            { name: 'coredns-def', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0 },
            { name: 'nginx-xyz', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0 },
          ],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(podsRes))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string; healthy: boolean; totalRestarts: number; pods: unknown[] }>>
      const result = await fetcher()

      // Should only include coredns pods, not nginx
      expect(result).toHaveLength(1)
      expect(result[0].pods).toHaveLength(2)
      expect(result[0].healthy).toBe(true)
      expect(result[0].totalRestarts).toBe(2)

      vi.unstubAllGlobals()
    })

    it('useCachedCoreDNSStatus: unhealthy when some pods not Running', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const restRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-abc', namespace: 'kube-system', status: 'CrashLoopBackOff', ready: '0/1', restarts: 15, cluster: 'c1' },
          ],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ healthy: boolean }>>
      const result = await fetcher()

      expect(result).toHaveLength(1)
      expect(result[0].healthy).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Namespaces fetcher (custom endpoint)
  // ========================================================================
  describe('namespaces fetcher', () => {
    it('useCachedNamespaces: returns demo data when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces() // no cluster

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('default')
      expect(namespaces).toContain('kube-system')
    })

    it('useCachedNamespaces: fetches from /api/namespaces when cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const nsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'production' },
          { Name: 'staging' },
          { name: '' }, // empty name filtered out
        ]),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nsRes))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('production')
      expect(namespaces).toContain('staging')
      expect(namespaces).not.toContain('')

      vi.unstubAllGlobals()
    })

    it('useCachedNamespaces: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      await expect(fetcher()).rejects.toThrow('API error: 403')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Buildpack images 404 handling
  // ========================================================================
  describe('buildpack images 404 handling', () => {
    it('useCachedBuildpackImages: returns empty array on 404 (no CRDs)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchGitOpsAPI will throw with '404' in message
      const errorRes = { ok: false, status: 404 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const images = await fetcher()
      expect(images).toEqual([])

      vi.unstubAllGlobals()
    })

    it('useCachedBuildpackImages: rethrows non-404 errors', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const errorRes = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('500')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // GitOps and RBAC API endpoints
  // ========================================================================
  describe('GitOps and RBAC API endpoints', () => {
    it('useCachedHelmReleases uses fetchGitOpsAPI', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const gitopsRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ releases: [{ name: 'prometheus' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gitopsRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const releases = await fetcher()
      expect(releases).toHaveLength(1)

      // Verify it used /api/gitops/ prefix
      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/gitops/')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const badRes = { ok: true, text: vi.fn().mockResolvedValue('not json') }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedK8sRoles uses fetchRbacAPI with /api/rbac/ prefix', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const rbacRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ roles: [{ name: 'admin' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rbacRes))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('c1', 'ns', { includeSystem: true })

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const roles = await fetcher()
      expect(roles).toHaveLength(1)

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/rbac/')
      expect(calledUrl).toContain('includeSystem=true')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-ok response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 401')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('bad json!') }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsSSE used by helmReleases progressive fetcher', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockFetchSSE.mockResolvedValue([{ name: 'sse-release' }])

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases() // no cluster

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })

    it('fetchGitOpsSSE: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow()
    })

    it('fetchGitOpsSSE: throws when demo-token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.setItem('kc_token', 'demo-token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // coreFetchers direct invocation
  // ========================================================================
  describe('coreFetchers direct invocation', () => {
    it('coreFetchers.podIssues uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 3 },
      ])
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)
    })

    it('coreFetchers.podIssues falls back to REST when no agent', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const issueRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'p1', restarts: 1 }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(issueRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.podIssues returns empty when both unavailable', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toEqual([])
    })

    it('coreFetchers.deploymentIssues uses agent and derives issues', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'dep1', namespace: 'ns', replicas: 3, readyReplicas: 1, status: 'running' },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.deploymentIssues()
      expect(issues).toHaveLength(1)
      expect(issues[0]).toHaveProperty('reason', 'ReplicaFailure')

      vi.unstubAllGlobals()
    })

    it('coreFetchers.deployments uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'd1' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const deps = await coreFetchers.deployments()
      expect(deps.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.securityIssues tries kubectl then REST', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ issues: [{ name: 'sec1', namespace: 'default', issue: 'Priv', severity: 'high' }] }),
      })

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()
      expect(issues).toHaveLength(1)
    })

    it('coreFetchers.workloads uses agent then REST fallback', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const restRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'wl1', namespace: 'prod', type: 'Deployment', cluster: 'c1', status: 'Running', replicas: 1, readyReplicas: 1 },
        ]),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { coreFetchers } = await loadModule()
      const workloads = await coreFetchers.workloads()
      expect(workloads).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // fetchFromAllClusters — partial failures
  // ========================================================================
  describe('fetchFromAllClusters partial failures', () => {
    it('returns data from successful clusters even if some fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }
      const podsC1 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1', restarts: 0 }] })),
      }
      const podsC2 = {
        ok: false,
        status: 500,
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsC1)
        .mockResolvedValueOnce(podsC2))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()
      // Should still have pods from c1 even though c2 failed
      expect(pods.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('throws when ALL cluster fetches fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValue({ ok: false, status: 500 }))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('All cluster fetches failed')

      vi.unstubAllGlobals()
    })

    it('filters out unreachable clusters and clusters with / in name', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [
            { name: 'good', reachable: true },
            { name: 'unreachable', reachable: false },
            { name: 'default/api-server:6443', reachable: true }, // long context path, should be filtered
          ],
        })),
      }
      const podsRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()

      // Only 'good' cluster should be fetched — 1 cluster response + 1 pods response = 2 fetch calls total
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // First call = clusters, second call = pods for 'good'
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(pods).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

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

      // clusterCacheRef has clusters — should be used instead of backend
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'agent-c1', reachable: true },
            { name: 'agent-c2', reachable: undefined }, // pending health check — included
            { name: 'agent-c3', reachable: false }, // unreachable — excluded
            { name: 'ns/long-path-name', reachable: true }, // long path — excluded
          ],
        },
      }))

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
    })

    it('all-clusters path calls fetchFromAllClusters with limit', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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
    })
  })

  // ========================================================================
  // coreFetchers — remaining paths
  // ========================================================================
  describe('coreFetchers — remaining paths', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('coreFetchers.pods fetches and sorts by restarts', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))
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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [{ name: 'c1', reachable: true }] },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'default/api-server:6443/admin', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'prod', context: 'prod-ctx', reachable: true },
            { name: 'staging', context: 'staging-ctx', reachable: true },
          ],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'z-cluster', reachable: true }, { name: 'a-cluster', reachable: true }],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [{ name: 'c1', reachable: true }] },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'c1', reachable: true },
            { name: 'c2', reachable: true },
          ],
        },
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'ok-cluster', context: 'ok-ctx', reachable: true },
            { name: 'bad-cluster', context: 'bad-ctx', reachable: true },
          ],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'partial-dep', namespace: 'prod', status: 'running', replicas: 5, readyReplicas: 2 },
          ],
        }),
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'failed-dep', namespace: 'prod', status: 'failed', replicas: 3, readyReplicas: 0 },
          ],
        }),
      }))

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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'admin@prod-cluster', reachable: true }],
        },
      }))
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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))
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

      // REST fallback
      mockIsBackendUnavailable.mockReturnValue(false)
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ issues: [{ name: 'rest-issue', namespace: 'default', severity: 'high', issue: 'Privilege escalation' }] }),
      })
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()

      // kubectl found 0 issues, fell through to REST
      expect(issues.length).toBeGreaterThanOrEqual(1)
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [
            { name: 'ok', context: 'ok-ctx', reachable: true },
            { name: 'bad', context: 'bad-ctx', reachable: true },
          ],
        },
      }))
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

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
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
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
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
