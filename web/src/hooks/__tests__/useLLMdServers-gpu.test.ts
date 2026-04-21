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
})
