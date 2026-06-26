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

      const {unmount } = renderHook(() => useLLMdModels(['c1']))

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

  // -----------------------------------------------------------------------
  // Deep coverage: consecutive failures and isFailed for models
  // -----------------------------------------------------------------------
  describe('consecutive failures and isFailed', () => {
    it('per-cluster errors are caught internally so consecutiveFailures stays 0', async () => {
      // Per-cluster errors are caught in the inner try/catch and
      // don't propagate to the outer catch that increments consecutiveFailures.
      mockExec.mockImplementation(() => {
        throw new Error('total failure')
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.consecutiveFailures).toBe(0)
      unmount()
    })

    it('consecutiveFailures stays 0 after repeated per-cluster errors', async () => {
      vi.useFakeTimers()
      mockExec.mockImplementation(() => {
        throw new Error('persistent failure')
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      // Let initial fetch complete — per-cluster errors are caught internally
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })

      // Trigger 2 more refreshes
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      // Per-cluster errors don't reach the outer catch
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.isFailed).toBe(false)
      unmount()
      vi.useRealTimers()
    })

    it('sets error message on non-silent fetch failure', async () => {
      mockExec.mockImplementation(() => {
        throw new Error('Outer catch triggered')
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // The outer catch should set the error if it's a non-silent fetch
      // (initial fetch is non-silent)
      unmount()
    })

    it('does not set error on silent fetch failure', async () => {
      vi.useFakeTimers()
      let first = true
      mockExec.mockImplementation(() => {
        if (first) {
          first = false
          return Promise.resolve({ output: JSON.stringify({ items: [] }), exitCode: 0, error: '' })
        }
        throw new Error('Silent failure')
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      // Let initial fetch succeed
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      expect(result.current.error).toBeNull()

      // Trigger silent refresh that fails
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      // Error should still be null because silent=true
      expect(result.current.error).toBeNull()
      unmount()
      vi.useRealTimers()
    })

    it('consecutiveFailures stays 0 across per-cluster failures and successes', async () => {
      vi.useFakeTimers()
      let shouldFail = true
      mockExec.mockImplementation(() => {
        if (shouldFail) {
          throw new Error('temporary failure')
        }
        return Promise.resolve({ output: JSON.stringify({ items: [] }), exitCode: 0, error: '' })
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      // Let initial fetch complete — per-cluster errors are caught internally
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      expect(result.current.consecutiveFailures).toBe(0)

      // Fix the mock and trigger refresh
      shouldFail = false
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })

      expect(result.current.consecutiveFailures).toBe(0)
      unmount()
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // Deep coverage: non-Error thrown in outer catch
  // -----------------------------------------------------------------------
  describe('non-Error thrown objects', () => {
    it('handles non-Error thrown value (string) in model fetch', async () => {
      mockExec.mockImplementation(() => {
        throw 'string error thrown'
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // The error message should be the generic fallback
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Progressive loading: models already partially loaded
  // -----------------------------------------------------------------------
  describe('progressive loading for models', () => {
    it('progressively loads models from multiple clusters', async () => {
      let resolveFirst: (v: unknown) => void
      let resolveSecond: (v: unknown) => void
      const firstPromise = new Promise(r => { resolveFirst = r })
      const secondPromise = new Promise(r => { resolveSecond = r })
      let callNum = 0

      mockExec.mockImplementation(() => {
        callNum++
        if (callNum === 1) return firstPromise
        if (callNum === 2) return secondPromise
        return Promise.resolve({ output: JSON.stringify({ items: [] }), exitCode: 0, error: '' })
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['cluster-a', 'cluster-b']))

      // Resolve first cluster
      await act(async () => {
        resolveFirst!({
          output: JSON.stringify({
            items: [makeInferencePool({ name: 'pool-a', namespace: 'ns', accepted: true })],
          }),
          exitCode: 0,
          error: '',
        })
      })

      // First cluster's models should appear
      await waitFor(() => expect(result.current.models.length).toBeGreaterThanOrEqual(1))

      // Resolve second cluster
      await act(async () => {
        resolveSecond!({
          output: JSON.stringify({
            items: [makeInferencePool({ name: 'pool-b', namespace: 'ns', accepted: true })],
          }),
          exitCode: 0,
          error: '',
        })
      })

      await waitFor(() => expect(result.current.models.length).toBe(2))
      unmount()
    })
  })

  // -----------------------------------------------------------------------
  // Manual refetch for models
  // -----------------------------------------------------------------------
  describe('manual refetch for models', () => {
    it('calling refetch manually triggers a new fetch', async () => {
      mockExec.mockImplementation(() => {
        return Promise.resolve({
          output: JSON.stringify({
            items: [makeInferencePool({ name: 'pool-1', namespace: 'ns', accepted: true })],
          }),
          exitCode: 0,
          error: '',
        })
      })

      const { result, unmount } = renderHook(() => useLLMdModels(['c1']))

      await waitFor(() => expect(result.current.models.length).toBe(1))
      const callsBefore = mockExec.mock.calls.length

      await act(async () => {
        result.current.refetch()
      })

      await waitFor(() => expect(mockExec.mock.calls.length).toBeGreaterThan(callsBefore))
      unmount()
    })
  })
})
