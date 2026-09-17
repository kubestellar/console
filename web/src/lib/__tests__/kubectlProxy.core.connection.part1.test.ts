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
  getWsAuthParams: (url: string) => Promise.resolve({ url, protocols: [] }),
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
  MAX_PENDING_KUBECTL_REQUESTS: 64,
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


describe('KubectlProxy - connection/exec', () => {
  describe('connection lifecycle', () => {
    it('connects via WebSocket and resolves exec after open', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])

      // Let the constructor + connection attempt settle
      await vi.advanceTimersByTimeAsync(0)

      // The FakeWebSocket should have been created
      expect(activeWs).not.toBeNull()

      // Simulate connection opening
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // A message should have been sent
      expect(sentMessages.length).toBe(1)
      const msg = JSON.parse(sentMessages[0])
      expect(msg.type).toBe('kubectl')
      expect(msg.payload.args).toEqual(['get', 'pods'])

      // Simulate server response
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'pod-1\npod-2', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('pod-1\npod-2')
      expect(result.exitCode).toBe(0)

      proxy.close()
    })

    it('reuses existing open connection without creating a new WebSocket', async () => {
      const proxy = await createProxy()
      let wsCreationCount = 0
      const OrigFakeWS = FakeWebSocket
      vi.stubGlobal('WebSocket', class extends OrigFakeWS {
        constructor(url: string) {
          super(url)
          wsCreationCount++
        }
      })

      // First exec - triggers connection
      const exec1 = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg1 = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg1.id,
        type: 'result',
        payload: { output: 'ok', exitCode: 0 },
      })
      await exec1

      // Second exec - should NOT create a new WebSocket
      const exec2 = proxy.exec(['get', 'nodes'])
      await vi.advanceTimersByTimeAsync(0)

      expect(wsCreationCount).toBe(1)

      const msg2 = JSON.parse(sentMessages[1])
      activeWs!.simulateMessage({
        id: msg2.id,
        type: 'result',
        payload: { output: 'node-1', exitCode: 0 },
      })
      await exec2

      proxy.close()
    })

    it('isConnected() returns true only when WebSocket is OPEN', async () => {
      const proxy = await createProxy()
      expect(proxy.isConnected()).toBe(false)

      // Start exec to trigger connection
      const execPromise = proxy.exec(['version'])
      await vi.advanceTimersByTimeAsync(0)

      // Still connecting
      expect(proxy.isConnected()).toBe(false)

      // Now open
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      expect(proxy.isConnected()).toBe(true)

      // Respond and close
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await execPromise

      proxy.close()
      expect(proxy.isConnected()).toBe(false)
    })
  })

  // =========================================================================
  // Netlify guard
  // =========================================================================

  describe('Netlify deployment guard', () => {
    it('throws immediately when isNetlifyDeployment is true', async () => {
      mockIsNetlify = true
      const proxy = await createProxy()

      await expect(proxy.exec(['get', 'pods'])).rejects.toThrow(
        'Agent unavailable on Netlify deployment'
      )
    })
  })

  // =========================================================================
  // Connection timeout
  // =========================================================================

  describe('connection timeout', () => {
    it('rejects with timeout error after WS_CONNECT_TIMEOUT_MS', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const rejection = expect(execPromise).rejects.toThrow('Connection timeout after 2500ms')
      await vi.advanceTimersByTimeAsync(0)

      // Do NOT open the connection — let it time out
      expect(activeWs).not.toBeNull()

      // Advance past the connect timeout (2500ms)
      await vi.advanceTimersByTimeAsync(2500)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // Connection cooldown
  // =========================================================================

  describe('connection cooldown', () => {
    it('fails fast during cooldown window after a connection failure', async () => {
      const proxy = await createProxy()

      // Trigger a failed connection
      const exec1 = proxy.exec(['get', 'pods'])
      // Attach handler before triggering error to avoid unhandled rejection
      const rejection1 = expect(exec1).rejects.toThrow('Failed to connect to local agent')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)
      await rejection1

      // Immediately try again — should fail with cooldown error
      const exec2 = proxy.exec(['get', 'nodes'])
      const rejection2 = expect(exec2).rejects.toThrow('Local agent unavailable (cooldown)')
      await vi.advanceTimersByTimeAsync(0)
      await rejection2

      proxy.close()
    })

    it('allows reconnection after cooldown window expires', async () => {
      const proxy = await createProxy()

      // Trigger a failed connection
      const exec1 = proxy.exec(['get', 'pods'])
      const rejection1 = expect(exec1).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)
      await rejection1

      // Advance past cooldown (5000ms)
      await vi.advanceTimersByTimeAsync(5000)

      // Now a new connection attempt should be allowed
      const exec2 = proxy.exec(['get', 'nodes'])
      await vi.advanceTimersByTimeAsync(0)

      // A new WebSocket should be created
      expect(activeWs).not.toBeNull()
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'node-1', exitCode: 0 },
      })

      const result = await exec2
      expect(result.output).toBe('node-1')

      proxy.close()
    })
  })

  // =========================================================================
  // Connection error handling
  // =========================================================================

  describe('connection error handling', () => {
    it('rejects exec when WebSocket emits an error before opening', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow('Failed to connect to local agent')
      await vi.advanceTimersByTimeAsync(0)

      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection

      proxy.close()
    })

    it('rejects all pending requests when connection closes unexpectedly', async () => {
      const proxy = await createProxy()

      // Connect successfully
      const exec1 = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send another request (don't respond to it)
      const exec2 = proxy.exec(['get', 'nodes'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handlers BEFORE triggering close
      const rejection1 = expect(exec1).rejects.toThrow('Connection closed')
      const rejection2 = expect(exec2).rejects.toThrow('Connection closed')

      // Now simulate unexpected close
      activeWs!.simulateClose()
      await vi.advanceTimersByTimeAsync(0)

      await rejection1
      await rejection2

      proxy.close()
    })
  })

  // =========================================================================
  // Request execution
  // =========================================================================

})
