/**
 * Deep regression-preventing tests for kubectlProxy.ts
 *
 * Covers the KubectlProxy class:
 * - WebSocket connection lifecycle (connect, reconnect, cooldown)
 * - exec: queued vs priority, response routing, error responses
 * - Request queue: concurrency limiting, draining
 * - Timeouts: connect timeout, per-request timeout
 * - Error handling: connection errors, parse failures, close during pending
 * - Higher-level methods: getNodes, getPodMetrics, getNamespaces, etc.
 * - Utility functions: parseResourceQuantity, parseResourceQuantityMillicores
 * - close() and isConnected() helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

// Track whether we're simulating a Netlify environment
let mockIsNetlify = false

vi.mock('../demoMode', () => ({
  get isNetlifyDeployment() {
    return mockIsNetlify
  },
}))

vi.mock('../constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
  WS_CONNECT_TIMEOUT_MS: 2500,
  WS_CONNECTION_COOLDOWN_MS: 5000,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS: 3000,
  KUBECTL_DEFAULT_TIMEOUT_MS: 10_000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 30_000,
  KUBECTL_MAX_TIMEOUT_MS: 45_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  MAX_CONCURRENT_KUBECTL_REQUESTS: 4,
  POD_RESTART_ISSUE_THRESHOLD: 5,
  FOCUS_DELAY_MS: 100,
  STORAGE_KEY_TOKEN: 'token',
}))

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

/** WebSocket readyState constants (matching the spec) */
const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

/** Tracks all messages sent through the fake WebSocket */
let sentMessages: string[] = []

/** Reference to the currently active fake WebSocket instance */
let activeWs: FakeWebSocket | null = null

class FakeWebSocket {
  static CONNECTING = WS_CONNECTING
  static OPEN = WS_OPEN
  static CLOSING = WS_CLOSING
  static CLOSED = WS_CLOSED

  // Instance constants (required by the WebSocket interface)
  readonly CONNECTING = WS_CONNECTING
  readonly OPEN = WS_OPEN
  readonly CLOSING = WS_CLOSING
  readonly CLOSED = WS_CLOSED

  readyState = WS_CONNECTING
  url: string

  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    activeWs = this
  }

  send(data: string): void {
    sentMessages.push(data)
  }

  close(): void {
    this.readyState = WS_CLOSED
    // Fire onclose asynchronously like the real WebSocket
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }

  // ----------- test helpers -----------

  /** Simulate a successful connection open */
  simulateOpen(): void {
    this.readyState = WS_OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  /** Simulate receiving a message from the server */
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }

  /** Simulate a connection error */
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }

  /** Simulate server-side close */
  simulateClose(): void {
    this.readyState = WS_CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  sentMessages = []
  activeWs = null
  mockIsNetlify = false
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: fresh KubectlProxy instance
// ---------------------------------------------------------------------------

/**
 * Import a fresh KubectlProxy instance for each test to avoid
 * shared state across tests. The module exports a singleton, so we
 * re-import the class and instantiate manually.
 */
async function createProxy() {
  // Dynamic import to get the module after mocks are set up.
  // We need the class, but it's not exported — only the singleton is.
  // We'll work with the singleton via re-import with cache-busting.
  // However, vitest module cache makes this tricky.
  // Instead, we'll import the singleton and use close() + re-creation via the module.

  // Workaround: reset module registry each time
  vi.resetModules()
  const mod = await import('../kubectlProxy')
  return mod.kubectlProxy
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ===========================================================================
// parseResourceQuantity (module-private, tested indirectly through getNodes)
// ===========================================================================

describe('parseResourceQuantity (tested through getNodes)', () => {
  /** Helper: create a proxy, connect it, send a node with the given resource value, and return the parsed result */
  async function parseViaNode(
    resourceKey: 'cpu' | 'memory' | 'ephemeral-storage',
    value: string
  ): Promise<number> {
    const proxy = await createProxy()

    const nodesPromise = proxy.getNodes('ctx')
    await vi.advanceTimersByTimeAsync(0)
    activeWs!.simulateOpen()
    await vi.advanceTimersByTimeAsync(0)

    const msg = JSON.parse(sentMessages[0])
    activeWs!.simulateMessage({
      id: msg.id,
      type: 'result',
      payload: {
        output: JSON.stringify({
          items: [{
            metadata: { name: 'n1', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              allocatable: { [resourceKey]: value },
            },
          }],
        }),
        exitCode: 0,
      },
    })

    const nodes = await nodesPromise
    proxy.close()

    if (resourceKey === 'cpu') return nodes[0].cpuCores!
    if (resourceKey === 'memory') return nodes[0].memoryBytes!
    return nodes[0].storageBytes!
  }

  it('parses Ki (kibibytes)', async () => {
    const result = await parseViaNode('memory', '1024Ki')
    expect(result).toBe(1024 * 1024)
  })

  it('parses Mi (mebibytes)', async () => {
    const result = await parseViaNode('memory', '512Mi')
    expect(result).toBe(512 * 1024 * 1024)
  })

  it('parses Gi (gibibytes)', async () => {
    const result = await parseViaNode('memory', '8Gi')
    expect(result).toBe(8 * 1024 * 1024 * 1024)
  })

  it('parses Ti (tebibytes)', async () => {
    const result = await parseViaNode('ephemeral-storage', '1Ti')
    expect(result).toBe(1024 * 1024 * 1024 * 1024)
  })

  it('parses m (millicores) for CPU', async () => {
    const result = await parseViaNode('cpu', '500m')
    expect(result).toBe(0.5)
  })

  it('parses plain number (cores) for CPU', async () => {
    const result = await parseViaNode('cpu', '4')
    expect(result).toBe(4)
  })

  it('parses decimal CPU value', async () => {
    const result = await parseViaNode('cpu', '2.5')
    expect(result).toBe(2.5)
  })

  it('returns 0 for empty/undefined value', async () => {
    const proxy = await createProxy()

    const nodesPromise = proxy.getNodes('ctx')
    await vi.advanceTimersByTimeAsync(0)
    activeWs!.simulateOpen()
    await vi.advanceTimersByTimeAsync(0)

    const msg = JSON.parse(sentMessages[0])
    activeWs!.simulateMessage({
      id: msg.id,
      type: 'result',
      payload: {
        output: JSON.stringify({
          items: [{
            metadata: { name: 'n1', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              allocatable: {}, // no cpu, memory, or storage
            },
          }],
        }),
        exitCode: 0,
      },
    })

    const nodes = await nodesPromise
    expect(nodes[0].cpuCores).toBe(0)
    expect(nodes[0].memoryBytes).toBe(0)

    proxy.close()
  })
})
// ===========================================================================
// parseResourceQuantityMillicores (tested through getPodMetrics)
// ===========================================================================

describe('parseResourceQuantityMillicores (tested through getPodMetrics)', () => {
  async function parseCpuMillicores(cpuValue: string): Promise<number> {
    const proxy = await createProxy()

    const metricsPromise = proxy.getPodMetrics('ctx')
    await vi.advanceTimersByTimeAsync(0)
    activeWs!.simulateOpen()
    await vi.advanceTimersByTimeAsync(0)

    const msg = JSON.parse(sentMessages[0])
    activeWs!.simulateMessage({
      id: msg.id,
      type: 'result',
      payload: {
        output: JSON.stringify({
          items: [{
            spec: {
              containers: [{ resources: { requests: { cpu: cpuValue } } }],
            },
          }],
        }),
        exitCode: 0,
      },
    })

    const result = await metricsPromise
    proxy.close()
    return result.cpuRequestsMillicores
  }

  it('parses millicores suffix (100m = 100)', async () => {
    expect(await parseCpuMillicores('100m')).toBe(100)
  })

  it('parses whole cores (1 = 1000m)', async () => {
    expect(await parseCpuMillicores('1')).toBe(1000)
  })

  it('parses fractional cores (0.5 = 500m)', async () => {
    expect(await parseCpuMillicores('0.5')).toBe(500)
  })

  it('parses multi-core (2.5 = 2500m)', async () => {
    expect(await parseCpuMillicores('2.5')).toBe(2500)
  })

  it('returns 0 for unparseable CPU value', async () => {
    expect(await parseCpuMillicores('abc')).toBe(0)
  })

  it('returns 0 for unparseable millicores suffix', async () => {
    expect(await parseCpuMillicores('abcm')).toBe(0)
  })
})

// ===========================================================================
// Additional coverage tests — targeting uncovered branches, lines, and
// functions identified by coverage analysis
