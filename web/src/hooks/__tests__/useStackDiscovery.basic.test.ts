import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted keeps these declarations available inside vi.mock factories,
// which are themselves hoisted to the top of the module by vitest.
const { mockGetDemoMode, mockExec } = vi.hoisted(() => ({
  mockGetDemoMode: vi.fn(() => false),
  mockExec: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

import { useStackDiscovery } from '../useStackDiscovery'
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
 * Wait for React state to settle after async operations.
 * Uses a small delay to allow microtasks, Promises, and React state updates to flush.
 * In vitest 4, act() with async callbacks can hang when hooks use setInterval,
 * so we use a plain timeout instead.
 */
async function flush() {
  // Allow enough time for chained async operations:
  // useEffect -> refetch -> Phase 1 (Promise.all) -> Phase 2 (namespace query -> deployment batches)
  await new Promise(resolve => setTimeout(resolve, 200))
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('useStackDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetDemoMode.mockReturnValue(false)
    mockExec.mockResolvedValue(EMPTY_RESPONSE)
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

  it('prefers WVA over HPA when both exist in the same namespace', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'auto-ns', 'both')],
      hpas: [makeHPA('hpa-1', 'auto-ns')],
      wvas: [makeWVA('wva-1', 'auto-ns', 1, 8)],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].autoscaler!.type).toBe('WVA')
    expect(result.current.stacks[0].autoscaler!.maxReplicas).toBe(8)
    unmount()
  })

  // ── 7. Error handling ──────────────────────────────────────────────────────

  it('skips unreachable clusters without setting error state', async () => {
    setupMockExec({ clusterError: true })

    const { result, unmount } = renderHook(() => useStackDiscovery(['bad-cluster']))
    await flush()

    // After processing an unreachable cluster, stacks remain empty and no error is set
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
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).toBeNull()
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('handles per-cluster errors without crashing (continues to next cluster)', async () => {
    // First cluster throws; we expect no crash and stacks to be empty
    mockExec.mockRejectedValue(new Error('network failure'))

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    // The hook should not crash on rejected promises — stacks remain empty
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

})
