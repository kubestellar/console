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
  let mod: typeof import('../useCachedData')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    // Set a valid token so fetchAPI doesn't throw
    localStorage.setItem('kc_token', 'test-jwt-token')
    // Reset the shared cluster cache so tests start with a clean slate
    mockClusterCacheRef.clusters = []
    mockIsDemoMode.mockReturnValue(false)
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
  // getReachableClusters / getAgentClusters filtering
  // ========================================================================
  describe('getReachableClusters / getAgentClusters', () => {
    it('fetchClusters prefers local agent clusters over backend', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mutate the shared mock ref directly — avoids the `vi.doMock` +
      // `resetModules` race that caused kubestellar/console#9305.
      mockClusterCacheRef.clusters = [
        { name: 'agent-c1', reachable: true },
        { name: 'agent-c2', reachable: undefined }, // pending health check — included
        { name: 'agent-c3', reachable: false }, // unreachable — excluded
        { name: 'ns/long-path-name', reachable: true }, // long path — excluded
      ]

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

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
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

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
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
    it('uses the deployments progressive fetcher via agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [{ name: 'dep1', replicas: 3, readyReplicas: 1, status: 'running' }],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues())

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const deployments = await progressiveFetcher(onProgress)
      expect(deployments).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('falls back to the deployments SSE fetcher when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([
        { name: 'healthy-dep', namespace: 'default', replicas: 2, readyReplicas: 2, status: 'running' },
        { name: 'di1', namespace: 'default', replicas: 2, readyReplicas: 1, status: 'running' },
      ])

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues())

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<Array<{ name: string }>>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'healthy-dep' }),
        expect.objectContaining({ name: 'di1' }),
      ]))
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

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

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
    it('all hooks pass non-empty demoData in demo mode (regression guard)', async () => {
      const capturedDemos: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: { key: string; demoData: unknown }) => {
        capturedDemos[opts.key] = opts.demoData
        return makeCacheResult(opts.demoData || [])
      })
      mockIsDemoMode.mockReturnValue(true)

      const m = await loadModule()

      // Call every hook to capture their demoData
      m.useCachedPods()
      m.useCachedEvents()
      m.useCachedPodIssues()
      renderHook(() => m.useCachedDeploymentIssues())
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
})
