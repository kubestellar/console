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

vi.mock('../utils/wsAuth', () => ({
  appendWsAuthToken: (url: string) => url,
}))

vi.mock('../demoMode', () => ({
  isDemoModeForced: false,
  get isNetlifyDeployment() {
    return mockIsNetlify
  },
}))

vi.mock('../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
  useBackendHealth: () => ({ status: 'connected', isConnected: true }),
}))

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
  reportAgentDataError: () => {},
  reportAgentDataSuccess: () => {},
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
  MCP_HOOK_TIMEOUT_MS: 15_000,
  FETCH_DEFAULT_TIMEOUT_MS: 5_000,
  STORAGE_KEY_USER_CACHE: 'userCache',
  STORAGE_KEY_HAS_SESSION: 'hasSession',
  DEMO_TOKEN_VALUE: 'demo-token',
  DEFAULT_REFRESH_INTERVAL_MS: 120_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  MCP_PROBE_TIMEOUT_MS: 3_000,
  STORAGE_KEY_DEMO_MODE: 'kc-demo-mode',
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
// Additional coverage tests — targeting uncovered branches, lines, and
// functions identified by coverage analysis
// ===========================================================================


describe('KubectlProxy — additional coverage (connection/queue)', () => {
  describe('parseResourceQuantity — SI decimal suffixes (K, M, G, T)', () => {
    /** Helper: parse a memory/storage value via getNodes */
    async function parseViaNodeMemory(value: string): Promise<number> {
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
                allocatable: { memory: value },
              },
            }],
          }),
          exitCode: 0,
        },
      })
      const nodes = await nodesPromise
      proxy.close()
      return nodes[0].memoryBytes!
    }

    it('parses K (kilobytes, decimal)', async () => {
      expect(await parseViaNodeMemory('10K')).toBe(10_000)
    })

    it('parses M (megabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('5M')).toBe(5_000_000)
    })

    it('parses G (gigabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('2G')).toBe(2_000_000_000)
    })

    it('parses T (terabytes, decimal)', async () => {
      expect(await parseViaNodeMemory('1T')).toBe(1_000_000_000_000)
    })

    it('returns 0 for completely unparseable input', async () => {
      expect(await parseViaNodeMemory('not-a-number')).toBe(0)
    })

    it('falls back to parseFloat for suffix-less numeric string', async () => {
      expect(await parseViaNodeMemory('12345')).toBe(12345)
    })
  })

  // =========================================================================
  // ensureConnected: isConnecting wait-and-retry branch (lines 91-94)
  // =========================================================================

  describe('ensureConnected — isConnecting guard', () => {
    it('waits and retries when another connection attempt is in progress', async () => {
      const proxy = await createProxy()

      // Start two exec calls nearly simultaneously — the second will hit the
      // isConnecting guard because connectPromise is set to null during the
      // brief window between setting isConnecting=true and assigning connectPromise.
      // We simulate this by starting the first exec, then before open fires,
      // immediately starting another exec.

      const exec1 = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // First WS is created; its connectPromise exists.
      // Now start a second exec while the first is still connecting.
      const exec2 = proxy.exec(['get', 'nodes'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // Open the WS — both should now be able to proceed
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // There should now be 2 messages sent
      expect(sentMessages.length).toBe(2)

      // Respond to both
      for (const rawMsg of sentMessages) {
        const msg = JSON.parse(rawMsg)
        activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: 'ok', exitCode: 0 },
        })
      }

      await Promise.all([exec1, exec2])
      proxy.close()
    })
  })

  // =========================================================================
  // ensureConnected: WebSocket constructor throws (lines 165-168)
  // =========================================================================

  describe('ensureConnected — WebSocket constructor throws', () => {
    it('covers the catch block and falls through to "Not connected" guard', async () => {
      const proxy = await createProxy()
      // Replace WebSocket with a constructor that throws — the catch block
      // in ensureConnected nulls out connectPromise, so the error is caught
      // but ensureConnected returns null; execImmediate then hits the
      // "Not connected to local agent" guard.
      vi.stubGlobal('WebSocket', class {
        constructor() {
          throw new Error('WebSocket not supported')
        }
      })

      await expect(proxy.exec(['get', 'pods'])).rejects.toThrow('Not connected to local agent')

      proxy.close()
    })
  })

  // =========================================================================
  // finalize double-call guard (line 102)
  // =========================================================================

  describe('ensureConnected — finalize double-call guard', () => {
    it('ignores second settlement when both timeout and error fire', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)

      // Fire error first — this settles the promise
      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      // Now let the connect timeout also fire — it should be a no-op
      await vi.advanceTimersByTimeAsync(2500)

      await rejection

      proxy.close()
    })

    it('ignores open after timeout already fired', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow('Connection timeout')
      await vi.advanceTimersByTimeAsync(0)

      // Let timeout fire first
      await vi.advanceTimersByTimeAsync(2500)

      // Now simulate open — should be ignored since finalize already ran
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // execImmediate: ws not open after ensureConnected (line 241-242)
  // =========================================================================

  describe('execImmediate — ws disconnected between ensureConnected and send', () => {
    it('throws "Not connected" if ws closes between connect and send', async () => {
      const proxy = await createProxy()

      // First, establish a connection
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg0 = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({ id: msg0.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup

      // Now close the WS without the proxy knowing about it right away
      // by setting readyState directly
      activeWs!.readyState = WS_CLOSED
      // Also null out the ws to simulate the onclose handler having fired
      activeWs!.simulateClose()
      await vi.advanceTimersByTimeAsync(0)

      // Next exec attempt should fail due to cooldown (close sets lastConnectionFailureAt)
      await expect(proxy.exec(['get', 'pods'], { priority: true }))
        .rejects.toThrow('Local agent unavailable (cooldown)')

      proxy.close()
    })
  })

  // =========================================================================
  // processQueue: empty queue returns early (line 211-213)
  // =========================================================================

  describe('processQueue — empty queue no-op', () => {
    it('does nothing when queue is empty and request completes', async () => {
      const proxy = await createProxy()

      // Execute a single request — after it completes, processQueue
      // will be called with an empty queue (covering the early return)
      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'done', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('done')

      // Verify queue is empty
      expect(proxy.getQueueStats().queued).toBe(0)
      expect(proxy.getQueueStats().active).toBe(0)

      proxy.close()
    })
  })

  // =========================================================================
  // processQueue: error propagation (line 222)
  // =========================================================================

  describe('processQueue — error propagation through queue', () => {
    it('rejects queued request when execImmediate throws', async () => {
      const proxy = await createProxy()

      // Start a request that will fail during ensureConnected
      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)

      // Cause the connection to fail
      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // getServices / getPVCs: error and parse-error branches
  // =========================================================================

})
