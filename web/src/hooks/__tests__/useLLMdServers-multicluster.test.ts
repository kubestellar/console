import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only dependencies, never the hook under test
// ---------------------------------------------------------------------------

const mockExec = vi.fn()
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
}))

const mockGetDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
  useDemoMode: () => ({ isDemoMode: mockGetDemoMode() }),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockGetDemoMode(),
  getDemoMode: () => mockGetDemoMode(),
  isNetlifyDeployment: false,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 5000 }
})

import { useLLMdServers, useLLMdModels } from '../useLLMd'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a kubectl JSON response wrapper */
function kubectlOk(output: unknown) {
  return { output: JSON.stringify(output), exitCode: 0, error: '' }
}

function kubectlFail(errorMsg = 'not found') {
  return { output: errorMsg, exitCode: 1, error: errorMsg }
}

/** Build a realistic Deployment resource */
function makeDeployment(opts: {
  name: string
  namespace: string
  replicas?: number
  readyReplicas?: number
  labels?: Record<string, string>
  templateLabels?: Record<string, string>
  gpuLimits?: Record<string, string>
}) {
  const replicas = opts.replicas ?? 1
  const readyReplicas = opts.readyReplicas ?? replicas
  return {
    metadata: {
      name: opts.name,
      namespace: opts.namespace,
      labels: opts.labels || {},
    },
    spec: {
      replicas,
      template: {
        metadata: { labels: opts.templateLabels || {} },
        spec: {
          containers: [
            {
              name: opts.name,
              image: 'vllm/vllm:latest',
              resources: {
                limits: opts.gpuLimits || {},
                requests: {},
              },
            },
          ],
        },
      },
    },
    status: {
      replicas,
      readyReplicas,
      availableReplicas: readyReplicas,
    },
  }
}

/** Build a realistic HPA resource */
function makeHPA(opts: { name: string; namespace: string; targetName: string; targetKind?: string }) {
  return {
    metadata: { name: opts.name, namespace: opts.namespace },
    spec: {
      scaleTargetRef: {
        kind: opts.targetKind || 'Deployment',
        name: opts.targetName,
      },
    },
  }
}

/** Build a realistic VariantAutoscaling resource */
function makeVA(opts: { name: string; namespace: string; targetName: string; targetKind?: string }) {
  return {
    metadata: { name: opts.name, namespace: opts.namespace },
    spec: {
      targetRef: {
        kind: opts.targetKind || 'Deployment',
        name: opts.targetName,
      },
    },
  }
}

/** Build a realistic InferencePool resource */
function makeInferencePool(opts: {
  name: string
  namespace: string
  modelLabel?: string
  accepted?: boolean
}) {
  return {
    metadata: { name: opts.name, namespace: opts.namespace },
    spec: {
      selector: opts.modelLabel
        ? { matchLabels: { 'llmd.org/model': opts.modelLabel } }
        : {},
    },
    status: opts.accepted !== undefined
      ? {
          parents: [
            {
              conditions: [
                { type: 'Accepted', status: opts.accepted ? 'True' : 'False' },
              ],
            },
          ],
        }
      : undefined,
  }
}

/**
 * Configure mockExec to respond differently based on the kubectl command.
 */
function setupKubectl(responses: {
  deployments?: unknown
  hpa?: unknown
  va?: unknown
  pools?: unknown
}) {
  mockExec.mockImplementation((args: string[]) => {
    const cmd = args.join(' ')
    if (cmd.includes('deployments')) {
      return Promise.resolve(kubectlOk(responses.deployments || { items: [] }))
    }
    if (cmd.includes('hpa')) {
      return Promise.resolve(kubectlOk(responses.hpa || { items: [] }))
    }
    if (cmd.includes('variantautoscalings')) {
      return Promise.resolve(kubectlOk(responses.va || { items: [] }))
    }
    if (cmd.includes('inferencepools')) {
      return Promise.resolve(kubectlOk(responses.pools || { items: [] }))
    }
    return Promise.resolve(kubectlOk({ items: [] }))
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDemoMode.mockReturnValue(false)
  mockExec.mockResolvedValue(kubectlOk({ items: [] }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// useLLMdServers
// ---------------------------------------------------------------------------


describe('useLLMdServers', () => {
  describe('multi-cluster and progressive loading', () => {
    it('aggregates servers from multiple clusters', async () => {
      mockExec.mockImplementation((args: string[], opts: { context: string }) => {
        const cmd = args.join(' ')
        if (cmd.includes('deployments')) {
          return Promise.resolve(kubectlOk({
            items: [
              makeDeployment({
                name: `vllm-server-${opts.context}`,
                namespace: 'llm-d-ns',
              }),
            ],
          }))
        }
        return Promise.resolve(kubectlOk({ items: [] }))
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['cluster-a', 'cluster-b']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const clusters = result.current.servers.map(s => s.cluster)
      expect(clusters).toContain('cluster-a')
      expect(clusters).toContain('cluster-b')
      unmount()
    })

    it('skips cluster if deployments response is empty', async () => {
      setupKubectl({ deployments: { items: [] } })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.servers).toEqual([])
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Namespace-based deployment filtering
  // -----------------------------------------------------------------------
  describe('deployment filtering by namespace and name', () => {
    it('includes deployments with inference keyword in name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'inference-service', namespace: 'serving-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes deployments with app.kubernetes.io/name=vllm label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'custom-serving',
              namespace: 'e2e-test',
              templateLabels: { 'app.kubernetes.io/name': 'vllm' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].name).toBe('custom-serving')
      unmount()
    })

    it('includes deployments with llm-d.ai/role label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'custom-worker',
              namespace: 'any-ns',
              templateLabels: { 'llm-d.ai/role': 'inference' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes deployments with app=llm-inference label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'worker',
              namespace: 'any-ns',
              templateLabels: { 'app': 'llm-inference' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes modelservice deployments', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'modelservice-llama', namespace: 'any-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes inference-pool deployments', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'inference-pool-controller', namespace: 'any-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes app.kubernetes.io/part-of=inference label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'custom-thing',
              namespace: 'any-ns',
              templateLabels: { 'app.kubernetes.io/part-of': 'inference' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('includes ingress deployments in llm-d namespaces', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'ingress-controller', namespace: 'vllm-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('excludes deployments that do not match any llm-d pattern', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'nginx-web', namespace: 'default' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.servers).toEqual([])
      unmount()
    })

    it('includes deployments in llm-d namespace variants (e2e, aibrix, hc4ai, etc)', async () => {
      const namespaces = ['e2e-ns', 'aibrix-system', 'hc4ai-inference', 'gaie-prod', 'sched-ns']
      setupKubectl({
        deployments: {
          items: namespaces.map((ns, i) =>
            makeDeployment({ name: `vllm-server-${i}`, namespace: ns })
          ),
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(namespaces.length))
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Server ID and fields
  // -----------------------------------------------------------------------
  describe('server fields', () => {
    it('creates correct id, name, namespace, cluster fields', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-granite', namespace: 'llm-d-prod' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['my-cluster']))

      await waitFor(() => expect(result.current.servers.length).toBe(1))
      const s = result.current.servers[0]
      expect(s.id).toBe('my-cluster-llm-d-prod-vllm-granite')
      expect(s.name).toBe('vllm-granite')
      expect(s.namespace).toBe('llm-d-prod')
      expect(s.cluster).toBe('my-cluster')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Refetch, lastRefresh, isFailed
  // -----------------------------------------------------------------------
  describe('refetch and auto-refresh', () => {
    it('provides a manual refetch function', async () => {
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(typeof result.current.refetch).toBe('function')
      unmount()
    })

    it('sets lastRefresh after successful fetch', async () => {
      setupKubectl({ deployments: { items: [] } })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.lastRefresh).not.toBeNull())
      unmount()
    })

    it('auto-refreshes via setInterval', async () => {
      vi.useFakeTimers()
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
      })

      const {unmount } = renderHook(() => useLLMdServers(['c1']))

      // Let initial fetch complete
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })

      const initialCallCount = mockExec.mock.calls.length

      // Advance past refresh interval (120000ms)
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      expect(mockExec.mock.calls.length).toBeGreaterThan(initialCallCount)
      unmount()
      vi.useRealTimers()
    })

    it('calling refetch manually triggers a new fetch', async () => {
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      const callsBefore = mockExec.mock.calls.length

      await act(async () => {
        result.current.refetch()
      })

      await waitFor(() => expect(mockExec.mock.calls.length).toBeGreaterThan(callsBefore))
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLLMdServers([]))
      expect(() => unmount()).not.toThrow()
    })

    it('clears interval on unmount', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      const { unmount } = renderHook(() => useLLMdServers(['c1']))
      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })
})
