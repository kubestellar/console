import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { LLMdStack } from '../useStackDiscovery'

import {
  CACHE_KEY,
  EMPTY_RESPONSE,
  REFRESH_INTERVAL_MS,
  flush,
  k8sResponse,
  makeDeployment,
  makePod,
  makePool,
  mockExec,
  nsResponse,
  registerUseStackDiscoveryTestHooks,
  setupMockExec,
} from './useStackDiscovery.shared'

const { stackToServerMetrics, useStackDiscovery } = await import('../useStackDiscovery')

describe('useStackDiscovery', () => {
  registerUseStackDiscoveryTestHooks()

  it('loads cached stacks from localStorage on initial render', () => {
    const cachedStack: LLMdStack = {
      id: 'cached-ns@cluster-a',
      name: 'cached-ns',
      namespace: 'cached-ns',
      cluster: 'cluster-a',
      components: {
        prefill: [],
        decode: [],
        both: [{
          name: 'cached-deploy', namespace: 'cached-ns', cluster: 'cluster-a',
          type: 'both', status: 'running', replicas: 1, readyReplicas: 1,
        }],
        epp: null,
        gateway: null,
      },
      status: 'healthy',
      hasDisaggregation: false,
      totalReplicas: 1,
      readyReplicas: 1,
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      stacks: [cachedStack],
      timestamp: Date.now(),
    }))

    const { result, unmount } = renderHook(() => useStackDiscovery([]))

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].id).toBe('cached-ns@cluster-a')
    expect(result.current.isLoading).toBe(false)
    unmount()
  })

  it('handles malformed localStorage data without crashing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CACHE_KEY, 'not-valid-json{{')

    const { result, unmount } = renderHook(() => useStackDiscovery([]))

    expect(result.current.stacks).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      '[useStackDiscovery] Ignoring malformed JSON for stack cache:',
      expect.any(SyntaxError),
    )
    unmount()
    warnSpy.mockRestore()
  })

  it('persists discovered stacks to localStorage', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'persist-ns', 'both')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored.stacks).toHaveLength(1)
    expect(stored.stacks[0].namespace).toBe('persist-ns')
    expect(stored.timestamp).toBeGreaterThan(0)
    unmount()
  })

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


  it('converts a stack to LLMdServer[] with correct component types', () => {
    const stack: LLMdStack = {
      id: 'test-ns@c1',
      name: 'test-ns',
      namespace: 'test-ns',
      cluster: 'c1',
      components: {
        prefill: [{
          name: 'pf-0', namespace: 'test-ns', cluster: 'c1',
          type: 'prefill', status: 'running', replicas: 2, readyReplicas: 2, model: 'granite',
        }],
        decode: [{
          name: 'dc-0', namespace: 'test-ns', cluster: 'c1',
          type: 'decode', status: 'running', replicas: 3, readyReplicas: 3, model: 'granite',
        }],
        both: [{
          name: 'uni-0', namespace: 'test-ns', cluster: 'c1',
          type: 'both', status: 'running', replicas: 1, readyReplicas: 1,
        }],
        epp: {
          name: 'epp-0', namespace: 'test-ns', cluster: 'c1',
          type: 'epp', status: 'running', replicas: 1, readyReplicas: 1,
        },
        gateway: {
          name: 'gw-0', namespace: 'test-ns', cluster: 'c1',
          type: 'gateway', status: 'running', replicas: 1, readyReplicas: 1,
        },
      },
      status: 'healthy',
      hasDisaggregation: true,
      model: 'granite',
      totalReplicas: 6,
      readyReplicas: 6,
    }

    const servers = stackToServerMetrics(stack)

    expect(servers.length).toBe(5)
    expect(servers.filter(s => s.componentType === 'model').length).toBe(3)
    expect(servers.filter(s => s.componentType === 'epp').length).toBe(1)
    expect(servers.filter(s => s.componentType === 'gateway').length).toBe(1)

    const eppServer = servers.find(s => s.componentType === 'epp')!
    expect(eppServer.name).toBe('EPP Scheduler')

    const gwServer = servers.find(s => s.componentType === 'gateway')!
    expect(gwServer.name).toBe('Istio Gateway')
    expect(gwServer.gatewayType).toBe('istio')
  })

  it('stackToServerMetrics uses stack model as fallback when component has no model', () => {
    const stack: LLMdStack = {
      id: 'fb-ns@c1',
      name: 'fb-ns',
      namespace: 'fb-ns',
      cluster: 'c1',
      components: {
        prefill: [],
        decode: [],
        both: [{
          name: 'server-0', namespace: 'fb-ns', cluster: 'c1',
          type: 'both', status: 'running', replicas: 1, readyReplicas: 1,
        }],
        epp: null,
        gateway: null,
      },
      status: 'healthy',
      hasDisaggregation: false,
      model: 'fallback-model',
      totalReplicas: 1,
      readyReplicas: 1,
    }

    const servers = stackToServerMetrics(stack)
    expect(servers[0].model).toBe('fallback-model')
  })

  // ── 21. Stacks sorted: healthy first, then alphabetical ────────────────────

  it('sorts stacks with healthy first, then by name', async () => {
    mockExec.mockImplementation((args: string[]) => {
      const cmd = args.join(' ')
      if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) {
        return Promise.resolve(k8sResponse([
          makePod('pod-z', 'z-ns', 'both', 'Pending', false),
          makePod('pod-a', 'a-ns', 'both', 'Running', true),
        ]))
      }
      if (cmd.includes('namespaces')) return Promise.resolve(nsResponse([]))
      return Promise.resolve(EMPTY_RESPONSE)
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    // a-ns is healthy (running), z-ns is unhealthy — healthy comes first
    expect(result.current.stacks[0].namespace).toBe('a-ns')
    expect(result.current.stacks[1].namespace).toBe('z-ns')
    unmount()
  })

  // ── 22. Pod role variants ──────────────────────────────────────────────────

  it('recognizes prefill-server, decode-server, and vllm roles', async () => {
    setupMockExec({
      pods: [
        makePod('ps-0', 'ns1', 'prefill-server'),
        makePod('ds-0', 'ns1', 'decode-server', 'Running', true, { 'pod-template-hash': 'ds' }),
        makePod('vl-0', 'ns1', 'vllm', 'Running', true, { 'pod-template-hash': 'vl' }),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const stack = result.current.stacks[0]
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    expect(stack.components.both.length).toBe(1)
    unmount()
  })

  // ── 23. VPA detection ──────────────────────────────────────────────────────

  it('detects VPA as autoscaler when no WVA or HPA exist', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'vpa-ns', 'both')],
      vpas: [{ metadata: { name: 'my-vpa', namespace: 'vpa-ns' } }],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].autoscaler?.type).toBe('VPA')
    expect(result.current.stacks[0].autoscaler?.name).toBe('my-vpa')
    unmount()
  })

  // ── 24. Deployment status mapping ──────────────────────────────────────────

  it('maps deployment replicas/readyReplicas to correct component status', async () => {
    setupMockExec({
      pods: [],
      namespaces: ['llm-d-status'],
      deploymentsByNs: {
        'llm-d-status': [
          makeDeployment('healthy-model', 'llm-d-status', 3, 3, { 'app.kubernetes.io/name': 'vllm' }),
          makeDeployment('degraded-model', 'llm-d-status', 3, 1, {
            'app.kubernetes.io/name': 'vllm',
            'pod-template-hash': 'deg',
          }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const comps = result.current.stacks[0].components.both
    const healthy = comps.find(c => c.name === 'healthy-model')
    const degraded = comps.find(c => c.name === 'degraded-model')

    expect(healthy?.status).toBe('running')
    expect(degraded?.status).toBe('running') // readyReplicas > 0 => 'running'
    unmount()
  })

  // ── 25. Return shape contract ──────────────────────────────────────────────

  it('always returns the expected shape regardless of input', () => {
    const { result, unmount } = renderHook(() => useStackDiscovery([]))

    expect(result.current).toHaveProperty('stacks')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(Array.isArray(result.current.stacks)).toBe(true)
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })
})
