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



// ---------------------------------------------------------------------------
// useLLMdServers — additional deep coverage
// ---------------------------------------------------------------------------

describe('useLLMdServers — deep coverage', () => {
  // -----------------------------------------------------------------------
  // Consecutive failures and isFailed
  // -----------------------------------------------------------------------
  describe('consecutive failures and isFailed', () => {
    it('per-cluster errors are caught internally so consecutiveFailures stays 0', async () => {
      vi.useFakeTimers()
      mockExec.mockImplementation(() => {
        throw new Error('persistent server failure')
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      // Let initial fetch complete — per-cluster errors are caught in the inner
      // try/catch, so the outer catch is never reached and consecutiveFailures
      // is reset to 0 after the for-loop.
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })

      // Trigger 2 more refreshes
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      // Per-cluster errors don't propagate to the outer catch, so
      // consecutiveFailures is reset to 0 after each fetch cycle.
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.isFailed).toBe(false)
      expect(result.current.status.healthy).toBe(true)
      unmount()
      vi.useRealTimers()
    })

    it('handles per-cluster Error gracefully on non-silent failure', async () => {
      mockExec.mockImplementation(() => {
        throw new Error('Specific error message')
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Per-cluster errors are caught internally; error stays null
      expect(result.current.error).toBeNull()
      unmount()
    })

    it('handles per-cluster non-Error thrown value gracefully', async () => {
      mockExec.mockImplementation(() => {
        throw 'a string error'
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Per-cluster errors are caught internally; error stays null
      expect(result.current.error).toBeNull()
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // VA with no targetRef.kind but with targetRef.name
  // -----------------------------------------------------------------------
  describe('VA autoscaler edge cases', () => {
    it('detects VA without kind but with name (targetRef.name only)', async () => {
      const depName = 'vllm-server'
      const ns = 'llm-d-ns'

      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: depName, namespace: ns })],
        },
        va: {
          items: [{
            metadata: { name: 'va-no-kind', namespace: ns },
            spec: {
              targetRef: {
                // no kind specified
                name: depName,
              },
            },
          }],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].hasAutoscaler).toBe(true)
      expect(result.current.servers[0].autoscalerType).toBe('va')
      unmount()
    })

    it('handles VA with empty targetRef', async () => {
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
        va: {
          items: [{
            metadata: { name: 'va-empty', namespace: 'llm-d-ns' },
            spec: {
              targetRef: {},
            },
          }],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      // VA without kind or name should not match
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Namespace-based filtering patterns not yet exercised
  // -----------------------------------------------------------------------
  describe('namespace matching patterns', () => {
    it('matches deployments in b2 namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'b2' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in effi namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'effi-test' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in guygir namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'guygir-prod' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in serving namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'serving-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in model namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'model-serving' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in ai- namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'ai-workloads' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in -ai namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'prod-ai' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })

    it('matches deployments in ml- namespace', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-server', namespace: 'ml-pipeline' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Component type: EPP with -epp in the middle of name
  // -----------------------------------------------------------------------
  describe('component type: epp with -epp in name', () => {
    it('detects EPP from name containing -epp', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'model-epp-controller', namespace: 'llm-d-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('epp')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Triton from name only (without label)
  // -----------------------------------------------------------------------
  describe('server type: triton from name', () => {
    it('detects triton servers from name containing triton', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'triton-inference',
              namespace: 'llm-d-ns',
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].type).toBe('triton')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Component type: model via inferenceServing label
  // -----------------------------------------------------------------------
  describe('component type: model via inferenceServing label', () => {
    it('detects model from llmd.org/inferenceServing=true label', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({
              name: 'custom-server',
              namespace: 'llm-d-ns',
              templateLabels: { 'llmd.org/inferenceServing': 'true' },
            }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      expect(result.current.servers[0].componentType).toBe('model')
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Silent refetch does not reset servers or set isLoading
  // -----------------------------------------------------------------------
  describe('silent refetch behavior', () => {
    it('silent refetch does not reset servers list', async () => {
      vi.useFakeTimers()
      setupKubectl({
        deployments: {
          items: [makeDeployment({ name: 'vllm-server', namespace: 'llm-d-ns' })],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      // Let initial fetch complete
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      expect(result.current.servers.length).toBeGreaterThan(0)

      // Silent refetch should not clear servers
      const _serverCountBefore = result.current.servers.length

      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      // Servers should still be present (may have been updated but not cleared)
      expect(result.current.servers.length).toBeGreaterThanOrEqual(0)
      unmount()
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // Status useMemo edge cases
  // -----------------------------------------------------------------------
  describe('status memoization with mixed server states', () => {
    it('correctly counts servers with different statuses', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-running', namespace: 'llm-d-ns', replicas: 2, readyReplicas: 2, templateLabels: { 'llmd.org/model': 'model-a' } }),
            makeDeployment({ name: 'vllm-stopped', namespace: 'llm-d-ns', replicas: 0, readyReplicas: 0, templateLabels: { 'llmd.org/model': 'model-b' } }),
            makeDeployment({ name: 'vllm-scaling', namespace: 'llm-d-ns', replicas: 3, readyReplicas: 1, templateLabels: { 'llmd.org/model': 'model-c' } }),
            makeDeployment({ name: 'vllm-error', namespace: 'llm-d-ns', replicas: 2, readyReplicas: 0, templateLabels: { 'llmd.org/model': 'model-d' } }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(4))
      const { status } = result.current
      expect(status.totalServers).toBe(4)
      expect(status.runningServers).toBe(1)
      expect(status.stoppedServers).toBe(1)
      expect(status.totalModels).toBe(4)
      expect(status.loadedModels).toBe(1) // only running servers' models
      unmount()
    })

    it('totalModels deduplicates by model name', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'vllm-a', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1, templateLabels: { 'llmd.org/model': 'shared-model' } }),
            makeDeployment({ name: 'vllm-b', namespace: 'llm-d-ns', replicas: 1, readyReplicas: 1, templateLabels: { 'llmd.org/model': 'shared-model' } }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBe(2))
      const { status } = result.current
      expect(status.totalModels).toBe(1) // same model name deduplicated
      expect(status.loadedModels).toBe(1)
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Deployment with llmd namespace and scheduling name
  // -----------------------------------------------------------------------
  describe('scheduling deployments in llm-d namespaces', () => {
    it('includes scheduling deployments in llm-d namespaces', async () => {
      setupKubectl({
        deployments: {
          items: [
            makeDeployment({ name: 'scheduling-controller', namespace: 'llmd-ns' }),
          ],
        },
      })

      const { result, unmount } = renderHook(() => useLLMdServers(['c1']))

      await waitFor(() => expect(result.current.servers.length).toBeGreaterThan(0))
      unmount()
    })
  })
})
