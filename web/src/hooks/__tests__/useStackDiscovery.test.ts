import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetDemoMode = vi.fn(() => false)
const mockExec = vi.fn()

vi.mock('../useDemoMode', () => ({
  getDemoMode: (...args: unknown[]) => mockGetDemoMode(...args),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

import { useStackDiscovery, stackToServerMetrics } from '../useStackDiscovery'
import type { LLMdStack } from '../useStackDiscovery'

// ── Constants mirrored from source ───────────────────────────────────────────

const CACHE_KEY = 'kubestellar-stack-cache'
const REFRESH_INTERVAL_MS = 120000

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a kubectl JSON response wrapping items */
function k8sResponse(items: unknown[], exitCode = 0) {
  return { output: JSON.stringify({ items }), exitCode }
}

/** Build an error/connection-refused kubectl response */
function errorResponse(msg = 'connection refused', exitCode = 1) {
  return { output: msg, exitCode }
}

/** Empty successful response (no items) */
const EMPTY_RESPONSE = k8sResponse([])

/** Namespace-list response (jsonpath format) */
function nsResponse(namespaces: string[]) {
  return { output: namespaces.join(' '), exitCode: 0 }
}

/** Build a minimal pod resource with llm-d labels */
function makePod(
  name: string,
  namespace: string,
  role: string,
  phase = 'Running',
  ready = true,
  extraLabels: Record<string, string> = {},
) {
  return {
    metadata: {
      name,
      namespace,
      labels: {
        'llm-d.ai/role': role,
        'pod-template-hash': 'abc123',
        ...extraLabels,
      },
    },
    status: {
      phase,
      containerStatuses: [{ ready }],
    },
  }
}

/** Build a minimal deployment resource */
function makeDeployment(
  name: string,
  namespace: string,
  replicas = 1,
  readyReplicas = 1,
  labels: Record<string, string> = {},
) {
  return {
    metadata: { name, namespace, labels: {} },
    spec: {
      replicas,
      template: { metadata: { labels } },
    },
    status: { replicas, readyReplicas, availableReplicas: readyReplicas },
  }
}

/** Build a minimal InferencePool resource */
function makePool(name: string, namespace: string) {
  return {
    metadata: { name, namespace },
    spec: { selector: { matchLabels: {} } },
  }
}

/** Build a minimal HPA resource */
function makeHPA(name: string, namespace: string, min = 1, max = 3) {
  return {
    metadata: { name, namespace },
    spec: { minReplicas: min, maxReplicas: max },
    status: { currentReplicas: min, desiredReplicas: min },
  }
}

/** Build a minimal WVA resource */
function makeWVA(name: string, namespace: string, min = 1, max = 5) {
  return {
    metadata: { name, namespace },
    spec: { minReplicas: min, maxReplicas: max },
    status: { currentReplicas: min, desiredReplicas: min },
  }
}

/** Build a minimal service resource with EPP naming */
function makeEPPService(name: string, namespace: string) {
  return {
    metadata: { name, namespace },
    spec: { ports: [{ port: 9002 }] },
  }
}

/** Build a minimal Gateway resource */
function makeGateway(name: string, namespace: string, hasAddress = true) {
  return {
    metadata: { name, namespace },
    spec: { gatewayClassName: 'istio' },
    status: hasAddress ? { addresses: [{ value: '10.0.0.1' }] } : {},
  }
}

/**
 * Configure mockExec to handle the standard 7 Phase-1 parallel calls,
 * followed by the namespace list call, and optional Phase-2 deployment calls.
 */
function setupMockExec(options: {
  pods?: unknown[]
  pools?: unknown[]
  services?: unknown[]
  gateways?: unknown[]
  hpas?: unknown[]
  wvas?: unknown[]
  vpas?: unknown[]
  namespaces?: string[]
  deploymentsByNs?: Record<string, unknown[]>
  clusterError?: boolean
}) {
  const {
    pods = [],
    pools = [],
    services = [],
    gateways = [],
    hpas = [],
    wvas = [],
    vpas = [],
    namespaces = [],
    deploymentsByNs = {},
    clusterError = false,
  } = options

  mockExec.mockImplementation((args: string[]) => {
    if (clusterError) {
      return Promise.resolve(errorResponse('Unable to connect'))
    }

    const cmd = args.join(' ')

    if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) {
      return Promise.resolve(k8sResponse(pods))
    }
    if (cmd.includes('inferencepools')) {
      return Promise.resolve(k8sResponse(pools))
    }
    if (cmd.includes('services')) {
      return Promise.resolve(k8sResponse(services))
    }
    if (cmd.includes('gateway') && !cmd.includes('kgateway')) {
      return Promise.resolve(k8sResponse(gateways))
    }
    if (cmd.includes('hpa')) {
      return Promise.resolve(k8sResponse(hpas))
    }
    if (cmd.includes('variantautoscalings')) {
      return Promise.resolve(k8sResponse(wvas))
    }
    if (cmd.includes('vpa')) {
      return Promise.resolve(k8sResponse(vpas))
    }
    if (cmd.includes('namespaces')) {
      return Promise.resolve(nsResponse(namespaces))
    }
    if (cmd.includes('deployments') && cmd.includes('-n')) {
      const nsFlag = args.indexOf('-n')
      const ns = nsFlag >= 0 ? args[nsFlag + 1] : ''
      const deps = deploymentsByNs[ns] || []
      return Promise.resolve(k8sResponse(deps))
    }

    return Promise.resolve(EMPTY_RESPONSE)
  })
}

/**
 * Flush all pending promises, microtasks, and timers.
 * With fake timers, advanceTimersByTimeAsync flushes the microtask queue.
 * We do multiple rounds to handle chained async operations
 * (Phase 1 -> namespace query -> Phase 2 batches).
 */
async function flush(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(0)
  }
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('useStackDiscovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    mockGetDemoMode.mockReturnValue(false)
    mockExec.mockResolvedValue(EMPTY_RESPONSE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
    await act(() => flush())
    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  // ── 2. Demo mode ──────────────────────────────────────────────────────────

  it('skips fetching and sets isLoading=false when demo mode is active', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result, unmount } = renderHook(() => useStackDiscovery(['cluster-a']))

    await act(() => flush())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.stacks).toEqual([])
    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('does not set up a refresh interval in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { unmount } = renderHook(() => useStackDiscovery(['cluster-a']))

    await act(() => flush())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 1000)
    })

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
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
    await act(() => flush())

    expect(result.current.stacks.length).toBeGreaterThanOrEqual(1)
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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    const autoscaler = result.current.stacks[0].autoscaler
    expect(autoscaler).toBeDefined()
    expect(autoscaler!.type).toBe('HPA')
    expect(autoscaler!.minReplicas).toBe(2)
    expect(autoscaler!.maxReplicas).toBe(10)
    unmount()
  })

  it('prefers WVA over HPA when both exist in the same namespace', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'auto-ns', 'both')],
      hpas: [makeHPA('hpa-1', 'auto-ns')],
      wvas: [makeWVA('wva-1', 'auto-ns', 1, 8)],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].autoscaler!.type).toBe('WVA')
    expect(result.current.stacks[0].autoscaler!.maxReplicas).toBe(8)
    unmount()
  })

  // ── 7. Error handling ──────────────────────────────────────────────────────

  it('skips unreachable clusters without setting error state', async () => {
    setupMockExec({ clusterError: true })

    const { result, unmount } = renderHook(() => useStackDiscovery(['bad-cluster']))
    await act(() => flush())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.stacks).toEqual([])
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('handles JSON parse errors in service response gracefully', async () => {
    mockExec.mockImplementation((args: string[]) => {
      const cmd = args.join(' ')
      if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) return Promise.resolve(k8sResponse([makePod('p-0', 'ns1', 'both')]))
      if (cmd.includes('services')) return Promise.resolve({ output: 'NOT-JSON', exitCode: 0 })
      if (cmd.includes('namespaces')) return Promise.resolve(nsResponse([]))
      return Promise.resolve(EMPTY_RESPONSE)
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).toBeNull()
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('handles per-cluster errors without crashing (continues to next cluster)', async () => {
    // First cluster throws; we expect no crash and stacks to be empty
    mockExec.mockRejectedValue(new Error('network failure'))

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.stacks).toEqual([])
    unmount()
  })

  // ── 8. Cached data / localStorage ──────────────────────────────────────────

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
    localStorage.setItem(CACHE_KEY, 'not-valid-json{{')

    const { result, unmount } = renderHook(() => useStackDiscovery([]))

    expect(result.current.stacks).toEqual([])
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('persists discovered stacks to localStorage', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'persist-ns', 'both')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored.stacks).toHaveLength(1)
    expect(stored.stacks[0].namespace).toBe('persist-ns')
    expect(stored.timestamp).toBeGreaterThan(0)
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
    await act(() => flush(10))

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
    await act(() => flush(10))

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
    await act(() => flush(10))

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
    await act(() => flush(10))

    expect(result.current.stacks.length).toBe(1)
    const stack = result.current.stacks[0]
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    expect(stack.hasDisaggregation).toBe(true)
    expect(stack.model).toBe('granite-3b')
    unmount()
  })

  // ── 11. Stack status computation ───────────────────────────────────────────

  it('computes status=healthy when all components are running', async () => {
    setupMockExec({
      pods: [
        makePod('prefill-0', 'ns1', 'prefill', 'Running', true),
        makePod('decode-0', 'ns1', 'decode', 'Running', true),
      ],
      services: [makeEPPService('ns1-epp', 'ns1')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].status).toBe('healthy')
    unmount()
  })

  it('computes status=unhealthy when no components are running', async () => {
    setupMockExec({
      pods: [
        makePod('prefill-0', 'ns1', 'prefill', 'Pending', false),
        makePod('decode-0', 'ns1', 'decode', 'Pending', false),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].status).toBe('unhealthy')
    unmount()
  })

  // ── 12. Refresh interval ───────────────────────────────────────────────────

  it('triggers silent refetch after REFRESH_INTERVAL_MS', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    const initialCallCount = mockExec.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)
    })
    await act(() => flush())

    expect(mockExec.mock.calls.length).toBeGreaterThan(initialCallCount)
    unmount()
  })

  it('clears interval on unmount to prevent worker hangs', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'ns1', 'both')],
      namespaces: [],
    })

    const { unmount } = renderHook(() => useStackDiscovery(['c1']))
    await act(() => flush())

    unmount()

    const callCountAfterUnmount = mockExec.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2)
    })

    expect(mockExec.mock.calls.length).toBe(callCountAfterUnmount)
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
    await act(() => flush(10))

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
    await act(() => flush())

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
    await act(() => flush())

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

    await act(() => flush())

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
    await act(() => flush())

    const callsBefore = mockExec.mock.calls.length

    await act(async () => {
      result.current.refetch()
      await flush()
    })

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

    await act(() => flush())

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
    await act(() => flush(10))

    expect(result.current.stacks.length).toBe(2)
    const namespaces = result.current.stacks.map(s => s.namespace)
    expect(namespaces).toContain('vllm-production')
    expect(namespaces).toContain('inference-v2')
    expect(namespaces).not.toContain('default')
    expect(namespaces).not.toContain('kube-system')
    unmount()
  })

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush())

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
    await act(() => flush(10))

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
