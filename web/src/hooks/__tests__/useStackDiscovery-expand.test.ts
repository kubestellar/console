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
import type { LLMdStack, LLMdStackComponent } from '../useStackDiscovery'

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_KEY = 'kubestellar-stack-cache'

// ── Helpers ─────────────────────────────────────────────────────────────────

function k8sResponse(items: unknown[], exitCode = 0) {
  return { output: JSON.stringify({ items }), exitCode }
}

function errorResponse(msg = 'connection refused', exitCode = 1) {
  return { output: msg, exitCode }
}

const EMPTY_RESPONSE = k8sResponse([])

function nsResponse(namespaces: string[]) {
  return { output: namespaces.join(' '), exitCode: 0 }
}

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

function makeComponent(overrides: Partial<LLMdStackComponent> = {}): LLMdStackComponent {
  return {
    name: 'test-comp',
    namespace: 'default',
    cluster: 'cluster-1',
    type: 'both',
    status: 'running',
    replicas: 1,
    readyReplicas: 1,
    ...overrides,
  }
}

function makeStack(overrides: Partial<LLMdStack> = {}): LLMdStack {
  return {
    id: 'default@cluster-1',
    name: 'default',
    namespace: 'default',
    cluster: 'cluster-1',
    components: {
      prefill: [],
      decode: [],
      both: [makeComponent()],
      epp: null,
      gateway: null,
    },
    status: 'healthy',
    hasDisaggregation: false,
    totalReplicas: 1,
    readyReplicas: 1,
    ...overrides,
  }
}

/**
 * Setup standard Phase 1 mock responses (7 parallel calls) +
 * namespace list + optional Phase 2 deployments.
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
} = {}) {
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
    if (clusterError) return Promise.resolve(errorResponse('Unable to connect'))

    // Phase 1 parallel calls (first 7)
    const cmd = args.join(' ')
    if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) return Promise.resolve(k8sResponse(pods))
    if (cmd.includes('inferencepools')) return Promise.resolve(k8sResponse(pools))
    if (cmd.includes('services')) return Promise.resolve(k8sResponse(services))
    if (cmd.includes('gateway') && !cmd.includes('deployment')) return Promise.resolve(k8sResponse(gateways))
    if (cmd.includes('hpa')) return Promise.resolve(k8sResponse(hpas))
    if (cmd.includes('variantautoscalings')) return Promise.resolve(k8sResponse(wvas))
    if (cmd.includes('vpa')) return Promise.resolve(k8sResponse(vpas))
    if (cmd.includes('namespaces')) return Promise.resolve(nsResponse(namespaces))

    // Phase 2: deployments per namespace
    if (cmd.includes('deployments')) {
      const nsMatch = args.find((a, i) => args[i - 1] === '-n')
      if (nsMatch && deploymentsByNs[nsMatch]) {
        return Promise.resolve(k8sResponse(deploymentsByNs[nsMatch]))
      }
      return Promise.resolve(EMPTY_RESPONSE)
    }
    return Promise.resolve(EMPTY_RESPONSE)
  })
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mockGetDemoMode.mockReturnValue(false)
  mockExec.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useStackDiscovery — expanded edge cases', () => {
  // 1. Demo mode skips fetching entirely
  it('returns empty stacks and stops loading in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(result.current.isLoading).toBe(false)
    expect(mockExec).not.toHaveBeenCalled()
  })

  // 2. Cluster with connection error is skipped
  it('skips cluster when kubectl returns connection refused', async () => {
    setupMockExec({ clusterError: true })
    const { result } = renderHook(() => useStackDiscovery(['bad-cluster']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(result.current.error).toBeNull()
  })

  // 3. Skips cluster when output says "timeout"
  it('skips cluster when kubectl output contains timeout', async () => {
    mockExec.mockResolvedValue(errorResponse('context deadline exceeded', 1))
    const { result } = renderHook(() => useStackDiscovery(['slow-cluster']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(result.current.error).toBeNull()
  })

  // 4. Concurrent refetches are prevented
  it('prevents concurrent refetches via isRefetching guard', async () => {
    setupMockExec()
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    // Trigger multiple refetches simultaneously
    act(() => {
      result.current.refetch()
      result.current.refetch()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    // Should not crash
    expect(result.current.error).toBeNull()
  })

  // 5. Empty clusters array does not fetch
  it('does not fetch when clusters array is empty', () => {
    const { result } = renderHook(() => useStackDiscovery([]))
    expect(mockExec).not.toHaveBeenCalled()
    expect(result.current.stacks).toEqual([])
  })

  // 6. Pod with unknown role goes to "both"
  it('puts pods with unrecognized roles into "both" bucket', async () => {
    setupMockExec({
      pods: [makePod('server-pod', 'llm-ns', 'custom-role')],
      namespaces: [],
    })
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const stack = result.current.stacks.find(s => s.namespace === 'llm-ns')
    expect(stack).toBeDefined()
    expect(stack!.components.both.length).toBeGreaterThan(0)
  })

  // 7. Pod with name containing "prefill" is classified as prefill
  it('classifies pods by name when role is ambiguous', async () => {
    setupMockExec({
      pods: [makePod('prefill-server-abc', 'ns1', 'unknown-role')],
      namespaces: [],
    })
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const stack = result.current.stacks.find(s => s.namespace === 'ns1')
    expect(stack).toBeDefined()
    expect(stack!.components.prefill.length).toBe(1)
  })

  // 8. Pod with name containing "decode" is classified as decode
  it('classifies pods with decode in name as decode', async () => {
    setupMockExec({
      pods: [makePod('my-decode-worker-xyz', 'ns1', 'some-role')],
      namespaces: [],
    })
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const stack = result.current.stacks.find(s => s.namespace === 'ns1')
    expect(stack!.components.decode.length).toBe(1)
  })

  // 9. Phase 2 deployment discovery for llm-d namespaces
  it('discovers stacks from deployments in llm-d namespaces (Phase 2)', async () => {
    setupMockExec({
      namespaces: ['vllm-serving'],
      deploymentsByNs: {
        'vllm-serving': [makeDeployment('vllm-model', 'vllm-serving', 2, 2)],
      },
    })
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const stack = result.current.stacks.find(s => s.namespace === 'vllm-serving')
    expect(stack).toBeDefined()
    expect(stack!.components.both.length).toBeGreaterThan(0)
  })

  // 10. Cache is loaded on mount for instant display
  it('loads cached stacks from localStorage on mount', () => {
    const cached = {
      stacks: [makeStack({ id: 'cached@cluster-1', name: 'cached' })],
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    expect(result.current.stacks).toHaveLength(1)
    expect(result.current.stacks[0].name).toBe('cached')
  })

  // 11. Corrupted cache is ignored
  it('ignores corrupted localStorage cache', () => {
    localStorage.setItem(CACHE_KEY, '{{not valid json')
    const { result } = renderHook(() => useStackDiscovery(['cluster-1']))
    expect(result.current.stacks).toEqual([])
  })

  // 12. stackToServerMetrics converts components correctly
  it('converts all component types to server metrics', () => {
    const stack = makeStack({
      components: {
        prefill: [makeComponent({ type: 'prefill', model: 'llama3' })],
        decode: [makeComponent({ type: 'decode', model: 'llama3' })],
        both: [makeComponent({ type: 'both' })],
        epp: makeComponent({ type: 'epp', status: 'running' }),
        gateway: makeComponent({ type: 'gateway', status: 'running' }),
      },
      model: 'llama3',
    })
    const servers = stackToServerMetrics(stack)
    expect(servers.length).toBe(5)
    expect(servers.filter(s => s.componentType === 'model').length).toBe(3)
    expect(servers.filter(s => s.componentType === 'epp').length).toBe(1)
    expect(servers.filter(s => s.componentType === 'gateway').length).toBe(1)
  })

  // 13. stackToServerMetrics uses stack model when component model is missing
  it('falls back to stack model when component model is undefined', () => {
    const stack = makeStack({ model: 'granite' })
    const servers = stackToServerMetrics(stack)
    expect(servers.length).toBeGreaterThan(0)
    expect(servers[0].model).toBe('granite')
  })

  // 14. stackToServerMetrics uses "unknown" when no model anywhere
  it('uses "unknown" when neither component nor stack has model', () => {
    const stack = makeStack({
      model: undefined,
      components: {
        prefill: [makeComponent({ type: 'prefill', model: undefined })],
        decode: [],
        both: [],
        epp: null,
        gateway: null,
      },
    })
    const servers = stackToServerMetrics(stack)
    expect(servers[0].model).toBe('unknown')
  })

  // 15. Gateway without address shows pending status in metrics
  it('gateway shows error status when component status is not running', () => {
    const stack = makeStack({
      components: {
        prefill: [],
        decode: [],
        both: [],
        epp: null,
        gateway: makeComponent({ type: 'gateway', status: 'pending' }),
      },
    })
    const servers = stackToServerMetrics(stack)
    const gw = servers.find(s => s.componentType === 'gateway')
    expect(gw?.status).toBe('error')
    expect(gw?.readyReplicas).toBe(0)
  })
})
