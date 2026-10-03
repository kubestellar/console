import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  EMPTY_RESPONSE,
  flush,
  k8sResponse,
  makeDeployment,
  makePod,
  mockExec,
  nsResponse,
  setupMockExec,
  stackToServerMetrics,
  useStackDiscovery,
  type LLMdStack,
} from './useStackDiscovery.advanced.setup'

describe('useStackDiscovery', () => {
  // ── 20. stackToServerMetrics ───────────────────────────────────────────────

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
