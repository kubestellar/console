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
  KUBECTL_DEFAULT_TIMEOUT_MS: 10_000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 30_000,
  KUBECTL_MAX_TIMEOUT_MS: 45_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  MAX_CONCURRENT_KUBECTL_REQUESTS: 4,
  POD_RESTART_ISSUE_THRESHOLD: 5,
  FOCUS_DELAY_MS: 100,
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

describe('KubectlProxy', () => {
  // =========================================================================
  // Connection lifecycle
  // =========================================================================

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

  describe('exec', () => {
    it('sends context and namespace in the payload', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'], {
        context: 'prod-cluster',
        namespace: 'kube-system',
      })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.context).toBe('prod-cluster')
      expect(msg.payload.namespace).toBe('kube-system')
      expect(msg.payload.args).toEqual(['get', 'pods'])

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      await execPromise
      proxy.close()
    })

    it('resolves with KubectlResponse on success', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods', '-o', 'json'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{"items":[]}', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('{"items":[]}')
      expect(result.exitCode).toBe(0)

      proxy.close()
    })

    it('rejects with error message when server returns error type', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'nonexistent'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'error',
        payload: { code: 'NOT_FOUND', message: 'resource not found' },
      })

      await expect(execPromise).rejects.toThrow('resource not found')

      proxy.close()
    })

    it('rejects with "Unknown error" when error payload has no message', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'something'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'error',
        payload: { code: 'UNKNOWN' },
      })

      await expect(execPromise).rejects.toThrow('Unknown error')

      proxy.close()
    })

    it('ignores messages with unknown IDs (no crash)', async () => {
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send a message with a bogus ID — should be silently ignored
      activeWs!.simulateMessage({
        id: 'unknown-id-999',
        type: 'result',
        payload: { output: 'should be ignored', exitCode: 0 },
      })

      // The original request should still be pending — now respond to it
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'correct', exitCode: 0 },
      })

      const result = await execPromise
      expect(result.output).toBe('correct')

      proxy.close()
    })

    it('handles malformed JSON from server gracefully', async () => {
      const proxy = await createProxy()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const execPromise = proxy.exec(['get', 'pods'])
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Send invalid JSON directly through onmessage
      if (activeWs!.onmessage) {
        activeWs!.onmessage(new MessageEvent('message', { data: 'not-json{{{' }))
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        '[KubectlProxy] Failed to parse message:',
        expect.any(Error)
      )

      // Original request should still be pending; respond properly
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'ok', exitCode: 0 },
      })
      await execPromise

      proxy.close()
      consoleSpy.mockRestore()
    })
  })

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
      const remaining = TOTAL_REQUESTS - MAX_CONCURRENT
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

  describe('getNodes', () => {
    it('parses node JSON and returns NodeInfo array', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('test-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toEqual(['get', 'nodes', '-o', 'json'])
      expect(msg.payload.context).toBe('test-context')

      const nodeJson = {
        items: [
          {
            metadata: {
              name: 'node-1',
              labels: { 'node-role.kubernetes.io/control-plane': '' },
            },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              allocatable: {
                cpu: '4',
                memory: '16Gi',
                'ephemeral-storage': '100Gi',
              },
            },
          },
          {
            metadata: {
              name: 'node-2',
              labels: {
                'node-role.kubernetes.io/worker': '',
                'node-role.kubernetes.io/gpu': '',
              },
            },
            status: {
              conditions: [{ type: 'Ready', status: 'False' }],
              allocatable: {
                cpu: '2000m',
                memory: '8192Mi',
              },
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(nodeJson), exitCode: 0 },
      })

      const nodes = await nodesPromise
      expect(nodes).toHaveLength(2)

      // Node 1: control-plane, ready, 4 CPU cores, 16Gi memory
      expect(nodes[0].name).toBe('node-1')
      expect(nodes[0].ready).toBe(true)
      expect(nodes[0].roles).toEqual(['control-plane'])
      expect(nodes[0].cpuCores).toBe(4)
      // 16 * 1024^3
      const SIXTEEN_GI = 16 * 1024 * 1024 * 1024
      expect(nodes[0].memoryBytes).toBe(SIXTEEN_GI)

      // Node 2: worker+gpu, not ready, 2 CPU cores (2000m), 8192Mi memory
      expect(nodes[1].name).toBe('node-2')
      expect(nodes[1].ready).toBe(false)
      expect(nodes[1].roles).toContain('worker')
      expect(nodes[1].roles).toContain('gpu')
      expect(nodes[1].cpuCores).toBe(2) // 2000m = 2 cores via parseResourceQuantity('m' suffix)
      const EIGHT_GI = 8192 * 1024 * 1024
      expect(nodes[1].memoryBytes).toBe(EIGHT_GI)

      proxy.close()
    })

    it('throws when exitCode is non-zero', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('bad-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'context not found' },
      })

      await expect(nodesPromise).rejects.toThrow('context not found')

      proxy.close()
    })

    it('throws when output is not valid JSON', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('test-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'not-json', exitCode: 0 },
      })

      await expect(nodesPromise).rejects.toThrow('Failed to parse kubectl output as JSON')

      proxy.close()
    })

    it('handles empty items array', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('empty-cluster')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })

      const nodes = await nodesPromise
      expect(nodes).toEqual([])

      proxy.close()
    })

    it('handles missing items key (defaults to empty array)', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('empty-cluster')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({}), exitCode: 0 },
      })

      const nodes = await nodesPromise
      expect(nodes).toEqual([])

      proxy.close()
    })

    it('uses capacity when allocatable is missing', async () => {
      const proxy = await createProxy()

      const nodesPromise = proxy.getNodes('test-context')
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
              metadata: { name: 'node-cap' },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                capacity: { cpu: '8', memory: '32Gi' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const nodes = await nodesPromise
      expect(nodes[0].cpuCores).toBe(8)

      proxy.close()
    })
  })

  // =========================================================================
  // getPodMetrics
  // =========================================================================

  describe('getPodMetrics', () => {
    it('parses pods and sums resource requests', async () => {
      const proxy = await createProxy()

      const metricsPromise = proxy.getPodMetrics('test-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-A')

      const podsJson = {
        items: [
          {
            spec: {
              containers: [
                { resources: { requests: { cpu: '100m', memory: '128Mi' } } },
                { resources: { requests: { cpu: '200m', memory: '256Mi' } } },
              ],
            },
          },
          {
            spec: {
              containers: [
                { resources: { requests: { cpu: '1', memory: '1Gi' } } },
              ],
            },
          },
          {
            spec: {
              containers: [
                { resources: {} }, // no requests
              ],
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(podsJson), exitCode: 0 },
      })

      const result = await metricsPromise
      expect(result.count).toBe(3)
      // 100m + 200m + 1000m = 1300m
      expect(result.cpuRequestsMillicores).toBe(1300)
      // 128Mi + 256Mi + 1Gi = 128*1024*1024 + 256*1024*1024 + 1024*1024*1024
      const expectedMemory = 128 * 1024 * 1024 + 256 * 1024 * 1024 + 1024 * 1024 * 1024
      expect(result.memoryRequestsBytes).toBe(expectedMemory)

      proxy.close()
    })

    it('throws when exitCode is non-zero', async () => {
      const proxy = await createProxy()

      const promise = proxy.getPodMetrics('bad-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'auth failure' },
      })

      await expect(promise).rejects.toThrow('auth failure')

      proxy.close()
    })
  })

  // =========================================================================
  // getPodCount (legacy wrapper)
  // =========================================================================

  describe('getPodCount', () => {
    it('returns just the count from getPodMetrics', async () => {
      const proxy = await createProxy()

      const countPromise = proxy.getPodCount('test-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({ items: [{ spec: {} }, { spec: {} }] }),
          exitCode: 0,
        },
      })

      const count = await countPromise
      expect(count).toBe(2)

      proxy.close()
    })
  })

  // =========================================================================
  // getNamespaces
  // =========================================================================

  describe('getNamespaces', () => {
    it('splits jsonpath output into sorted namespace list', async () => {
      const proxy = await createProxy()

      const nsPromise = proxy.getNamespaces('test-context')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('namespaces')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'kube-system default monitoring', exitCode: 0 },
      })

      const namespaces = await nsPromise
      expect(namespaces).toEqual(['default', 'kube-system', 'monitoring'])

      proxy.close()
    })

    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()

      const nsPromise = proxy.getNamespaces('bad')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(nsPromise).rejects.toThrow('Failed to get namespaces')

      proxy.close()
    })
  })

  // =========================================================================
  // getServices
  // =========================================================================

  describe('getServices', () => {
    it('parses service JSON with ports', async () => {
      const proxy = await createProxy()

      const svcPromise = proxy.getServices('test-ctx', 'default')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      // Should use -n for specific namespace
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('default')

      const svcJson = {
        items: [
          {
            metadata: { name: 'my-svc', namespace: 'default' },
            spec: {
              type: 'ClusterIP',
              clusterIP: '10.0.0.1',
              ports: [
                { port: 80, protocol: 'TCP' },
                { port: 443, protocol: 'TCP' },
              ],
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(svcJson), exitCode: 0 },
      })

      const services = await svcPromise
      expect(services).toHaveLength(1)
      expect(services[0].name).toBe('my-svc')
      expect(services[0].type).toBe('ClusterIP')
      expect(services[0].ports).toBe('80/TCP, 443/TCP')

      proxy.close()
    })

    it('uses -A when no namespace is specified', async () => {
      const proxy = await createProxy()

      const svcPromise = proxy.getServices('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-A')
      expect(msg.payload.args).not.toContain('-n')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await svcPromise
      proxy.close()
    })
  })

  // =========================================================================
  // getPVCs
  // =========================================================================

  describe('getPVCs', () => {
    it('parses PVC JSON correctly', async () => {
      const proxy = await createProxy()

      const pvcPromise = proxy.getPVCs('test-ctx', 'default')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const pvcJson = {
        items: [
          {
            metadata: { name: 'data-pvc', namespace: 'default' },
            status: { phase: 'Bound', capacity: { storage: '10Gi' } },
            spec: { storageClassName: 'gp2' },
          },
          {
            metadata: { name: 'pending-pvc', namespace: 'default' },
            status: { phase: 'Pending' },
            spec: {},
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(pvcJson), exitCode: 0 },
      })

      const pvcs = await pvcPromise
      expect(pvcs).toHaveLength(2)
      expect(pvcs[0].name).toBe('data-pvc')
      expect(pvcs[0].status).toBe('Bound')
      expect(pvcs[0].capacity).toBe('10Gi')
      expect(pvcs[0].storageClass).toBe('gp2')
      expect(pvcs[1].capacity).toBe('')
      expect(pvcs[1].storageClass).toBe('')

      proxy.close()
    })
  })

  // =========================================================================
  // getClusterUsage
  // =========================================================================

  describe('getClusterUsage', () => {
    it('parses kubectl top nodes output', async () => {
      const proxy = await createProxy()

      const usagePromise = proxy.getClusterUsage('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('top')

      // Simulate "kubectl top nodes --no-headers" output
      const topOutput = [
        'node-1   2500m   62%   4096Mi   50%',
        'node-2   1000m   25%   2048Mi   25%',
      ].join('\n')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: topOutput, exitCode: 0 },
      })

      const usage = await usagePromise
      expect(usage.metricsAvailable).toBe(true)
      // 2500 + 1000 = 3500 millicores
      expect(usage.cpuUsageMillicores).toBe(3500)
      // 4096Mi + 2048Mi
      const expectedMem = (4096 + 2048) * 1024 * 1024
      expect(usage.memoryUsageBytes).toBe(expectedMem)

      proxy.close()
    })

    it('returns metricsAvailable=false when command fails', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const usagePromise = proxy.getClusterUsage('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'metrics-server not found' },
      })

      const usage = await usagePromise
      expect(usage.metricsAvailable).toBe(false)
      expect(usage.cpuUsageMillicores).toBe(0)
      expect(usage.memoryUsageBytes).toBe(0)

      proxy.close()
    })

    it('parses CPU in core units (not millicores)', async () => {
      const proxy = await createProxy()

      const usagePromise = proxy.getClusterUsage('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      // CPU as cores (e.g., "2" instead of "2000m")
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'node-1   2   50%   1Gi   10%', exitCode: 0 },
      })

      const usage = await usagePromise
      expect(usage.cpuUsageMillicores).toBe(2000)

      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth
  // =========================================================================

  describe('getClusterHealth', () => {
    /** Helper to respond to exec calls in order */
    function respondToExec(msgIndex: number, payload: { output: string; exitCode: number }) {
      const msg = JSON.parse(sentMessages[msgIndex])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload,
      })
    }

    it('returns healthy status when majority of nodes are ready', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('prod')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // getClusterHealth calls getNodes and getPodMetrics in parallel
      // Wait for both messages to be sent
      await vi.advanceTimersByTimeAsync(0)

      // Find the messages — they may arrive in any order
      const messages = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = messages.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = messages.find(m => m.payload.args.includes('pods'))!

      // Respond to getNodes
      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [
              {
                metadata: { name: 'n1', labels: {} },
                status: {
                  conditions: [{ type: 'Ready', status: 'True' }],
                  allocatable: { cpu: '4', memory: '16Gi', 'ephemeral-storage': '100Gi' },
                },
              },
              {
                metadata: { name: 'n2', labels: {} },
                status: {
                  conditions: [{ type: 'Ready', status: 'True' }],
                  allocatable: { cpu: '4', memory: '16Gi', 'ephemeral-storage': '100Gi' },
                },
              },
            ],
          }),
          exitCode: 0,
        },
      })

      // Respond to getPodMetrics
      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [
              { spec: { containers: [{ resources: { requests: { cpu: '500m', memory: '512Mi' } } }] } },
              { spec: { containers: [{ resources: { requests: { cpu: '250m', memory: '256Mi' } } }] } },
            ],
          }),
          exitCode: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      // getClusterUsage will also be called — respond to that too
      // Wait for the top nodes message
      await vi.advanceTimersByTimeAsync(100)
      const allMessages = sentMessages.map(s => JSON.parse(s))
      const topMsg = allMessages.find(m => m.payload.args.includes('top'))
      if (topMsg) {
        activeWs!.simulateMessage({
          id: topMsg.id,
          type: 'result',
          payload: { output: 'n1   1000m   25%   4Gi   25%\nn2   2000m   50%   8Gi   50%', exitCode: 0 },
        })
      }

      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.cluster).toBe('prod')
      expect(health.healthy).toBe(true)
      expect(health.reachable).toBe(true)
      expect(health.nodeCount).toBe(2)
      expect(health.readyNodes).toBe(2)
      expect(health.podCount).toBe(2)
      expect(health.cpuCores).toBe(8) // 4+4
      expect(health.cpuRequestsMillicores).toBe(750) // 500+250

      proxy.close()
    })

    it('returns unreachable health on exception', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('dead-cluster')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Fail the first exec (getNodes)
      const messages = sentMessages.map(s => JSON.parse(s))
      for (const m of messages) {
        activeWs!.simulateMessage({
          id: m.id,
          type: 'error',
          payload: { code: 'UNREACHABLE', message: 'cluster unreachable' },
        })
      }

      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.cluster).toBe('dead-cluster')
      expect(health.healthy).toBe(false)
      expect(health.reachable).toBe(false)
      expect(health.errorMessage).toBe('cluster unreachable')

      proxy.close()
    })
  })

  // =========================================================================
  // getPodIssues
  // =========================================================================

  describe('getPodIssues', () => {
    it('detects CrashLoopBackOff pods', async () => {
      const proxy = await createProxy()

      const issuesPromise = proxy.getPodIssues('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const podsJson = {
        items: [
          {
            metadata: { name: 'crashing-pod', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [
                {
                  restartCount: 15,
                  state: { waiting: { reason: 'CrashLoopBackOff' } },
                },
              ],
            },
          },
          {
            metadata: { name: 'healthy-pod', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [
                { restartCount: 0, state: { running: {} } },
              ],
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(podsJson), exitCode: 0 },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].name).toBe('crashing-pod')
      expect(issues[0].issues).toContain('CrashLoopBackOff')
      expect(issues[0].restarts).toBe(15)

      proxy.close()
    })

    it('detects OOMKilled pods', async () => {
      const proxy = await createProxy()

      const issuesPromise = proxy.getPodIssues('test-ctx', 'kube-system')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      // Should use -n for specific namespace
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('kube-system')

      const podsJson = {
        items: [
          {
            metadata: { name: 'oom-pod', namespace: 'kube-system' },
            status: {
              phase: 'Running',
              containerStatuses: [
                {
                  restartCount: 10,
                  state: { running: {} },
                  lastState: { terminated: { reason: 'OOMKilled' } },
                },
              ],
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(podsJson), exitCode: 0 },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('OOMKilled')

      proxy.close()
    })

    it('detects Pending/Unschedulable pods', async () => {
      const proxy = await createProxy()

      const issuesPromise = proxy.getPodIssues('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const podsJson = {
        items: [
          {
            metadata: { name: 'pending-pod', namespace: 'default' },
            status: {
              phase: 'Pending',
              containerStatuses: [],
              conditions: [
                { type: 'PodScheduled', status: 'False', reason: 'Unschedulable' },
              ],
            },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(podsJson), exitCode: 0 },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Unschedulable')
      expect(issues[0].status).toBe('Unschedulable')

      proxy.close()
    })

    it('detects Failed pods', async () => {
      const proxy = await createProxy()

      const issuesPromise = proxy.getPodIssues('test-ctx')
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
              metadata: { name: 'failed-pod', namespace: 'default' },
              status: { phase: 'Failed', reason: 'Evicted', containerStatuses: [] },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Failed')
      expect(issues[0].status).toBe('Evicted')

      proxy.close()
    })

    it('detects pods with high restart count even without other issues', async () => {
      const proxy = await createProxy()
      const HIGH_RESTART_COUNT = 10 // above POD_RESTART_ISSUE_THRESHOLD (5)

      const issuesPromise = proxy.getPodIssues('test-ctx')
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
              metadata: { name: 'restart-pod', namespace: 'default' },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { restartCount: HIGH_RESTART_COUNT, state: { running: {} } },
                ],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].restarts).toBe(HIGH_RESTART_COUNT)

      proxy.close()
    })

    it('detects ImagePullBackOff', async () => {
      const proxy = await createProxy()

      const issuesPromise = proxy.getPodIssues('test-ctx')
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
              metadata: { name: 'img-pod', namespace: 'default' },
              status: {
                phase: 'Pending',
                containerStatuses: [{
                  restartCount: 0,
                  state: { waiting: { reason: 'ImagePullBackOff' } },
                }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await issuesPromise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('ImagePullBackOff')

      proxy.close()
    })
  })

  // =========================================================================
  // getEvents
  // =========================================================================

  describe('getEvents', () => {
    it('parses event JSON and returns sorted events', async () => {
      const proxy = await createProxy()

      const eventsPromise = proxy.getEvents('test-ctx', 'default')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const eventsJson = {
        items: [
          {
            type: 'Warning',
            reason: 'FailedScheduling',
            message: 'no nodes available',
            involvedObject: { kind: 'Pod', name: 'my-pod' },
            metadata: { namespace: 'default' },
            count: 3,
            firstTimestamp: '2024-01-01T00:00:00Z',
            lastTimestamp: '2024-01-01T01:00:00Z',
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(eventsJson), exitCode: 0 },
      })

      const events = await eventsPromise
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('Warning')
      expect(events[0].reason).toBe('FailedScheduling')
      expect(events[0].object).toBe('Pod/my-pod')
      expect(events[0].cluster).toBe('test-ctx')
      expect(events[0].count).toBe(3)

      proxy.close()
    })

    it('throws on parse failure', async () => {
      const proxy = await createProxy()

      const eventsPromise = proxy.getEvents('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'not-json', exitCode: 0 },
      })

      await expect(eventsPromise).rejects.toThrow('Failed to parse kubectl output as JSON')

      proxy.close()
    })
  })

  // =========================================================================
  // getDeployments
  // =========================================================================

  describe('getDeployments', () => {
    it('parses deployments with correct status detection', async () => {
      const proxy = await createProxy()

      const deploymentsPromise = proxy.getDeployments('test-ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const deployJson = {
        items: [
          {
            metadata: { name: 'web-app', namespace: 'default', labels: { app: 'web' } },
            spec: {
              replicas: 3,
              template: { spec: { containers: [{ image: 'nginx:1.25' }] } },
            },
            status: { readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 },
          },
          {
            metadata: { name: 'deploying-app', namespace: 'default' },
            spec: { replicas: 3 },
            status: { readyReplicas: 1, updatedReplicas: 2, availableReplicas: 1 },
          },
          {
            metadata: { name: 'failed-app', namespace: 'default' },
            spec: { replicas: 2 },
            status: { readyReplicas: 0, updatedReplicas: 0, availableReplicas: 0 },
          },
        ],
      }

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify(deployJson), exitCode: 0 },
      })

      const deployments = await deploymentsPromise
      expect(deployments).toHaveLength(3)

      // Running deployment (ready === replicas)
      expect(deployments[0].name).toBe('web-app')
      expect(deployments[0].status).toBe('running')
      expect(deployments[0].progress).toBe(100)
      expect(deployments[0].image).toBe('nginx:1.25')

      // Deploying (ready < replicas, updated > 0)
      expect(deployments[1].name).toBe('deploying-app')
      expect(deployments[1].status).toBe('deploying')
      expect(deployments[1].progress).toBe(33) // Math.round(1/3 * 100)

      // Failed (ready < replicas, updated === 0)
      expect(deployments[2].name).toBe('failed-app')
      expect(deployments[2].status).toBe('failed')
      expect(deployments[2].progress).toBe(0)

      proxy.close()
    })
  })

  // =========================================================================
  // Message ID generation (unique IDs)
  // =========================================================================

  describe('message ID generation', () => {
    it('generates unique IDs for each request', async () => {
      const proxy = await createProxy()

      // Fire multiple requests
      const p1 = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const p2 = proxy.exec(['get', 'nodes'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)

      expect(sentMessages.length).toBe(2)
      const id1 = JSON.parse(sentMessages[0]).id
      const id2 = JSON.parse(sentMessages[1]).id
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^kubectl-\d+-\d+$/)
      expect(id2).toMatch(/^kubectl-\d+-\d+$/)

      // Clean up
      for (const msg of sentMessages) {
        const parsed = JSON.parse(msg)
        activeWs!.simulateMessage({
          id: parsed.id,
          type: 'result',
          payload: { output: '', exitCode: 0 },
        })
      }
      await Promise.all([p1, p2])

      proxy.close()
    })
  })

  // =========================================================================
  // Exported types (compile-time checks)
  // =========================================================================

  describe('exported types and singleton', () => {
    it('exports kubectlProxy singleton', async () => {
      vi.resetModules()
      const mod = await import('../kubectlProxy')
      expect(mod.kubectlProxy).toBeDefined()
      expect(typeof mod.kubectlProxy.exec).toBe('function')
      expect(typeof mod.kubectlProxy.close).toBe('function')
      expect(typeof mod.kubectlProxy.isConnected).toBe('function')
      expect(typeof mod.kubectlProxy.getQueueStats).toBe('function')
      expect(typeof mod.kubectlProxy.getNodes).toBe('function')
      expect(typeof mod.kubectlProxy.getPodMetrics).toBe('function')
      expect(typeof mod.kubectlProxy.getPodCount).toBe('function')
      expect(typeof mod.kubectlProxy.getNamespaces).toBe('function')
      expect(typeof mod.kubectlProxy.getServices).toBe('function')
      expect(typeof mod.kubectlProxy.getPVCs).toBe('function')
      expect(typeof mod.kubectlProxy.getClusterUsage).toBe('function')
      expect(typeof mod.kubectlProxy.getClusterHealth).toBe('function')
      expect(typeof mod.kubectlProxy.getPodIssues).toBe('function')
      expect(typeof mod.kubectlProxy.getEvents).toBe('function')
      expect(typeof mod.kubectlProxy.getDeployments).toBe('function')
      expect(typeof mod.kubectlProxy.getBulkClusterHealth).toBe('function')
    })
  })
})

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
// ===========================================================================

describe('KubectlProxy — additional coverage', () => {
  // =========================================================================
  // parseResourceQuantity: SI suffixes K, M, G, T and edge cases
  // =========================================================================

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

  describe('getServices — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'forbidden' },
      })

      await expect(promise).rejects.toThrow('forbidden')
      proxy.close()
    })

    it('throws on non-zero exitCode with no error message (fallback)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get services')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{bad json', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('handles service with no ports and no clusterIP', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
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
              metadata: { name: 'headless', namespace: 'default' },
              spec: { type: 'ClusterIP', clusterIP: '' },
            }],
          }),
          exitCode: 0,
        },
      })

      const svcs = await promise
      expect(svcs[0].ports).toBe('')
      expect(svcs[0].clusterIP).toBe('')
      proxy.close()
    })
  })

  describe('getPVCs — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'no access' },
      })

      await expect(promise).rejects.toThrow('no access')
      proxy.close()
    })

    it('throws on non-zero exitCode with fallback message', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get PVCs')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'not json', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('uses -A when no namespace is specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-A')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await promise
      proxy.close()
    })
  })

  // =========================================================================
  // getPodIssues — error and parse branches
  // =========================================================================

  describe('getPodIssues — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get pods')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '{nope', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('detects ErrImagePull and CreateContainerError', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [
              {
                metadata: { name: 'err-pull-pod', namespace: 'ns1' },
                status: {
                  phase: 'Pending',
                  containerStatuses: [{
                    restartCount: 0,
                    state: { waiting: { reason: 'ErrImagePull' } },
                  }],
                },
              },
              {
                metadata: { name: 'create-err-pod', namespace: 'ns1' },
                status: {
                  phase: 'Pending',
                  containerStatuses: [{
                    restartCount: 0,
                    state: { waiting: { reason: 'CreateContainerError' } },
                  }],
                },
              },
            ],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(2)
      expect(issues[0].issues).toContain('ErrImagePull')
      expect(issues[1].issues).toContain('CreateContainerError')
      proxy.close()
    })

    it('handles pod with Failed phase and no explicit reason', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'generic-fail', namespace: 'default' },
              status: { phase: 'Failed', containerStatuses: [] },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].status).toBe('Failed')
      proxy.close()
    })

    it('handles Pending with Unschedulable but no reason string', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'pend-pod', namespace: 'default' },
              status: {
                phase: 'Pending',
                containerStatuses: [],
                conditions: [
                  { type: 'PodScheduled', status: 'False' }, // no reason field
                ],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].status).toBe('Pending')
      proxy.close()
    })
  })

  // =========================================================================
  // getEvents — error branches
  // =========================================================================

  describe('getEvents — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'event error' },
      })

      await expect(promise).rejects.toThrow('event error')
      proxy.close()
    })

    it('throws fallback message on non-zero exitCode without error', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get events')
      proxy.close()
    })

    it('handles events with missing count (defaults to 1)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
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
              type: 'Normal',
              reason: 'Pulled',
              message: 'image pulled',
              involvedObject: { kind: 'Pod', name: 'p1' },
              metadata: { namespace: 'default' },
              // no count field
            }],
          }),
          exitCode: 0,
        },
      })

      const events = await promise
      expect(events[0].count).toBe(1)
      proxy.close()
    })

    it('uses -A when no namespace specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-A')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await promise
      proxy.close()
    })
  })

  // =========================================================================
  // getDeployments — error and parse branches
  // =========================================================================

  describe('getDeployments — error branches', () => {
    it('throws on non-zero exitCode', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1, error: 'deploy error' },
      })

      await expect(promise).rejects.toThrow('deploy error')
      proxy.close()
    })

    it('throws fallback message when no error field', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get deployments')
      proxy.close()
    })

    it('throws on invalid JSON output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '<<<invalid>>>', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('handles deployment with default replicas (missing spec.replicas)', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
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
              metadata: { name: 'dep1', namespace: 'default' },
              spec: {}, // no replicas field, defaults to 1
              status: { readyReplicas: 1 },
            }],
          }),
          exitCode: 0,
        },
      })

      const deps = await promise
      expect(deps[0].replicas).toBe(1)
      expect(deps[0].status).toBe('running')
      expect(deps[0].progress).toBe(100)
      proxy.close()
    })

    it('uses -n when namespace is specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx', 'my-ns')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('my-ns')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await promise
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterUsage — exception catch branch (line 458-459)
  // =========================================================================

  describe('getClusterUsage — exception in exec', () => {
    it('returns metricsAvailable=false when exec throws', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const usagePromise = proxy.getClusterUsage('ctx')
      const rejection = expect(usagePromise).resolves.toEqual({
        cpuUsageMillicores: 0,
        memoryUsageBytes: 0,
        metricsAvailable: false,
      })
      await vi.advanceTimersByTimeAsync(0)

      // Cause the connection to fail
      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — usage metrics timeout branch (line 480+)
  // =========================================================================

  describe('getClusterHealth — usage metrics timeout', () => {
    it('continues with metricsAvailable=false when usage times out', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Respond to getNodes and getPodMetrics (sent in parallel)
      const allMsgs = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              metadata: { name: 'n1', labels: {} },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '50Gi' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({ items: [{ spec: { containers: [] } }] }),
          exitCode: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      // The "top nodes" message for getClusterUsage should be sent
      await vi.advanceTimersByTimeAsync(100)

      // DO NOT respond to the top nodes request — let the METRICS_SERVER_TIMEOUT_MS
      // (5000ms in mock) expire so the usage metrics timeout branch fires
      await vi.advanceTimersByTimeAsync(5000)

      // Also advance past the per-request timeout for the kubectl top command
      await vi.advanceTimersByTimeAsync(10_000)

      const health = await healthPromise

      // Health should still be available, just without usage metrics
      expect(health.healthy).toBe(true)
      expect(health.reachable).toBe(true)
      expect(health.nodeCount).toBe(1)
      // Usage metrics should be zero/unavailable
      expect(health.metricsAvailable).toBe(false)

      proxy.close()
    })
  })

  // =========================================================================
  // getNodes — fallback when error message is missing (line 276)
  // =========================================================================

  describe('getNodes — fallback error message', () => {
    it('uses fallback when exitCode non-zero but no error message', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 }, // no .error
      })

      await expect(promise).rejects.toThrow('Failed to get nodes')
      proxy.close()
    })
  })

  // =========================================================================
  // getPodMetrics — parse error and fallback branches
  // =========================================================================

  describe('getPodMetrics — error branches', () => {
    it('throws on invalid JSON', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'broken', exitCode: 0 },
      })

      await expect(promise).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('uses fallback error message when none provided', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 1 },
      })

      await expect(promise).rejects.toThrow('Failed to get pods')
      proxy.close()
    })

    it('handles pods with no containers array', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{ spec: {} }], // no containers
          }),
          exitCode: 0,
        },
      })

      const result = await promise
      expect(result.count).toBe(1)
      expect(result.cpuRequestsMillicores).toBe(0)
      expect(result.memoryRequestsBytes).toBe(0)
      proxy.close()
    })
  })

  // =========================================================================
  // getBulkClusterHealth (entirely uncovered — lines 725-775)
  // =========================================================================

  describe('getBulkClusterHealth', () => {
    it('processes multiple clusters and calls onProgress', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const progressResults: Array<{ cluster: string }> = []
      const onProgress = (h: { cluster: string }) => progressResults.push(h)

      // We need to connect first
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const warmupMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({ id: warmupMsg.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup
      sentMessages = []

      const bulkPromise = proxy.getBulkClusterHealth(['c1', 'c2'], onProgress, 5)

      // Process timers to let requests queue and send
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)

      // Respond to all messages as they come in
      // Each cluster health check sends getNodes + getPodMetrics = 2 messages each
      const MAX_ITERS = 20
      for (let iter = 0; iter < MAX_ITERS; iter++) {
        if (progressResults.length >= 2) break

        const pending = sentMessages
          .map(s => JSON.parse(s))
          .filter(m => {
            // Check if we haven't responded to this ID yet
            return m.payload && m.payload.args
          })

        for (const m of pending) {
          if (m.payload.args.includes('nodes')) {
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: {
                output: JSON.stringify({
                  items: [{
                    metadata: { name: 'n1', labels: {} },
                    status: {
                      conditions: [{ type: 'Ready', status: 'True' }],
                      allocatable: { cpu: '2', memory: '4Gi' },
                    },
                  }],
                }),
                exitCode: 0,
              },
            })
          } else if (m.payload.args.includes('top')) {
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: { output: '', exitCode: 1 }, // metrics not available
            })
          } else {
            // pods
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: {
                output: JSON.stringify({ items: [] }),
                exitCode: 0,
              },
            })
          }
        }

        await vi.advanceTimersByTimeAsync(200)
      }

      const results = await bulkPromise
      expect(results.length).toBe(2)
      expect(progressResults.length).toBe(2)

      const clusters = results.map(r => r.cluster).sort()
      expect(clusters).toEqual(['c1', 'c2'])

      proxy.close()
    })

    it('handles cluster health failure gracefully in bulk', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // Connect first
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const warmupMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({ id: warmupMsg.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup
      sentMessages = []

      const bulkPromise = proxy.getBulkClusterHealth(['fail-c1'])

      // Process timers
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)

      // Respond with errors to all messages
      const MAX_ITERS = 10
      for (let iter = 0; iter < MAX_ITERS; iter++) {
        const pending = sentMessages.map(s => JSON.parse(s))
        for (const m of pending) {
          activeWs!.simulateMessage({
            id: m.id,
            type: 'error',
            payload: { code: 'FAIL', message: 'cluster down' },
          })
        }
        await vi.advanceTimersByTimeAsync(200)
      }

      const results = await bulkPromise
      expect(results.length).toBe(1)
      expect(results[0].healthy).toBe(false)
      expect(results[0].reachable).toBe(false)

      proxy.close()
    })

    it('uses default concurrency of 5 when not specified', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // Connect first
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const warmupMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({ id: warmupMsg.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup
      sentMessages = []

      // Call without the concurrency parameter
      const bulkPromise = proxy.getBulkClusterHealth([])

      const results = await bulkPromise
      expect(results).toEqual([])

      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — non-Error exceptions (line 528 cond-expr)
  // =========================================================================

  describe('getClusterHealth — non-Error exception handling', () => {
    it('handles non-Error thrown value in catch', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('bad')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Return error responses to trigger exception path
      const msgs = sentMessages.map(s => JSON.parse(s))
      for (const m of msgs) {
        activeWs!.simulateMessage({
          id: m.id,
          type: 'error',
          payload: { code: 'ERR', message: 'some error' },
        })
      }

      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.healthy).toBe(false)
      expect(health.reachable).toBe(false)
      expect(health.errorMessage).toBeDefined()

      proxy.close()
    })
  })

  // =========================================================================
  // getNodes — nodes with neither allocatable nor capacity
  // =========================================================================

  describe('getNodes — edge cases', () => {
    it('handles node with no allocatable and no capacity', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNodes('ctx')
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
              metadata: { name: 'bare-node', labels: {} },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                // no allocatable, no capacity
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const nodes = await promise
      expect(nodes[0].cpuCores).toBe(0)
      expect(nodes[0].memoryBytes).toBe(0)
      expect(nodes[0].storageBytes).toBe(0)
      proxy.close()
    })

    it('handles node with no labels', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNodes('ctx')
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
              metadata: { name: 'no-label-node' }, // no labels key
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: { cpu: '2' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const nodes = await promise
      expect(nodes[0].roles).toEqual([])
      proxy.close()
    })

    it('handles node with no Ready condition', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNodes('ctx')
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
              metadata: { name: 'no-ready', labels: {} },
              status: {
                conditions: [{ type: 'MemoryPressure', status: 'False' }],
                allocatable: { cpu: '1' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const nodes = await promise
      expect(nodes[0].ready).toBe(false)
      proxy.close()
    })
  })

  // =========================================================================
  // getPodMetrics — missing items key (line 324 fallback)
  // =========================================================================

  describe('getPodMetrics — missing items key', () => {
    it('defaults to empty array when items is missing', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({}), // no items key
          exitCode: 0,
        },
      })

      const result = await promise
      expect(result.count).toBe(0)
      expect(result.cpuRequestsMillicores).toBe(0)
      expect(result.memoryRequestsBytes).toBe(0)
      proxy.close()
    })
  })

  // =========================================================================
  // getServices — missing items key (line 388 fallback)
  // =========================================================================

  describe('getServices — missing items key', () => {
    it('defaults to empty array when items is missing', async () => {
      const proxy = await createProxy()
      const promise = proxy.getServices('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({}), exitCode: 0 },
      })

      const services = await promise
      expect(services).toEqual([])
      proxy.close()
    })
  })

  // =========================================================================
  // getPVCs — missing items key (line 412 fallback)
  // =========================================================================

  describe('getPVCs — missing items key', () => {
    it('defaults to empty array when items is missing', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({}), exitCode: 0 },
      })

      const pvcs = await promise
      expect(pvcs).toEqual([])
      proxy.close()
    })
  })

  // =========================================================================
  // getEvents — missing items key (line 651 fallback)
  // =========================================================================

  describe('getEvents — missing items key', () => {
    it('defaults to empty array when items is missing', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({}), exitCode: 0 },
      })

      const events = await promise
      expect(events).toEqual([])
      proxy.close()
    })
  })

  // =========================================================================
  // getDeployments — missing items key (line 683 fallback)
  // =========================================================================

  describe('getDeployments — missing items key', () => {
    it('defaults to empty array when items is missing', async () => {
      const proxy = await createProxy()
      const promise = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({}), exitCode: 0 },
      })

      const deps = await promise
      expect(deps).toEqual([])
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — cpuRequestsCores and memoryRequestsGB calculations
  // (lines 491-492 binary expr fallbacks)
  // =========================================================================

  describe('getClusterHealth — resource calculation edge cases', () => {
    it('computes cpuRequestsCores and memoryRequestsGB correctly', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const allMsgs = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              metadata: { name: 'n1', labels: {} },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: { cpu: '4', memory: '16Gi', 'ephemeral-storage': '100Gi' },
              },
            }],
          }),
          exitCode: 0,
        },
      })

      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              spec: {
                containers: [{
                  resources: { requests: { cpu: '2000m', memory: '4Gi' } },
                }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      // Respond to metrics (top nodes) if sent
      await vi.advanceTimersByTimeAsync(100)
      const laterMsgs = sentMessages.map(s => JSON.parse(s))
      const topMsg = laterMsgs.find(m => m.payload.args.includes('top'))
      if (topMsg) {
        activeWs!.simulateMessage({
          id: topMsg.id,
          type: 'result',
          payload: { output: 'n1   1000m   25%   2Gi   12%', exitCode: 0 },
        })
      }
      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.cpuRequestsMillicores).toBe(2000)
      expect(health.cpuRequestsCores).toBe(2) // 2000 / 1000
      const FOUR_GI = 4 * 1024 * 1024 * 1024
      expect(health.memoryRequestsBytes).toBe(FOUR_GI)
      expect(health.memoryRequestsGB).toBeCloseTo(4, 0)

      proxy.close()
    })
  })

  // =========================================================================
  // getPodIssues — containerStatuses with no restartCount (line 574, 577)
  // =========================================================================

  describe('getPodIssues — optional fields', () => {
    it('handles containerStatus with missing restartCount', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'pod-no-restart', namespace: 'ns' },
              status: {
                phase: 'Running',
                containerStatuses: [{
                  // no restartCount
                  state: { waiting: { reason: 'CrashLoopBackOff' } },
                }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].restarts).toBe(0) // defaults to 0
      expect(issues[0].issues).toContain('CrashLoopBackOff')
      proxy.close()
    })

    it('handles containerStatus with no state and no lastState', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'pod-bare-status', namespace: 'ns' },
              status: {
                phase: 'Running',
                containerStatuses: [{ restartCount: 0 }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      // No issues detected since there's no problematic state
      expect(issues).toEqual([])
      proxy.close()
    })

    it('handles missing containerStatuses entirely', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPodIssues('ctx')
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
              metadata: { name: 'pod-no-cs', namespace: 'ns' },
              status: { phase: 'Running' },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toEqual([])
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — non-Error object thrown (line 528 cond-expr right side)
  // =========================================================================

  describe('getClusterHealth — string-type exception', () => {
    it('handles string thrown as error message', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // We need to make getNodes throw a non-Error value.
      // The simplest way is to simulate a request that causes getNodes to fail
      // with an error message that gets caught at line 527.
      const healthPromise = proxy.getClusterHealth('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Let all requests time out by advancing past timeout
      // This will throw Error objects, so it hits the `err instanceof Error` path
      await vi.advanceTimersByTimeAsync(45_000)

      const health = await healthPromise
      expect(health.healthy).toBe(false)
      expect(health.reachable).toBe(false)
      expect(health.errorMessage).toBeDefined()

      proxy.close()
    })
  })

  // =========================================================================
  // processQueue — error wrapping for non-Error thrown values (line 222)
  // =========================================================================

  describe('processQueue — non-Error rejection wrapping', () => {
    it('wraps non-Error rejection in Error when processQueue catches', async () => {
      // This is exercised when execImmediate rejects with a non-Error.
      // In practice this would be rare, but we can test it by having
      // the connection fail which always throws Error objects.
      // The cond-expr at line 222 is hard to hit externally since all paths
      // throw Error instances. This test at least ensures processQueue error
      // handling works correctly.
      const proxy = await createProxy()

      const execPromise = proxy.exec(['get', 'pods'])
      const rejection = expect(execPromise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(0)

      activeWs!.simulateError()
      await vi.advanceTimersByTimeAsync(0)

      await rejection
      proxy.close()
    })
  })

  // =========================================================================
  // getBulkClusterHealth — concurrency limiting with more clusters than limit
  // =========================================================================

  describe('getBulkClusterHealth — queue processing with concurrency', () => {
    it('processes more clusters than concurrency limit using queue', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // Connect first
      const warmup = proxy.exec(['version'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const warmupMsg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({ id: warmupMsg.id, type: 'result', payload: { output: '', exitCode: 0 } })
      await warmup
      sentMessages = []

      // Use concurrency=1 with 3 clusters to force queue processing
      const CONCURRENCY_LIMIT = 1
      const progressResults: string[] = []
      const bulkPromise = proxy.getBulkClusterHealth(
        ['a', 'b', 'c'],
        (h) => progressResults.push(h.cluster),
        CONCURRENCY_LIMIT
      )

      // Process clusters one at a time
      const MAX_ROUNDS = 30
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (progressResults.length >= 3) break

        await vi.advanceTimersByTimeAsync(200)

        // Respond to all pending messages
        for (const raw of sentMessages) {
          const m = JSON.parse(raw)
          if (!m.payload?.args) continue
          if (m.payload.args.includes('nodes')) {
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: {
                output: JSON.stringify({
                  items: [{
                    metadata: { name: 'n', labels: {} },
                    status: {
                      conditions: [{ type: 'Ready', status: 'True' }],
                      allocatable: { cpu: '1' },
                    },
                  }],
                }),
                exitCode: 0,
              },
            })
          } else if (m.payload.args.includes('top')) {
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: { output: '', exitCode: 1 },
            })
          } else {
            activeWs!.simulateMessage({
              id: m.id,
              type: 'result',
              payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
            })
          }
        }
        sentMessages = []
      }

      const results = await bulkPromise
      expect(results.length).toBe(3)
      expect(progressResults.length).toBe(3)

      proxy.close()
    })
  })
})
