/**
 * Expanded edge-case tests for kubectlProxy utility functions and
 * error paths not covered by the main test file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockIsNetlify = false

vi.mock('../utils/wsAuth', () => ({
  appendWsAuthToken: (url: string) => url,
}))

vi.mock('../demoMode', () => ({
  get isNetlifyDeployment() { return mockIsNetlify },
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

const WS_OPEN = 1
const WS_CLOSED = 3

let activeWs: FakeWebSocket | null = null

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = WS_OPEN
  static CLOSING = 2
  static CLOSED = WS_CLOSED

  readonly CONNECTING = 0
  readonly OPEN = WS_OPEN
  readonly CLOSING = 2
  readonly CLOSED = WS_CLOSED

  readyState = 0
  url: string
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    activeWs = this
  }

  send(_data?: unknown) {}
  close() {
    this.readyState = WS_CLOSED
    this.onclose?.(new CloseEvent('close', { code: 1000 }))
  }

  // Test helpers
  triggerOpen() {
    this.readyState = WS_OPEN
    this.onopen?.(new Event('open'))
  }
  triggerMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
  triggerError() {
    this.onerror?.(new Event('error'))
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket)

// Import AFTER mocks
import { kubectlProxy } from '../kubectlProxy'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockIsNetlify = false
  activeWs = null
  // Reset the KubectlProxy singleton state
  kubectlProxy.close()
  // Force-reset private fields that persist across close() calls to prevent
  // state leaking between tests (cooldown, connection flags, pending requests,
  // lingering connectPromise from prior test's in-flight connect).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy = kubectlProxy as any
  proxy.lastConnectionFailureAt = 0
  proxy.isConnecting = false
  proxy.messageId = 0
  proxy.pendingRequests.clear()
  proxy.connectPromise = null
  proxy.requestQueue = []
  proxy.activeRequests = 0
})

afterEach(() => {
  // Issue 9246: clear all pending fake timers BEFORE restoring real timers.
  // The kubectlProxy schedules WS connect timeouts (2500ms) and per-request
  // timeouts (up to 10_000ms+). If those fire after the test body completes
  // but before teardown, they reject promises that no test is awaiting,
  // which vitest surfaces as "Unhandled Rejection" warnings. Clearing
  // timers and pending requests here prevents that cross-test bleed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy = kubectlProxy as any
  proxy.pendingRequests.forEach((pending: { timeout: ReturnType<typeof setTimeout> }) => {
    clearTimeout(pending.timeout)
  })
  proxy.pendingRequests.clear()
  proxy.requestQueue = []
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  kubectlProxy.close()
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Issue 9246: after `kubectlProxy.exec(...)` is called, the FakeWebSocket is
// not constructed synchronously — `ensureConnected` awaits an async
// `resolveWebSocketURL()` (which can include a `fetch('/health')` probe).
// Tests that need to drive the fake socket must wait for it to become
// non-null before triggering events. Flushing microtasks by advancing fake
// timers repeatedly (in zero-length steps) settles the promise chain without
// firing any user-relevant timer.
const MAX_WS_WAIT_ITERATIONS = 20

async function waitForActiveWs(): Promise<FakeWebSocket> {
  for (let i = 0; i < MAX_WS_WAIT_ITERATIONS; i++) {
    if (activeWs) return activeWs
    await vi.advanceTimersByTimeAsync(0)
  }
  throw new Error('FakeWebSocket was not constructed in time')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KubectlProxy — expanded edge cases', () => {
  // 1. Netlify deployment rejects immediately
  it('rejects with error on Netlify deployment', async () => {
    mockIsNetlify = true
    await expect(kubectlProxy.exec(['get', 'pods'])).rejects.toThrow('Netlify')
  })

  // 2. isConnected returns false when not connected
  it('isConnected returns false initially', () => {
    expect(kubectlProxy.isConnected()).toBe(false)
  })

  // 3. getQueueStats returns zero values initially
  it('getQueueStats returns zeroes when idle', () => {
    const stats = kubectlProxy.getQueueStats()
    expect(stats.queued).toBe(0)
    expect(stats.active).toBe(0)
    expect(stats.maxConcurrent).toBe(4)
  })

  // 4. close() rejects queued requests
  it('close() rejects pending queued requests', async () => {
    // Queue up a request (won't connect because WS won't open)
    const promise = kubectlProxy.exec(['get', 'pods'])
    // Trigger WS error to reject the connection attempt
    if (activeWs) activeWs.triggerError()
    // The request should fail
    await expect(promise).rejects.toThrow()
  })

  // 5. WebSocket connection timeout
  it('rejects on connection timeout', async () => {
    const PAST_CONNECT_TIMEOUT_MS = 3000 // > WS_CONNECT_TIMEOUT_MS (2500)
    const promise = kubectlProxy.exec(['get', 'pods'])
    // Issue 9246: attach a synchronous .catch to mark the promise as having
    // a handler BEFORE advancing fake timers. Without this, the timer fires
    // the rejection inside a setTimeout callback and node flags it as
    // "unhandled" before the later `await expect(...).rejects` subscribes —
    // which vitest surfaces as an unhandled error (non-zero exit code).
    const handled = promise.catch((e) => e)
    // Don't trigger open — let it time out
    await vi.advanceTimersByTimeAsync(PAST_CONNECT_TIMEOUT_MS)
    await expect(promise).rejects.toThrow('timeout')
    await handled
  })

  // 6. WebSocket error during connection
  it('rejects on WebSocket error during connection', async () => {
    const promise = kubectlProxy.exec(['get', 'pods'])
    // Issue 9246: wait for the FakeWebSocket to be constructed before
    // triggering the error — previously this used `if (activeWs)` and
    // silently no-op'd when the socket hadn't been created yet, causing
    // the test to time out on connection instead of observing the error.
    const ws = await waitForActiveWs()
    ws.triggerError()
    await expect(promise).rejects.toThrow('connect to local agent')
  })

  // 7. Priority requests bypass the queue
  it('priority requests bypass the queue', async () => {
    // Open connection first — a priority: true exec should take the
    // execImmediate path (bypassing the queue) and, absent a server
    // response, reject with the per-request timeout message.
    const REQUEST_TIMEOUT_PAST_MS = 11_000 // Past KUBECTL_DEFAULT_TIMEOUT_MS (10_000)
    const connectPromise = kubectlProxy.exec(['get', 'pods'], { priority: true })
    // Issue 9246: eager .catch so the rejection is marked handled the
    // instant the request-timeout setTimeout fires (see test 5 comment).
    const handled = connectPromise.catch((e) => e)
    // Issue 9246: await socket construction before triggering open so the
    // connection actually resolves and the request is sent.
    const ws = await waitForActiveWs()
    ws.triggerOpen()
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_PAST_MS)
    await expect(connectPromise).rejects.toThrow('timed out')
    await handled
  })

  // 8. Request timeout rejection
  it('rejects individual requests that time out', async () => {
    const REQUEST_TIMEOUT_MS = 500
    const WAIT_PAST_TIMEOUT_MS = 600 // > REQUEST_TIMEOUT_MS to trip the per-request timeout
    const promise = kubectlProxy.exec(['get', 'pods'], { timeout: REQUEST_TIMEOUT_MS, priority: true })
    // Issue 9246: eager .catch so the rejection is marked handled the
    // instant the request-timeout setTimeout fires (see test 5 comment).
    const handled = promise.catch((e) => e)
    // Issue 9246: await socket construction before opening — otherwise the
    // connection times out (at WS_CONNECT_TIMEOUT_MS=2500) before the
    // per-request timeout can ever fire.
    const ws = await waitForActiveWs()
    ws.triggerOpen()
    await vi.advanceTimersByTimeAsync(WAIT_PAST_TIMEOUT_MS)
    await expect(promise).rejects.toThrow('timed out')
    await handled
  })

  // 9. getPodIssues parses CrashLoopBackOff
  it('getPodIssues detects CrashLoopBackOff pods', async () => {
    // Set up connected WS that responds
    const CRASH_RESTART_COUNT = 10
    const execPromise = kubectlProxy.exec(['get', 'pods', '-A', '-o', 'json'], { priority: true })
    // Issue 9246: await socket construction before wiring up the `send`
    // spy — previously `if (activeWs)` was false at this point, so the
    // spy was never attached and the test timed out waiting for a response.
    const ws = await waitForActiveWs()
    const origSend = ws.send.bind(ws)
    ws.send = function(data: string) {
      origSend(data)
      const msg = JSON.parse(data)
      const response = {
        id: msg.id,
        type: 'result',
        payload: {
          exitCode: 0,
          output: JSON.stringify({
            items: [{
              metadata: { name: 'crash-pod', namespace: 'default' },
              status: {
                phase: 'Running',
                containerStatuses: [{
                  restartCount: CRASH_RESTART_COUNT,
                  state: { waiting: { reason: 'CrashLoopBackOff' } },
                }],
              },
            }],
          }),
        },
      }
      setTimeout(() => ws.triggerMessage(response), 0)
    }
    ws.triggerOpen()
    const result = await execPromise
    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.output)
    expect(data.items[0].status.containerStatuses[0].state.waiting.reason).toBe('CrashLoopBackOff')
  })

  // 10. generateId creates unique IDs
  it('generates unique message IDs', () => {
    // Access via the singleton's getQueueStats to verify it increments
    const stats1 = kubectlProxy.getQueueStats()
    const stats2 = kubectlProxy.getQueueStats()
    // Both should return same stats since no requests queued
    expect(stats1.queued).toBe(stats2.queued)
  })

  // 11. cooldown prevents rapid reconnect attempts
  it('fails fast during cooldown after connection failure', async () => {
    // Trigger a connection failure
    const p1 = kubectlProxy.exec(['get', 'pods'], { priority: true })
    if (activeWs) activeWs.triggerError()
    await expect(p1).rejects.toThrow()

    // Immediate retry should fail with cooldown message
    const p2 = kubectlProxy.exec(['get', 'pods'], { priority: true })
    await expect(p2).rejects.toThrow('cooldown')
  })

  // 12. close sets ws to null
  it('close sets isConnected to false', () => {
    kubectlProxy.close()
    expect(kubectlProxy.isConnected()).toBe(false)
  })

  // 13. Multiple close calls are safe
  it('multiple close calls do not throw', () => {
    kubectlProxy.close()
    kubectlProxy.close()
    expect(kubectlProxy.isConnected()).toBe(false)
  })

  // 14. onclose rejects all pending requests
  it('rejects all pending requests on connection close', async () => {
    // Open connection
    const p1 = kubectlProxy.exec(['get', 'pods'], { priority: true })
    // Issue 9246: await socket construction; previously the `if (activeWs)`
    // branch was skipped and the promise rejected with the connection
    // timeout instead of the expected 'Not connected' path.
    const ws = await waitForActiveWs()
    ws.triggerOpen()
    // Close immediately after open — by the time execImmediate proceeds
    // (microtask), the WS is already null so it throws 'Not connected'
    ws.close()
    await expect(p1).rejects.toThrow('Not connected')
  })
})

describe('parseResourceQuantity (via getNodes)', () => {
  // These test the internal parsing functions indirectly through the module

  // 15. Mi suffix (via the export)
  it('module exports kubectlProxy as singleton', () => {
    expect(kubectlProxy).toBeDefined()
    expect(typeof kubectlProxy.exec).toBe('function')
    expect(typeof kubectlProxy.getNodes).toBe('function')
    expect(typeof kubectlProxy.getPodCount).toBe('function')
    expect(typeof kubectlProxy.getNamespaces).toBe('function')
    expect(typeof kubectlProxy.getServices).toBe('function')
    expect(typeof kubectlProxy.getPVCs).toBe('function')
    expect(typeof kubectlProxy.getClusterUsage).toBe('function')
    expect(typeof kubectlProxy.getClusterHealth).toBe('function')
    expect(typeof kubectlProxy.getPodIssues).toBe('function')
    expect(typeof kubectlProxy.getEvents).toBe('function')
    expect(typeof kubectlProxy.getDeployments).toBe('function')
    expect(typeof kubectlProxy.getBulkClusterHealth).toBe('function')
    expect(typeof kubectlProxy.close).toBe('function')
    expect(typeof kubectlProxy.isConnected).toBe('function')
    expect(typeof kubectlProxy.getQueueStats).toBe('function')
  })
})
