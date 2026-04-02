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
  // -----------------------------------------------------------------------
  describe('GPU extraction', () => {
    it('extracts NVIDIA GPU count from resource limits', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              gpuLimits: { 'nvidia.com/gpu': '4' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].gpu).toBe('NVIDIA')
      expect(result.current.servers[0].gpuCount).toBe(4)
      unmount()
    })

    it('extracts AMD GPU count from resource limits', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              gpuLimits: { 'amd.com/gpu': '2' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].gpu).toBe('AMD')
      expect(result.current.servers[0].gpuCount).toBe(2)
      unmount()
    })

    it('extracts generic GPU from non-vendor-specific key', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              gpuLimits: { 'gpu': '1' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].gpu).toBe('GPU')
      expect(result.current.servers[0].gpuCount).toBe(1)
      unmount()
    })

    it('returns no GPU info when no GPU limits present', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              gpuLimits: { 'cpu': '4', 'memory': '8Gi' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].gpu).toBeUndefined()
      expect(result.current.servers[0].gpuCount).toBeUndefined()
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Autoscaler map (HPA + VA)
  // -----------------------------------------------------------------------
  describe('autoscaler detection', () => {
    it('detects HPA autoscaler on a deployment', async () => {
      const depName = 'vllm-server'
      const ns = 'llm-d-ns'

      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: depName, namespace: ns })],
        },
        hpa: {
          items: [makeHPA({ name: `${depName}-hpa`, namespace: ns, targetName: depName })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(true)
      expect(result.current.servers[0].autoscalerType).toBe('hpa')
      unmount()
    })

    it('detects VA autoscaler on a deployment', async () => {
      const depName = 'vllm-server'
      const ns = 'llm-d-ns'

      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: depName, namespace: ns })],
        },
        va: {
          items: [makeVA({ name: `${depName}-va`, namespace: ns, targetName: depName })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(true)
      expect(result.current.servers[0].autoscalerType).toBe('va')
      unmount()
    })

    it('detects "both" when HPA and VA target the same deployment', async () => {
      const depName = 'vllm-server'
      const ns = 'llm-d-ns'

      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: depName, namespace: ns })],
        },
        hpa: {
          items: [makeHPA({ name: `${depName}-hpa`, namespace: ns, targetName: depName })],
        },
        va: {
          items: [makeVA({ name: `${depName}-va`, namespace: ns, targetName: depName })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(true)
      expect(result.current.servers[0].autoscalerType).toBe('both')
      unmount()
    })

    it('reports hasAutoscaler=false when no autoscaler targets the deployment', async () => {
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
        hpa: { items: [] },
        va: { items: [] },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(false)
      expect(result.current.servers[0].autoscalerType).toBeUndefined()
      unmount()
    })

    it('ignores HPA targeting a non-Deployment kind', async () => {
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
        hpa: {
          items: [makeHPA({ name: 'some-hpa', namespace: 'llm-d-ns', targetName: 'vllm-server', targetKind: 'StatefulSet' })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(false)
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Gateway / Prometheus namespace status
  // -----------------------------------------------------------------------
  describe('gateway and prometheus namespace status', () => {
    it('attaches istio gateway status and type to servers in same namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1 }),
            makeDeployment({ name: 'istio-gateway', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.gatewayStatus).toBe('running')
      expect(vllmServer?.gatewayType).toBe('istio')
      unmount()
    })

    it('detects kgateway type from name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'kgateway-proxy', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.gatewayType).toBe('kgateway')
      unmount()
    })

    it('defaults gateway type to envoy for generic gateway name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'my-gateway', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.gatewayType).toBe('envoy')
      unmount()
    })

    it('attaches running prometheus status to servers in same namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1 }),
            makeDeployment({ name: 'prometheus', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.prometheusStatus).toBe('running')
      unmount()
    })

    it('reports stopped prometheus when replicas=0', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'prometheus', namespace: 'llm-d-ns', replicas: 0, readyReplicas: 0 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.prometheusStatus).toBe('stopped')
      unmount()
    })

    it('attaches ingress as gateway for namespace status', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' }),
            makeDeployment({ name: 'ingress-controller', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1 }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const vllmServer = result.current.servers.find(s => s.name === 'vllm-server')
      expect(vllmServer?.gatewayStatus).toBe('running')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Model name extraction
  // -----------------------------------------------------------------------
  describe('model name extraction', () => {
    it('extracts model from llmd.org/model label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              templateLabels: { 'llmd.org/model': 'granite-3b-instruct' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].model).toBe('granite-3b-instruct')
      unmount()
    })

    it('falls back to app.kubernetes.io/model label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-server',
              namespace: 'llm-d-ns',
              templateLabels: { 'app.kubernetes.io/model': 'llama-2-7b' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].model).toBe('llama-2-7b')
      unmount()
    })

    it('falls back to deployment name if no model label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].model).toBe('vllm-server')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Status computed field
  // -----------------------------------------------------------------------
  describe('status computation', () => {
    it('computes totalServers, runningServers, stoppedServers, totalModels, loadedModels', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'vllm-model-a',
              namespace: 'llm-d-ns',
              replicas: 2,
              readyReplicas: 2,
              templateLabels: { 'llmd.org/model': 'model-a' },
            }),
            makeDeployment({
              name: 'vllm-model-b',
              namespace: 'llm-d-ns',
              replicas: 0,
              readyReplicas: 0,
              templateLabels: { 'llmd.org/model': 'model-b' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const { status } = result.current
      expect(status.totalServers).toBe(2)
      expect(status.runningServers).toBe(1)
      expect(status.stoppedServers).toBe(1)
      expect(status.totalModels).toBe(2)
      expect(status.loadedModels).toBe(1)
      expect(status.healthy).toBe(true)
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('handles kubectl exec throwing an error for a cluster', async () => {
      mockExec.mockRejectedValue(new Error('Connection refused'))

      const { result, unmount } = renderHook(() => useLLMdServers(['bad-cluster']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.servers).toEqual([])
      unmount()
    })

    it('handles bad JSON output from deployments', async () => {
      mockExec.mockResolvedValue({ output: '{{not valid json', exitCode: 0, error: '' })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.servers).toEqual([])
      unmount()
    })

    it('handles kubectl exit code > 0 for deployments', async () => {
      mockExec.mockResolvedValue(kubectlFail('error: the server does not have resource type'))

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.servers).toEqual([])
      unmount()
    })

    it('handles HPA fetch error gracefully (still returns servers)', async () => {
      mockExec.mockImplementation((args: string[]) => {
        const cmd = args.join(' ')
        if (cmd.includes('deployments')) {
          return Promise.resolve(kubectlOk({
            items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
          }))
        }
        if (cmd.includes('hpa')) {
          return Promise.reject(new Error('HPA CRD not installed'))
        }
        return Promise.resolve(kubectlOk({ items: [] }))
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(false)
      unmount()
    })

    it('handles VA fetch error gracefully (still returns servers)', async () => {
      mockExec.mockImplementation((args: string[]) => {
        const cmd = args.join(' ')
        if (cmd.includes('deployments')) {
          return Promise.resolve(kubectlOk({
            items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
          }))
        }
        if (cmd.includes('variantautoscalings')) {
          return Promise.reject(new Error('VA CRD not installed'))
        }
        return Promise.resolve(kubectlOk({ items: [] }))
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(false)
      unmount()
    })

    it('suppresses demo mode errors silently', async () => {
      mockExec.mockRejectedValue(new Error('demo mode active'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // "demo mode" errors should be suppressed
      const nonDemoModeCalls = consoleError.mock.calls.filter(
        (call) => {
          const msg = String(call[0] || '') + String(call[1] || '')
          return !msg.includes('demo mode')
        }
      )
      expect(nonDemoModeCalls).toEqual([])
      consoleError.mockRestore()
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Multi-cluster and progressive loading
  // -----------------------------------------------------------------------
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

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

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

// ---------------------------------------------------------------------------
// useLLMdModels
// ---------------------------------------------------------------------------

describe('useLLMdModels', () => {
  describe('initialization and shape', () => {
    it('returns all expected fields', async () => {
      const { result, unmount } = renderHook(() => useLLMdModels([]))
      expect(result.current).toHaveProperty('models')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refetch')
      expect(result.current).toHaveProperty('isFailed')
      expect(result.current).toHaveProperty('consecutiveFailures')
      expect(result.current).toHaveProperty('lastRefresh')
      unmount()
    })

    it('starts with empty models array', async () => {
      const { result, unmount } = renderHook(() => useLLMdModels([]))
      expect(result.current.models).toEqual([])
      unmount()
    })
  })

  describe('demo mode', () => {
    it('skips fetching in demo mode', async () => {
      mockGetDemoMode.mockReturnValue(true)
      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(mockExec).not.toHaveBeenCalled()
      expect(result.current.models).toEqual([])
      unmount()
    })
  })

  describe('fetching InferencePools', () => {
    it('fetches and parses InferencePools with model name from label', async () => {
      setupKubectl({
        pools: {
          items: [
            makeInferencePool({
              name: 'granite-pool',
              namespace: 'llm-d-ns',
              modelLabel: 'granite-3b-instruct',
              accepted: true,
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.models.length).toBe(1))
      const m = result.current.models[0]
      expect(m.name).toBe('granite-3b-instruct')
      expect(m.namespace).toBe('llm-d-ns')
      expect(m.cluster).toBe('c1')
      expect(m.status).toBe('loaded')
      expect(m.instances).toBe(1)
      expect(m.id).toBe('c1-llm-d-ns-granite-pool')
      unmount()
    })

    it('falls back to pool name when no model label', async () => {
      setupKubectl({
        pools: {
          items: [
            makeInferencePool({
              name: 'my-custom-pool',
              namespace: 'llm-d-ns',
              accepted: true,
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.models.length).toBe(1))
      expect(result.current.models[0].name).toBe('my-custom-pool')
      unmount()
    })

    it('marks model as stopped when not Accepted', async () => {
      setupKubectl({
        pools: {
          items: [
            makeInferencePool({
              name: 'failing-pool',
              namespace: 'llm-d-ns',
              accepted: false,
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.models.length).toBe(1))
      expect(result.current.models[0].status).toBe('stopped')
      unmount()
    })

    it('marks model as stopped when no status present', async () => {
      setupKubectl({
        pools: {
          items: [
            makeInferencePool({
              name: 'no-status-pool',
              namespace: 'llm-d-ns',
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.models.length).toBe(1))
      expect(result.current.models[0].status).toBe('stopped')
      unmount()
    })

    it('aggregates models from multiple clusters', async () => {
      mockExec.mockImplementation((_args: string[], opts: { context: string }) => {
        return Promise.resolve(kubectlOk({
          items: [
            makeInferencePool({
              name: `pool-${opts.context}`,
              namespace: 'llm-d-ns',
              modelLabel: `model-${opts.context}`,
              accepted: true,
            }),
          ],
        }))
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['cluster-a', 'cluster-b']))

      await waitFor(() => expect(result.current.models.length).toBe(2))
      const clusters = result.current.models.map(m => m.cluster)
      expect(clusters).toContain('cluster-a')
      expect(clusters).toContain('cluster-b')
      unmount()
    })
  })

  describe('error handling', () => {
    it('handles kubectl error for InferencePools gracefully', async () => {
      mockExec.mockRejectedValue(new Error('Connection refused'))

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.models).toEqual([])
      unmount()
    })

    it('skips cluster when exitCode is non-zero', async () => {
      mockExec.mockResolvedValue(kubectlFail('InferencePool CRD not installed'))

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.models).toEqual([])
      unmount()
    })

    it('handles bad JSON from InferencePools', async () => {
      mockExec.mockResolvedValue({ output: 'not-json!', exitCode: 0, error: '' })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.models).toEqual([])
      unmount()
    })

    it('suppresses demo mode errors for InferencePools', async () => {
      mockExec.mockRejectedValue(new Error('demo mode active'))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      const nonDemoModeCalls = consoleError.mock.calls.filter(
        (call) => {
          const msg = String(call[0] || '') + String(call[1] || '')
          return !msg.includes('demo mode')
        }
      )
      expect(nonDemoModeCalls).toEqual([])
      consoleError.mockRestore()
      unmount()
    })
  })

  describe('refetch and auto-refresh', () => {
    it('provides a manual refetch function', async () => {
      const { result, unmount } = renderHook(() => useLLMdModels([]))
      expect(typeof result.current.refetch).toBe('function')
      unmount()
    })

    it('sets lastRefresh after successful fetch', async () => {
      mockExec.mockResolvedValue(kubectlOk({ items: [] }))

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.lastRefresh).not.toBeNull())
      unmount()
    })

    it('auto-refreshes via setInterval', async () => {
      vi.useFakeTimers()
      mockExec.mockImplementation(() => {
        return Promise.resolve(kubectlOk({
          items: [makeInferencePool({ name: 'pool-1', namespace: 'llm-d-ns', accepted: true })],
        }))
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      // Let initial fetch complete
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })

      const initialCallCount = mockExec.mock.calls.length

      // Advance past refresh interval (120000ms)
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      expect(mockExec.mock.calls.length).toBeGreaterThan(initialCallCount)
      unmount()
      vi.useRealTimers()
    })
  })

  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLLMdModels([]))
      expect(() => unmount()).not.toThrow()
    })

    it('clears interval on unmount', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      const { unmount } = renderHook(() => useLLMdModels(['c1']))
      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })
})
