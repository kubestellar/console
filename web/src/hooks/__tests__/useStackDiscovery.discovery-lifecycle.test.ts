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
  // ── 20. stackToServerMetrics ───────────────────────────────────────────────
})
