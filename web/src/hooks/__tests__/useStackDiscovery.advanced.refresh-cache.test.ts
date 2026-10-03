import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import {
  CACHE_KEY,
  EMPTY_RESPONSE,
  REFRESH_INTERVAL_MS,
  flush,
  k8sResponse,
  makePod,
  makePool,
  mockExec,
  nsResponse,
  setupMockExec,
  useStackDiscovery,
  type LLMdStack,
} from './useStackDiscovery.advanced.setup'

describe('useStackDiscovery', () => {
  // ── 12. Refresh interval ───────────────────────────────────────────────────

  it('triggers silent refetch after REFRESH_INTERVAL_MS', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { unmount } = renderHook(() => useStackDiscovery(['c1']))
    // Wait for initial fetch to complete
    await vi.advanceTimersByTimeAsync(500)

    const initialCallCount = mockExec.mock.calls.length

    // Advance past the refresh interval to trigger a silent refetch
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 500)

    expect(mockExec.mock.calls.length).toBeGreaterThan(initialCallCount)
    unmount()
    vi.useRealTimers()
  })

  it('clears interval on unmount to prevent worker hangs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    unmount()

    const callCountAfterUnmount = mockExec.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2)
    })

    // Allow at most 1 extra call from an in-flight async callback at unmount time
    expect(mockExec.mock.calls.length).toBeLessThanOrEqual(callCountAfterUnmount + 1)
    vi.useRealTimers()
  })

  // ── 13. Multiple clusters ─────────────────────────────────────────────────

  it('processes multiple clusters sequentially and merges results', async () => {
    mockExec.mockImplementation((args: string[], opts?: { context?: string }) => {
      const cmd = args.join(' ')
      const ctx = opts?.context || ''

      if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) {
        if (ctx === 'cluster-a') return Promise.resolve(k8sResponse([makePod('pa-0', 'ns-a', 'both')]))
        if (ctx === 'cluster-b') return Promise.resolve(k8sResponse([makePod('pb-0', 'ns-b', 'both')]))
        return Promise.resolve(EMPTY_RESPONSE)
      }
      if (cmd.includes('namespaces')) return Promise.resolve(nsResponse([]))
      return Promise.resolve(EMPTY_RESPONSE)
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['cluster-a', 'cluster-b']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    const ids = result.current.stacks.map(s => s.id)
    expect(ids).toContain('ns-a@cluster-a')
    expect(ids).toContain('ns-b@cluster-b')
    unmount()
  })

  // ── 14. Cached merge (stale-while-revalidate) ─────────────────────────────

  it('preserves cached component details when fresh fetch loses them', async () => {
    const cachedStack: LLMdStack = {
      id: 'merge-ns@c1',
      name: 'merge-ns',
      namespace: 'merge-ns',
      cluster: 'c1',
      components: {
        prefill: [{
          name: 'cached-prefill', namespace: 'merge-ns', cluster: 'c1',
          type: 'prefill', status: 'running', replicas: 2, readyReplicas: 2,
        }],
        decode: [{
          name: 'cached-decode', namespace: 'merge-ns', cluster: 'c1',
          type: 'decode', status: 'running', replicas: 3, readyReplicas: 3,
        }],
        both: [],
        epp: {
          name: 'cached-epp', namespace: 'merge-ns', cluster: 'c1',
          type: 'epp', status: 'running', replicas: 1, readyReplicas: 1,
        },
        gateway: null,
      },
      status: 'healthy',
      hasDisaggregation: true,
      model: 'granite-3b',
      totalReplicas: 5,
      readyReplicas: 5,
      autoscaler: { type: 'HPA', name: 'my-hpa', minReplicas: 1, maxReplicas: 10 },
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      stacks: [cachedStack],
      timestamp: Date.now(),
    }))

    // Fresh fetch returns the namespace but pods API fails — components will be empty
    setupMockExec({
      pods: [],
      pools: [makePool('merge-pool', 'merge-ns')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    const stack = result.current.stacks.find(s => s.id === 'merge-ns@c1')!
    expect(stack).toBeDefined()
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    expect(stack.components.epp).not.toBeNull()
    expect(stack.autoscaler?.type).toBe('HPA')
    expect(stack.model).toBe('granite-3b')
    unmount()
  })

  // ── 15. Pod status mapping ─────────────────────────────────────────────────

  it('maps pod phase and container readiness to component status', async () => {
    setupMockExec({
      pods: [
        makePod('running-pod', 'ns1', 'both', 'Running', true),
        makePod('error-pod', 'ns1', 'both', 'Failed', false, { 'pod-template-hash': 'err-hash' }),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const components = result.current.stacks[0].components.both
    const runningComp = components.find(c => c.readyReplicas > 0)
    const errorComp = components.find(c => c.readyReplicas === 0)

    expect(runningComp?.status).toBe('running')
    expect(errorComp?.status).toBe('error')
    unmount()
  })

  // ── 16. Unmount during active fetch ────────────────────────────────────────

  it('does not crash when unmounted during an active fetch', async () => {
    let resolveExec: ((v: unknown) => void) | null = null
    mockExec.mockImplementation(() => new Promise(resolve => { resolveExec = resolve }))

    const { unmount } = renderHook(() => useStackDiscovery(['c1']))

    await flush()

    unmount()

    // Resolve the pending exec after unmount — should not throw
    if (resolveExec) {
      resolveExec(EMPTY_RESPONSE)
    }
  })

  // ── 17. refetch function exposure ──────────────────────────────────────────

  it('exposes a refetch function that triggers a non-silent refetch', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    const callsBefore = mockExec.mock.calls.length

    act(() => { result.current.refetch() })
    await flush()

    expect(mockExec.mock.calls.length).toBeGreaterThan(callsBefore)
    unmount()
  })

  // ── 18. lastRefresh tracking ───────────────────────────────────────────────

  it('updates lastRefresh after successful discovery', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))

    expect(result.current.lastRefresh).toBeNull()

    await flush()

    expect(result.current.lastRefresh).not.toBeNull()
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
    unmount()
  })

  // ── 19. Namespace heuristic filtering ──────────────────────────────────────

  it('filters Phase 2 namespaces using llm-d heuristics', async () => {
    setupMockExec({
      pods: [],
      namespaces: [
        'default',          // NOT an llm-d namespace
        'kube-system',      // NOT an llm-d namespace
        'vllm-production',  // IS (contains "vllm")
        'inference-v2',     // IS (contains "inference")
        'my-app',           // NOT
      ],
      deploymentsByNs: {
        'vllm-production': [
          makeDeployment('vllm-server', 'vllm-production', 1, 1, { 'app.kubernetes.io/name': 'vllm' }),
        ],
        'inference-v2': [
          makeDeployment('llama-serving', 'inference-v2', 1, 1, { 'llmd.org/model': 'llama-2' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    const namespaces = result.current.stacks.map(s => s.namespace)
    expect(namespaces).toContain('vllm-production')
    expect(namespaces).toContain('inference-v2')
    expect(namespaces).not.toContain('default')
    expect(namespaces).not.toContain('kube-system')
    unmount()
  })
})
