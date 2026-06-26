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
  describe('initialization and shape', () => {
    it('returns all expected fields', async () => {
      const { result, unmount } = renderHook(() => useLLMdServers([]))
      expect(result.current).toHaveProperty('servers')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refetch')
      expect(result.current).toHaveProperty('isFailed')
      expect(result.current).toHaveProperty('consecutiveFailures')
      expect(result.current).toHaveProperty('lastRefresh')
      expect(result.current).toHaveProperty('status')
      unmount()
    })

    it('starts with empty servers array', async () => {
      const { result, unmount } = renderHook(() => useLLMdServers([]))
      expect(result.current.servers).toEqual([])
      unmount()
    })
  })

  describe('demo mode', () => {
    it('skips fetching and sets isLoading=false', async () => {
      mockGetDemoMode.mockReturnValue(true)
      const { result, unmount } = renderHook(() => useLLMdServers(['cluster-1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(mockExec).not.toHaveBeenCalled()
      expect(result.current.servers).toEqual([])
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Server type detection (exercised via deployment names/labels)
  // -----------------------------------------------------------------------
  describe('server type detection', () => {
    it('detects vLLM servers from name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'my-vllm-server', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('vllm')
      unmount()
    })

    it('detects TGI servers from label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'inference-server',
              namespace: 'llm-d-ns',
              templateLabels: { 'app.kubernetes.io/name': 'tgi', 'llmd.org/inferenceServing': 'true' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('tgi')
      unmount()
    })

    it('detects TGI servers from name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'my-tgi-runner', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('tgi')
      unmount()
    })

    it('detects triton servers from label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'triton-server',
              namespace: 'llm-d-ns',
              templateLabels: { 'app.kubernetes.io/name': 'triton' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('triton')
      unmount()
    })

    it('detects llm-d servers from inferenceServing label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'my-inference-app',
              namespace: 'llm-d-ns',
              templateLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('llm-d')
      unmount()
    })

    it('detects llm-d servers from name containing llm-d', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'llm-d-backend', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('llm-d')
      unmount()
    })

    it('returns unknown for unrecognized server names', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'llama-serve',
              namespace: 'llm-d-ns',
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('unknown')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Component type detection
  // -----------------------------------------------------------------------
  describe('component type detection', () => {
    it('detects EPP component from name ending with epp', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'model-epp', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('epp')
      unmount()
    })

    it('detects gateway component from name in llm-d namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'my-gateway', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('gateway')
      unmount()
    })

    it('detects prometheus component from exact name in llm-d namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'prometheus', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('prometheus')
      unmount()
    })

    it('detects prometheus- prefixed component', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'prometheus-operator',
              namespace: 'llm-d-ns',
              // Must also match llmd filter — name contains 'inference' or matching label
              templateLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      // prometheus- prefix is checked in detectComponentType
      expect(result.current.servers[0].componentType).toBe('prometheus')
      unmount()
    })

    it('detects model component from llmd.org/model label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'granite-3b',
              namespace: 'llm-d-ns',
              templateLabels: { 'llmd.org/model': 'granite-3b' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('model')
      unmount()
    })

    it('detects model component from model name patterns (qwen, mistral, mixtral)', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'qwen-7b-chat', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'mistral-7b', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'mixtral-8x7b', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(3))
      for (const s of result.current.servers) {
        expect(s.componentType).toBe('model')
      }
      unmount()
    })

    it('classifies scheduling deployment as "other"', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'scheduling-controller',
              namespace: 'llm-d-ns',
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('other')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Server status detection
  // -----------------------------------------------------------------------
  describe('server status detection', () => {
    it('marks stopped when replicas=0', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 0, readyReplicas: 0 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].status).toBe('stopped')
      unmount()
    })

    it('marks running when readyReplicas=replicas', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 3, readyReplicas: 3 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].status).toBe('running')
      unmount()
    })

    it('marks scaling when readyReplicas < replicas but > 0', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 3, readyReplicas: 1 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].status).toBe('scaling')
      unmount()
    })

    it('marks error when replicas > 0 but readyReplicas = 0', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 2, readyReplicas: 0 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].status).toBe('error')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // GPU extraction
})
