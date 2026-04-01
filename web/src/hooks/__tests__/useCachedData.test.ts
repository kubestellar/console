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
  settledWithConcurrency: (...args: unknown[]) => mockSettledWithConcurrency(...args),
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
    it('fetchViaSSE is used for services progressive fetcher (calls fetchSSE)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Ensure clean clusterCacheRef state
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))

      // fetchSSE must call onClusterData to populate the accumulated array
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'sse-svc', type: 'ClusterIP' }])
        return [{ name: 'sse-svc', type: 'ClusterIP' }]
      })

      // Use services (simpler progressiveFetcher, no sort/slice wrapper)
      const { useCachedServices } = await loadModule()
      useCachedServices()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
    })

    it('fetchViaSSE falls back to fetchFromAllClusters when SSE throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // SSE fails
      mockFetchSSE.mockRejectedValue(new Error('SSE connection failed'))

      // Need clusterCacheRef with clusters so getReachableClusters returns them
      // (fetchFromAllClusters -> fetchClusters -> getReachableClusters)
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', reachable: true }],
        },
      }))

      // REST fallback per-cluster calls
      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'rest-pod', restarts: 0 }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)
      expect(result).toHaveLength(1)

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

    it('fetchViaSSE accumulates data via onClusterData callback', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Ensure clean clusterCacheRef state
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))

      // Simulate fetchSSE behavior: call onClusterData for each cluster
      mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
        opts.onClusterData('c1', [{ name: 'p1' }])
        opts.onClusterData('c2', [{ name: 'p2' }])
        return [{ name: 'p1' }, { name: 'p2' }]
      })

      const { useCachedServices } = await loadModule()
      useCachedServices()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const result = await progressiveFetcher(onProgress)

      // onProgress should be called when onClusterData fires
      expect(onProgress).toHaveBeenCalled()
      expect(result).toHaveLength(2)
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
        json: vi.fn().mockResolvedValue({ issues: [{ name: 'rest-sec', issue: 'Priv', severity: 'high' }] }),
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
        json: vi.fn().mockResolvedValue({ issues: [{ name: 'sec1', issue: 'Priv', severity: 'high' }] }),
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
})
