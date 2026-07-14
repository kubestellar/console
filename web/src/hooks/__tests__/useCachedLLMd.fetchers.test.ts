/**
 * Deep branch-coverage tests for useCachedLLMd.ts
 *
 * Tests all internal utility functions (detectServerType, detectComponentType,
 * detectGatewayType, getLLMdServerStatus, extractGPUInfo, computeLLMdStatus),
 * the exported fetchers (fetchLLMdServers, fetchLLMdModels), and both hooks
 * (useCachedLLMdServers, useCachedLLMdModels).
 *
 * Dependencies are mocked at module boundaries; hook logic is exercised for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

const { mockClusterCacheRef } = vi.hoisted(() => ({
  mockClusterCacheRef: {
    clusters: [] as Array<{ name: string; server?: string }>,
  },
}))

const mockUseCache = vi.fn()
const mockCreateCachedHook = vi.fn((config: Record<string, unknown>) => () => mockUseCache(config))
const mockKubectlProxy = { exec: vi.fn() }
const mockSettledWithConcurrency = vi.fn()

vi.mock('../../lib/cache', () => ({
  createCachedHook: (...args: unknown[]) => mockCreateCachedHook(...args),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  CONSECUTIVE_FAILURE_THRESHOLD: 3,
  REFRESH_RATES: {
    realtime: 15_000, pods: 30_000, clusters: 60_000,
    deployments: 60_000, services: 60_000, metrics: 45_000,
    gpu: 45_000, helm: 120_000, gitops: 120_000,
    namespaces: 180_000, rbac: 300_000, operators: 300_000,
    costs: 600_000, default: 120_000,
  },
}))

vi.mock('../../lib/kubectlProxy', () => ({
    createCachedHook: vi.fn(),
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, KUBECTL_EXTENDED_TIMEOUT_MS: 60_000 }
})

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

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../mcp/clusterCacheRef', () => ({
  clusterCacheRef: mockClusterCacheRef,
  setClusterCacheRefClusters: vi.fn((clusters: Array<{ name: string; server?: string }>) => {
    mockClusterCacheRef.clusters = clusters
  }),
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

/** Simulate kubectlProxy.exec returning JSON data */
function mockExecJson(items: unknown[], exitCode = 0) {
  return {
    exitCode,
    output: JSON.stringify({ items }),
  }
}

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

let mod: typeof import('../useCachedLLMd')

async function loadModule() {
  const shared = await import('../mcp/shared') as {
    clusterCacheRef: { clusters: Array<{ name: string; server?: string }> }
  }
  shared.clusterCacheRef.clusters = mockClusterCacheRef.clusters

  const clusterCacheRefModule = await import('../mcp/clusterCacheRef') as {
    setClusterCacheRefClusters: (clusters: Array<{ name: string; server?: string }>) => void
  }
  clusterCacheRefModule.setClusterCacheRefClusters(mockClusterCacheRef.clusters)

  mod = await import('../useCachedLLMd')
  return mod
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCachedLLMd', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockClusterCacheRef.clusters = [
      { name: 'vllm-d', server: 'https://vllm-d.example.com' },
      { name: 'platform-eval', server: 'https://platform-eval.example.com' },
      { name: 'cluster-1', server: 'https://cluster-1.example.com' },
      { name: 'cluster-2', server: 'https://cluster-2.example.com' },
      { name: 'cluster-a', server: 'https://cluster-a.example.com' },
      { name: 'cluster-b', server: 'https://cluster-b.example.com' },
      { name: 'my-cluster', server: 'https://my-cluster.example.com' },
      { name: 'bad-cluster', server: 'https://bad-cluster.example.com' },
      { name: 'c1', server: 'https://c1.example.com' },
      { name: 'c2', server: 'https://c2.example.com' },
    ]

    // Default useCache: return whatever initialData is provided
    mockUseCache.mockImplementation((opts: { initialData: unknown }) =>
      makeCacheResult(opts.initialData),
    )

    // Default settledWithConcurrency: run tasks and return settled results
    mockSettledWithConcurrency.mockImplementation(
      async (tasks: Array<() => Promise<unknown>>) =>
        Promise.allSettled(tasks.map(t => t())),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // fetchLLMdModels (exported async function)
  // ========================================================================

  describe('fetchLLMdModels', () => {
    it('fetches InferencePool resources and maps to LLMdModel', async () => {
      const poolItems = [
        {
          metadata: { name: 'pool-1', namespace: 'llm-d' },
          spec: { selector: { matchLabels: { 'llmd.org/model': 'llama-3-70b' } } },
          status: {
            parents: [
              { conditions: [{ type: 'Accepted', status: 'True' }] },
            ],
          },
        },
      ]

      mockKubectlProxy.exec.mockResolvedValue(mockExecJson(poolItems))

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models).toHaveLength(1)
      expect(models[0].name).toBe('llama-3-70b')
      expect(models[0].status).toBe('loaded')
      expect(models[0].cluster).toBe('c1')
      expect(models[0].namespace).toBe('llm-d')
    })

    it('uses pool name when no model label in selector', async () => {
      const poolItems = [
        {
          metadata: { name: 'my-pool', namespace: 'inference' },
          spec: { selector: { matchLabels: {} } },
          status: {},
        },
      ]

      mockKubectlProxy.exec.mockResolvedValue(mockExecJson(poolItems))

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models[0].name).toBe('my-pool')
    })

    it('sets status to "stopped" when no Accepted condition', async () => {
      const poolItems = [
        {
          metadata: { name: 'pool-1', namespace: 'llm-d' },
          spec: {},
          status: {
            parents: [
              { conditions: [{ type: 'Accepted', status: 'False' }] },
            ],
          },
        },
      ]

      mockKubectlProxy.exec.mockResolvedValue(mockExecJson(poolItems))

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models[0].status).toBe('stopped')
    })

    it('sets status to "stopped" when no parents at all', async () => {
      const poolItems = [
        {
          metadata: { name: 'pool-1', namespace: 'llm-d' },
          spec: {},
        },
      ]

      mockKubectlProxy.exec.mockResolvedValue(mockExecJson(poolItems))

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models[0].status).toBe('stopped')
    })

    it('calls onProgress with accumulated results', async () => {
      mockKubectlProxy.exec.mockResolvedValue(
        mockExecJson([
          {
            metadata: { name: 'pool-1', namespace: 'llm-d' },
            spec: {},
            status: {},
          },
        ]),
      )

      const onProgress = vi.fn()
      const { fetchLLMdModels } = await loadModule()
      await fetchLLMdModels(['c1', 'c2'], onProgress)

      expect(onProgress).toHaveBeenCalled()
    })

    it('returns empty on non-zero exit code', async () => {
      mockKubectlProxy.exec.mockResolvedValue({ exitCode: 1, output: '' })

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models).toEqual([])
    })

    it('handles cluster errors gracefully', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('timeout'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1'])

      expect(models).toEqual([])
      consoleError.mockRestore()
    })

    it('suppresses demo mode errors without logging', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('demo mode active'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdModels } = await loadModule()
      await fetchLLMdModels(['c1'])

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('returns models from multiple clusters', async () => {
      let callCount = 0
      mockKubectlProxy.exec.mockImplementation(async () => {
        callCount++
        return mockExecJson([
          {
            metadata: { name: `pool-${callCount}`, namespace: 'llm-d' },
            spec: {},
            status: {},
          },
        ])
      })

      const { fetchLLMdModels } = await loadModule()
      const models = await fetchLLMdModels(['c1', 'c2'])

      expect(models.length).toBe(2)
    })
  })
})
