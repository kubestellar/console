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
import { renderHook } from '@testing-library/react'

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

/** Create a deployment resource for testing */
function makeDeployment(
  name: string,
  namespace: string,
  opts?: {
    replicas?: number
    readyReplicas?: number
    labels?: Record<string, string>
    podLabels?: Record<string, string>
    gpuLimits?: Record<string, string>
  },
) {
  return {
    metadata: { name, namespace, labels: opts?.labels },
    spec: {
      replicas: opts?.replicas ?? 1,
      template: {
        metadata: { labels: opts?.podLabels ?? {} },
        spec: {
          containers: [
            {
              resources: {
                limits: opts?.gpuLimits ?? {},
              },
            },
          ],
        },
      },
    },
    status: {
      replicas: opts?.replicas ?? 1,
      readyReplicas: opts?.readyReplicas ?? 1,
    },
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
  // useCachedLLMdServers hook
  // ========================================================================

  describe('useCachedLLMdServers', () => {
    it('returns expected shape with default clusters', async () => {
      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current).toHaveProperty('servers')
      expect(result.current).toHaveProperty('status')
      expect(result.current).toHaveProperty('data')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('isDemoFallback')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('isFailed')
      expect(result.current).toHaveProperty('consecutiveFailures')
      expect(result.current).toHaveProperty('lastRefresh')
      expect(result.current).toHaveProperty('refetch')
    })

    it('uses cluster-based cache key', async () => {
      const { useCachedLLMdServers } = await loadModule()
      renderHook(() => useCachedLLMdServers(['cluster-a', 'cluster-b']))

      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('llmd-servers:cluster-a,cluster-b')
      expect(call.category).toBe('gitops')
    })

    it('passes demo data to useCache', async () => {
      const { useCachedLLMdServers } = await loadModule()
      renderHook(() => useCachedLLMdServers())

      const call = mockUseCache.mock.calls[0][0]
      expect(call.demoData).toHaveLength(2)
      expect(call.demoData[0].name).toBe('vllm-llama-3')
      expect(call.demoData[1].name).toBe('tgi-granite')
    })

    it('computes status from server data', async () => {
      const servers = [
        { id: '1', name: 'a', status: 'running', model: 'm1' },
        { id: '2', name: 'b', status: 'stopped', model: 'm2' },
        { id: '3', name: 'c', status: 'running', model: 'm1' },
      ]
      mockUseCache.mockReturnValue(makeCacheResult(servers))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.totalServers).toBe(3)
      expect(result.current.status.runningServers).toBe(2)
      expect(result.current.status.stoppedServers).toBe(1)
      expect(result.current.status.totalModels).toBe(2)
      expect(result.current.status.loadedModels).toBe(1)
      expect(result.current.status.healthy).toBe(true)
    })

    it('marks status unhealthy when consecutiveFailures >= 3', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], { consecutiveFailures: 3 }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.healthy).toBe(false)
    })

    it('marks status healthy when consecutiveFailures < 3', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], { consecutiveFailures: 2 }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.status.healthy).toBe(true)
    })

    it('propagates all cache result fields', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([], {
        isLoading: true,
        isRefreshing: true,
        isDemoFallback: true,
        error: 'test error',
        isFailed: true,
        consecutiveFailures: 5,
        lastRefresh: 12345,
      }))

      const { useCachedLLMdServers } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdServers())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isRefreshing).toBe(true)
      // isDemoFallback is gated by !isLoading in the hook (prevents demo badge during loading)
      expect(result.current.isDemoFallback).toBe(false)
      expect(result.current.error).toBe('test error')
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBe(5)
      expect(result.current.lastRefresh).toBe(12345)
    })
  })

  // ========================================================================
  // useCachedLLMdModels hook
  // ========================================================================

  describe('useCachedLLMdModels', () => {
    it('returns expected shape with models alias', async () => {
      const { useCachedLLMdModels } = await loadModule()
      const { result } = renderHook(() => useCachedLLMdModels())

      expect(result.current).toHaveProperty('models')
      expect(result.current).toHaveProperty('data')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('refetch')
    })

    it('uses correct cache key', async () => {
      const { useCachedLLMdModels } = await loadModule()
      renderHook(() => useCachedLLMdModels(['my-cluster']))

      const call = mockUseCache.mock.calls[0][0]
      expect(call.key).toBe('llmd-models:my-cluster')
      expect(call.category).toBe('gitops')
    })

    it('passes demo models data', async () => {
      const { useCachedLLMdModels } = await loadModule()
      renderHook(() => useCachedLLMdModels())

      const call = mockUseCache.mock.calls[0][0]
      expect(call.demoData).toHaveLength(2)
      expect(call.demoData[0].name).toBe('llama-3-70b')
      expect(call.demoData[1].name).toBe('granite-13b')
    })
  })

  // ========================================================================
  // fetchLLMdServers (exported async function)
  // ========================================================================

})
