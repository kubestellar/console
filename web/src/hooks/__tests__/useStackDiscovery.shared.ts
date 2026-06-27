import { vi, beforeEach } from 'vitest'
// ── Mocks ────────────────────────────────────────────────────────────────────

export const mockGetDemoMode = vi.fn(() => false)
export const mockExec = vi.fn()

vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

// ── Constants mirrored from source ───────────────────────────────────────────

export const CACHE_KEY = 'kubestellar-stack-cache'
export const REFRESH_INTERVAL_MS = 120000

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a kubectl JSON response wrapping items */
export function k8sResponse(items: unknown[], exitCode = 0) {
  return { output: JSON.stringify({ items }), exitCode }
}

/** Build an error/connection-refused kubectl response */
export function errorResponse(msg = 'connection refused', exitCode = 1) {
  return { output: msg, exitCode }
}

/** Empty successful response (no items) */
export const EMPTY_RESPONSE = k8sResponse([])

/** Namespace-list response (jsonpath format) */
export function nsResponse(namespaces: string[]) {
  return { output: namespaces.join(' '), exitCode: 0 }
}

/** Build a minimal pod resource with llm-d labels */
export function makePod(
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
export function makeDeployment(
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
export function makePool(name: string, namespace: string) {
  return {
    metadata: { name, namespace },
    spec: { selector: { matchLabels: {} } },
  }
}

/** Build a minimal HPA resource */
export function makeHPA(name: string, namespace: string, min = 1, max = 3) {
  return {
    metadata: { name, namespace },
    spec: { minReplicas: min, maxReplicas: max },
    status: { currentReplicas: min, desiredReplicas: min },
  }
}

/** Build a minimal WVA resource */
export function makeWVA(name: string, namespace: string, min = 1, max = 5) {
  return {
    metadata: { name, namespace },
    spec: { minReplicas: min, maxReplicas: max },
    status: { currentReplicas: min, desiredReplicas: min },
  }
}

/** Build a minimal service resource with EPP naming */
export function makeEPPService(name: string, namespace: string) {
  return {
    metadata: { name, namespace },
    spec: { ports: [{ port: 9002 }] },
  }
}

/** Build a minimal Gateway resource */
export function makeGateway(name: string, namespace: string, hasAddress = true) {
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
export function setupMockExec(options: {
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
export async function flush() {
  // Allow enough time for chained async operations:
  // useEffect -> refetch -> Phase 1 (Promise.all) -> Phase 2 (namespace query -> deployment batches)
  await new Promise(resolve => setTimeout(resolve, 200))
}

export function registerUseStackDiscoveryTestHooks() {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetDemoMode.mockReturnValue(false)
    mockExec.mockResolvedValue(EMPTY_RESPONSE)
  })
}
