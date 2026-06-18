import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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
    await flush()
    expect(result.current.stacks.length).toBe(1)
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored.stacks).toHaveLength(1)
    expect(stored.stacks[0].namespace).toBe('persist-ns')
    expect(stored.timestamp).toBeGreaterThan(0)
    unmount()
  })
  // ── 9. Progressive discovery (Phase 2 deployments) ─────────────────────────
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
  // ── 11. Stack status computation ───────────────────────────────────────────
})
