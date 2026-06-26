import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import {
  EMPTY_RESPONSE,
  REFRESH_INTERVAL_MS,
  flush,
  k8sResponse,
  makeDeployment,
  makeEPPService,
  makeGateway,
  makeHPA,
  makePod,
  makePool,
  makeWVA,
  mockExec,
  mockGetDemoMode,
  nsResponse,
  registerUseStackDiscoveryTestHooks,
  setupMockExec,
} from './useStackDiscovery.shared'

const { useStackDiscovery } = await import('../useStackDiscovery')

describe('useStackDiscovery', () => {
  registerUseStackDiscoveryTestHooks()

  // ── 1. Empty clusters ──────────────────────────────────────────────────────

  it('returns empty stacks and isLoading=true when clusters is empty', () => {
    const { result, unmount } = renderHook(() => useStackDiscovery([]))
    expect(result.current.stacks).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('does not call kubectlProxy.exec when clusters array is empty', async () => {
    const { unmount } = renderHook(() => useStackDiscovery([]))
    await flush()
    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  // ── 2. Demo mode ──────────────────────────────────────────────────────────

  it('skips fetching and sets isLoading=false when demo mode is active', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result, unmount } = renderHook(() => useStackDiscovery(['cluster-a']))

    await flush()

    expect(result.current.isLoading).toBe(false)
    expect(result.current.stacks).toEqual([])
    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('does not set up a refresh interval in demo mode', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetDemoMode.mockReturnValue(true)
    const { unmount } = renderHook(() => useStackDiscovery(['cluster-a']))

    await flush()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 1000)
    })

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
    vi.useRealTimers()
  })

  // ── 3. Basic discovery with pods ──────────────────────────────────────────

  it('discovers stacks from labeled pods in a single cluster', async () => {
    setupMockExec({
      pods: [
        makePod('prefill-pod-0', 'llm-d-ns', 'prefill'),
        makePod('decode-pod-0', 'llm-d-ns', 'decode'),
      ],
      namespaces: ['default', 'kube-system'],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['cluster-a']))
    await waitFor(() => {
      expect(result.current.stacks.length).toBeGreaterThanOrEqual(1)
    })
    const stack = result.current.stacks[0]
    expect(stack.id).toBe('llm-d-ns@cluster-a')
    expect(stack.cluster).toBe('cluster-a')
    expect(stack.namespace).toBe('llm-d-ns')
    expect(stack.hasDisaggregation).toBe(true)
    expect(stack.components.prefill.length).toBeGreaterThan(0)
    expect(stack.components.decode.length).toBeGreaterThan(0)
    unmount()
  })

  it('groups pods by pod-template-hash into components', async () => {
    setupMockExec({
      pods: [
        makePod('vllm-abc123-x1', 'ns1', 'both', 'Running', true, { 'pod-template-hash': 'hash-a' }),
        makePod('vllm-abc123-x2', 'ns1', 'both', 'Running', true, { 'pod-template-hash': 'hash-a' }),
        makePod('vllm-def456-y1', 'ns1', 'both', 'Running', true, { 'pod-template-hash': 'hash-b' }),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    // Two distinct template hashes => two component groups
    expect(result.current.stacks[0].components.both.length).toBe(2)
    const hashAGroup = result.current.stacks[0].components.both.find(c => c.replicas === 2)
    expect(hashAGroup).toBeDefined()
    expect(hashAGroup!.podNames).toHaveLength(2)
    unmount()
  })

  it('classifies pods by name when role is unrecognized', async () => {
    setupMockExec({
      pods: [
        makePod('my-prefill-worker-0', 'ns1', 'unknown-role'),
        makePod('my-decode-worker-0', 'ns1', 'unknown-role', 'Running', true, { 'pod-template-hash': 'dec' }),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const stack = result.current.stacks[0]
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    unmount()
  })

  // ── 4. InferencePool detection ─────────────────────────────────────────────

  it('uses InferencePool name as stack name when available', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'pool-ns', 'both')],
      pools: [makePool('my-inference-pool', 'pool-ns')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].name).toBe('my-inference-pool')
    expect(result.current.stacks[0].inferencePool).toBe('my-inference-pool')
    unmount()
  })

  it('discovers namespace from InferencePool even without labeled pods', async () => {
    setupMockExec({
      pods: [],
      pools: [makePool('pool-only', 'pool-only-ns')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].namespace).toBe('pool-only-ns')
    expect(result.current.stacks[0].inferencePool).toBe('pool-only')
    unmount()
  })

  // ── 5. Service / EPP / Gateway detection ───────────────────────────────────

  it('detects EPP services and attaches them to the stack', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'svc-ns', 'both')],
      services: [makeEPPService('my-model-epp', 'svc-ns')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).not.toBeNull()
    expect(result.current.stacks[0].components.epp!.name).toBe('my-model-epp')
    expect(result.current.stacks[0].components.epp!.type).toBe('epp')
    unmount()
  })

  it('detects Gateway resources and sets status based on address presence', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'gw-ns', 'both')],
      gateways: [makeGateway('istio-gw', 'gw-ns', true)],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.gateway).not.toBeNull()
    expect(result.current.stacks[0].components.gateway!.status).toBe('running')
    unmount()
  })

  it('sets gateway status to pending when no addresses exist', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'gw-ns', 'both')],
      gateways: [makeGateway('istio-gw', 'gw-ns', false)],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.gateway!.status).toBe('pending')
    expect(result.current.stacks[0].components.gateway!.readyReplicas).toBe(0)
    unmount()
  })

  // ── 6. HPA / WVA autoscaler detection ──────────────────────────────────────

  it('detects HPA autoscaler and attaches info to the stack', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'hpa-ns', 'both')],
      hpas: [makeHPA('my-hpa', 'hpa-ns', 2, 10)],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const autoscaler = result.current.stacks[0].autoscaler
    expect(autoscaler).toBeDefined()
    expect(autoscaler!.type).toBe('HPA')
    expect(autoscaler!.minReplicas).toBe(2)
    expect(autoscaler!.maxReplicas).toBe(10)
    unmount()
  })

  // ── 9. Progressive discovery (Phase 2 deployments) ─────────────────────────

  it('discovers additional stacks via Phase 2 deployment scanning', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'phase1-ns', 'both')],
      namespaces: ['phase1-ns', 'vllm-serving', 'kube-system'],
      deploymentsByNs: {
        'vllm-serving': [
          makeDeployment('vllm-server', 'vllm-serving', 2, 2, { 'app.kubernetes.io/name': 'vllm' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    const ids = result.current.stacks.map(s => s.id)
    expect(ids).toContain('phase1-ns@c1')
    expect(ids).toContain('vllm-serving@c1')
    unmount()
  })

  it('skips namespaces already discovered in Phase 1 during Phase 2', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'llm-d-ns', 'both')],
      namespaces: ['llm-d-ns', 'inference-new'],
      deploymentsByNs: {
        'inference-new': [
          makeDeployment('granite-server', 'inference-new', 1, 1, { 'llmd.org/model': 'granite' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    // Phase 2 should NOT re-query llm-d-ns (already in Phase 1)
    const depCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => (c[0] as string[]).includes('deployments'),
    )
    const nsQueried = depCalls.map((c: unknown[]) => {
      const args = c[0] as string[]
      return args[args.indexOf('-n') + 1]
    })
    expect(nsQueried).not.toContain('llm-d-ns')
    expect(nsQueried).toContain('inference-new')
    unmount()
  })

  // ── 10. Deployment classification (EPP, prefill, decode, both) ─────────────

  it('classifies deployment as EPP when name contains -epp', async () => {
    setupMockExec({
      pods: [],
      namespaces: ['serving-ns'],
      deploymentsByNs: {
        'serving-ns': [
          makeDeployment('model-epp', 'serving-ns', 1, 1),
          makeDeployment('vllm-model', 'serving-ns', 2, 2, { 'app.kubernetes.io/name': 'vllm' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).not.toBeNull()
    expect(result.current.stacks[0].components.epp!.name).toBe('model-epp')
    unmount()
  })

  it('classifies deployments with prefill/decode in the name', async () => {
    setupMockExec({
      pods: [],
      namespaces: ['llm-d-pd'],
      deploymentsByNs: {
        'llm-d-pd': [
          makeDeployment('granite-prefill', 'llm-d-pd', 3, 3, { 'llmd.org/model': 'granite-3b' }),
          makeDeployment('granite-decode', 'llm-d-pd', 2, 2, { 'llmd.org/model': 'granite-3b' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const stack = result.current.stacks[0]
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    expect(stack.hasDisaggregation).toBe(true)
    expect(stack.model).toBe('granite-3b')
    unmount()
  })

  it('role label takes precedence over deployment name (fix #13716)', async () => {
    // Deployment named 'prefill-server' but explicitly labelled role=decode.
    // Before the fix this landed in prefill because depName.includes('prefill')
    // fired before role === 'decode' was checked.
    setupMockExec({
      pods: [],
      namespaces: ['llm-d-pd'],
      deploymentsByNs: {
        'llm-d-pd': [
          makeDeployment('prefill-server', 'llm-d-pd', 2, 2, { 'llm-d.ai/role': 'decode' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    const stack = result.current.stacks[0]
    expect(stack.components.decode.length).toBe(1)
    expect(stack.components.prefill.length).toBe(0)
    unmount()
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
})
