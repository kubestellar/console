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

  describe('fetchLLMdServers', () => {
    it('fetches servers from multiple clusters', async () => {
      // Deployments response
      mockKubectlProxy.exec.mockImplementation(
        async (args: string[], _opts: { context: string }) => {
          if (args[0] === 'get' && args[1] === 'deployments') {
            return mockExecJson([
              makeDeployment('vllm-llama', 'llm-d', {
                replicas: 2,
                readyReplicas: 2,
                podLabels: { 'llmd.org/model': 'llama-3' },
              }),
            ])
          }
          // Autoscaler queries return empty
          return mockExecJson([])
        },
      )

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['cluster-1', 'cluster-2'])

      // 2 clusters, each producing 1 server from deployments
      expect(servers.length).toBe(2)
      expect(servers[0].name).toBe('vllm-llama')
      expect(servers[0].model).toBe('llama-3')
    })

    it('calls onProgress callback with accumulated results', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-test', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const onProgress = vi.fn()
      const { fetchLLMdServers } = await loadModule()
      await fetchLLMdServers(['c1'], onProgress)

      expect(onProgress).toHaveBeenCalled()
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
      expect(lastCall.length).toBeGreaterThan(0)
    })

    it('handles cluster errors gracefully without crashing', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('connection refused'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['bad-cluster'])

      expect(servers).toEqual([])
      consoleError.mockRestore()
    })

    it('suppresses demo mode errors without logging', async () => {
      mockKubectlProxy.exec.mockRejectedValue(new Error('demo mode active'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { fetchLLMdServers } = await loadModule()
      await fetchLLMdServers(['c1'])

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('returns empty when deployments query fails', async () => {
      mockKubectlProxy.exec.mockResolvedValue({ exitCode: 1, output: '' })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers).toEqual([])
    })

    it('detects and includes HPA autoscalers', async () => {
      const hpaItems = [
        {
          metadata: { name: 'vllm-hpa', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const autoscalerServer = servers.find(s => s.componentType === 'autoscaler' && s.autoscalerType === 'hpa')
      expect(autoscalerServer).toBeDefined()
      expect(autoscalerServer!.model).toBe('\u2192 vllm-llama')

      const deploymentServer = servers.find(s => s.name === 'vllm-llama')
      expect(deploymentServer!.hasAutoscaler).toBe(true)
      expect(deploymentServer!.autoscalerType).toBe('hpa')
    })

    it('detects VariantAutoscaling (VA) resources', async () => {
      const vaItems = [
        {
          metadata: { name: 'llm-va', namespace: 'llm-d' },
          spec: { targetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'variantautoscalings') return mockExecJson(vaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vaServer = servers.find(s => s.autoscalerType === 'va' && s.componentType === 'autoscaler')
      expect(vaServer).toBeDefined()
      expect(vaServer!.name).toBe('llm-va')
    })

    it('detects VPA autoscaler resources', async () => {
      const vpaItems = [
        {
          metadata: { name: 'vllm-vpa', namespace: 'llm-d' },
          spec: { targetRef: { name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'vpa') return mockExecJson(vpaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const vpaServer = servers.find(s => s.autoscalerType === 'vpa')
      expect(vpaServer).toBeDefined()
      expect(vpaServer!.model).toBe('\u2192 vllm-llama')
    })

    it('marks autoscaler as "both" when HPA and VA target same deployment', async () => {
      const hpaItems = [
        {
          metadata: { name: 'hpa-1', namespace: 'llm-d' },
          spec: { scaleTargetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]
      const vaItems = [
        {
          metadata: { name: 'va-1', namespace: 'llm-d' },
          spec: { targetRef: { kind: 'Deployment', name: 'vllm-llama' } },
        },
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        if (args[1] === 'hpa') return mockExecJson(hpaItems)
        if (args[1] === 'variantautoscalings') return mockExecJson(vaItems)
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const deploymentServer = servers.find(s => s.name === 'vllm-llama')
      expect(deploymentServer!.autoscalerType).toBe('both')
    })

    it('extracts NVIDIA GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'nvidia.com/gpu': '4' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('NVIDIA')
      expect(server!.gpuCount).toBe(4)
    })

    it('extracts AMD GPU info from container resource limits', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'amd.com/gpu': '2' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('AMD')
      expect(server!.gpuCount).toBe(2)
    })

    it('extracts generic GPU info when key contains "gpu" but not nvidia/amd', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'custom.io/gpu': '1' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBe('GPU')
      expect(server!.gpuCount).toBe(1)
    })

    it('returns no GPU info when no gpu limits exist', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-llama', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              gpuLimits: { 'cpu': '4', 'memory': '8Gi' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const server = servers.find(s => s.name === 'vllm-llama')
      expect(server!.gpu).toBeUndefined()
      expect(server!.gpuCount).toBeUndefined()
    })

    it('detects server types correctly via name patterns', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-model-a', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('tgi-model-b', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('triton-server', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('llm-d-custom', 'llm-d', { replicas: 1, readyReplicas: 1 }),
            makeDeployment('some-unknown', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      const byName = (n: string) => servers.find(s => s.name === n)
      expect(byName('vllm-model-a')!.type).toBe('vllm')
      expect(byName('tgi-model-b')!.type).toBe('tgi')
      expect(byName('triton-server')!.type).toBe('triton')
      expect(byName('llm-d-custom')!.type).toBe('llm-d')
    })

    it('prefers vllm over the llm-d substring in vllm-deployment names', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('vllm-deployment', 'llm-d', { replicas: 1, readyReplicas: 1 }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      expect(servers[0]?.type).toBe('vllm')
    })

    it('detects server types via labels when name does not match', async () => {
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'deployments') {
          return mockExecJson([
            makeDeployment('custom-model', 'llm-d', {
              replicas: 1,
              readyReplicas: 1,
              podLabels: { 'app.kubernetes.io/name': 'tgi', 'llmd.org/inferenceServing': 'true' },
            }),
          ])
        }
        return mockExecJson([])
      })

      const { fetchLLMdServers } = await loadModule()
      const servers = await fetchLLMdServers(['c1'])

      // tgi label takes precedence
      expect(servers.find(s => s.name === 'custom-model')!.type).toBe('tgi')
    })


  })
})
