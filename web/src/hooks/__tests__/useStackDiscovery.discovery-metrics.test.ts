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
    await flush()
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
    await flush()
    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].status).toBe('unhealthy')
    unmount()
  })
  // ── 12. Refresh interval ───────────────────────────────────────────────────
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
})
