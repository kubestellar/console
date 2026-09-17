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
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- moved verbatim from baselined kubectlProxy.core.connection.test.ts; mock captures instance for test assertions
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


describe('KubectlProxy - connection/exec (part 3: queueing & lifecycle)', () => {

  // =========================================================================
  // Per-request timeout
  // =========================================================================

  describe('request timeout', () => {
    it('rejects with timeout error when server does not respond in time', async () => {
      const proxy = await createProxy()
      const CUSTOM_TIMEOUT_MS = 3000

      const execPromise = proxy.exec(['get', 'pods'], { timeout: CUSTOM_TIMEOUT_MS })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handler before advancing past timeout
      const rejection = expect(execPromise).rejects.toThrow(
        `Kubectl command timed out after ${CUSTOM_TIMEOUT_MS}ms`
      )

      // Don't respond — advance past the timeout
      await vi.advanceTimersByTimeAsync(CUSTOM_TIMEOUT_MS)

      await rejection

      proxy.close()
    })

    it('uses KUBECTL_DEFAULT_TIMEOUT_MS when no timeout is specified', async () => {
      const proxy = await createProxy()
      const DEFAULT_TIMEOUT_MS = 10_000

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Attach rejection handler before advancing timers
      const rejection = expect(execPromise).rejects.toThrow(
        `Kubectl command timed out after ${DEFAULT_TIMEOUT_MS}ms`
      )

      // Advance just under the default timeout — should still be pending
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1)

      // Now push past it
      await vi.advanceTimersByTimeAsync(2)

      await rejection

      proxy.close()
    })
  })

  // =========================================================================
  // Priority execution (bypasses queue)
  // =========================================================================

  describe('priority requests', () => {
    it('executes immediately bypassing the queue', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Should have sent immediately
      expect(sentMessages.length).toBe(1)
      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toEqual(['get', 'pods'])

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'done', exitCode: 0 },
      })
      const result = await execPromise
      expect(result.output).toBe('done')

      proxy.close()
    })
  })

  // =========================================================================
  // Queue concurrency limiting
  // =========================================================================

  describe('request queue and concurrency', () => {
    it('limits concurrent requests to MAX_CONCURRENT_KUBECTL_REQUESTS', async () => {
      const proxy = await createProxy()
      const MAX_CONCURRENT = 4 // matches mock constant
      const TOTAL_REQUESTS = 7

      // Connect first
      const connectExec = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const connectMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: connectMsg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await connectExec
      sentMessages = []

      // Fire off TOTAL_REQUESTS queued requests
      const promises: Promise<{ output: string; exitCode: number }>[] = []
      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        promises.push(proxy.exec(['get', `resource-${i}`]))
      }

      // Let the queue process
      await vi.advanceTimersByTimeAsync(0)

      // Only MAX_CONCURRENT should have been sent
      expect(sentMessages.length).toBe(MAX_CONCURRENT)

      // Verify queue stats
      const stats = proxy.getQueueStats()
      expect(stats.active).toBe(MAX_CONCURRENT)
      expect(stats.queued).toBe(TOTAL_REQUESTS - MAX_CONCURRENT)
      expect(stats.maxConcurrent).toBe(MAX_CONCURRENT)

      // Respond to the first batch
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const msg = JSON.parse(sentMessages[i])
        activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: `result-${i}`, exitCode: 0 },
        })
      }

      // Let queue drain
      await vi.advanceTimersByTimeAsync(0)

      // Remaining requests should now be sent
      const _remaining = TOTAL_REQUESTS - MAX_CONCURRENT
      expect(sentMessages.length).toBe(TOTAL_REQUESTS)

      // Respond to the rest
      for (let i = MAX_CONCURRENT; i < TOTAL_REQUESTS; i++) {
        const msg = JSON.parse(sentMessages[i])
        activeWs!.simulateMessage({
          id: msg.id,
          type: 'result',
          payload: { output: `result-${i}`, exitCode: 0 },
        })
      }

      // All promises should resolve
      const results = await Promise.all(promises)
      expect(results.length).toBe(TOTAL_REQUESTS)
      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        expect(results[i].output).toBe(`result-${i}`)
      }

      proxy.close()
    })

    it('getQueueStats returns correct initial state', async () => {
      const proxy = await createProxy()
      const stats = proxy.getQueueStats()
      expect(stats).toEqual({
        queued: 0,
        active: 0,
        maxConcurrent: 4,
      })
      proxy.close()
    })
  })

  // =========================================================================
  // close()
  // =========================================================================

  describe('close()', () => {
    it('rejects all queued requests with "Connection closed"', async () => {
      const proxy = await createProxy()
      const MAX_CONCURRENT = 4

      // Connect first
      const connectExec = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const connectMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: connectMsg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await connectExec

      // Queue more requests than the concurrency limit
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < MAX_CONCURRENT + 3; i++) {
        promises.push(
          proxy.exec(['get', `resource-${i}`]).catch((err: Error) => err.message)
        )
      }
      await vi.advanceTimersByTimeAsync(0)

      // Close the proxy — should reject queued ones and close the WS
      proxy.close()
      await vi.advanceTimersByTimeAsync(0)

      const results = await Promise.all(promises)
      // The 3 queued (not yet active) ones should have been rejected with "Connection closed"
      const closedErrors = results.filter(r => r === 'Connection closed')
      expect(closedErrors.length).toBeGreaterThanOrEqual(3)
    })
  })

  // =========================================================================
  // Higher-level methods
  // =========================================================================

})
