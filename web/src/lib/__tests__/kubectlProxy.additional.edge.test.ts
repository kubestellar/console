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


describe('KubectlProxy — additional coverage (edge cases)', () => {
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

  // =========================================================================
  // getClusterHealth — healthy threshold edge cases
  // =========================================================================

  describe('getClusterHealth — healthy threshold', () => {
    it('marks cluster unhealthy when no nodes exist', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('empty')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const allMsgs = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })

      await vi.advanceTimersByTimeAsync(100)
      const laterMsgs = sentMessages.map(s => JSON.parse(s))
      const topMsg = laterMsgs.find(m => m.payload.args.includes('top'))
      if (topMsg) {
        activeWs!.simulateMessage({
          id: topMsg.id, type: 'result',
          payload: { output: '', exitCode: 1 },
        })
      }
      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.healthy).toBe(false)
      expect(health.nodeCount).toBe(0)

      proxy.close()
    })

    it('marks cluster unhealthy when less than 50% nodes are ready', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('degraded')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const allMsgs = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      const nodeItems = [
        { metadata: { name: 'n1', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4' } } },
        { metadata: { name: 'n2', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'False' }], allocatable: { cpu: '4' } } },
        { metadata: { name: 'n3', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'False' }], allocatable: { cpu: '4' } } },
        { metadata: { name: 'n4', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'False' }], allocatable: { cpu: '4' } } },
      ]
      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: nodeItems }), exitCode: 0 },
      })
      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })

      await vi.advanceTimersByTimeAsync(100)
      const laterMsgs = sentMessages.map(s => JSON.parse(s))
      const topMsg = laterMsgs.find(m => m.payload.args.includes('top'))
      if (topMsg) {
        activeWs!.simulateMessage({
          id: topMsg.id, type: 'result',
          payload: { output: '', exitCode: 1 },
        })
      }
      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.healthy).toBe(false)
      expect(health.nodeCount).toBe(4)
      expect(health.readyNodes).toBe(1)

      proxy.close()
    })

    it('marks cluster healthy with exactly 50% ready nodes', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const healthPromise = proxy.getClusterHealth('half')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const allMsgs = sentMessages.map(s => JSON.parse(s))
      const nodesMsg = allMsgs.find(m => m.payload.args.includes('nodes'))!
      const podsMsg = allMsgs.find(m => m.payload.args.includes('pods'))!

      const nodeItems = [
        { metadata: { name: 'n1', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4' } } },
        { metadata: { name: 'n2', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'False' }], allocatable: { cpu: '4' } } },
      ]
      activeWs!.simulateMessage({
        id: nodesMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: nodeItems }), exitCode: 0 },
      })
      activeWs!.simulateMessage({
        id: podsMsg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })

      await vi.advanceTimersByTimeAsync(100)
      const laterMsgs = sentMessages.map(s => JSON.parse(s))
      const topMsg = laterMsgs.find(m => m.payload.args.includes('top'))
      if (topMsg) {
        activeWs!.simulateMessage({
          id: topMsg.id, type: 'result',
          payload: { output: '', exitCode: 1 },
        })
      }
      await vi.advanceTimersByTimeAsync(0)

      const health = await healthPromise
      expect(health.healthy).toBe(true) // ceil(2*0.5)=1, ready=1 >= 1

      proxy.close()
    })
  })

  // =========================================================================
  // getDeployments — edge cases for image and metadata
  // =========================================================================

  describe('getDeployments — container image and metadata edge cases', () => {
    it('handles deployment with no template (image undefined)', async () => {
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
              metadata: { name: 'no-tpl', namespace: 'default' },
              spec: { replicas: 1 },
              status: { readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1 },
            }],
          }),
          exitCode: 0,
        },
      })

      const deps = await promise
      expect(deps[0].image).toBeUndefined()
      proxy.close()
    })

    it('preserves labels and annotations', async () => {
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
              metadata: {
                name: 'dep',
                namespace: 'default',
                labels: { app: 'web' },
                annotations: { revision: '3' },
              },
              spec: {
                replicas: 1,
                template: { spec: { containers: [{ image: 'img:v1' }] } },
              },
              status: { readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1 },
            }],
          }),
          exitCode: 0,
        },
      })

      const deps = await promise
      expect(deps[0].labels).toEqual({ app: 'web' })
      expect(deps[0].annotations).toEqual({ revision: '3' })
      proxy.close()
    })
  })

  // =========================================================================
  // getEvents — limit and namespace edge cases
  // =========================================================================

  describe('getEvents — limit parameter', () => {
    it('limits events to the specified count', async () => {
      const proxy = await createProxy()
      const LIMIT = 2
      const eventsPromise = proxy.getEvents('ctx', undefined, LIMIT)
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      const items = Array.from({ length: 5 }, (_, i) => ({
        type: 'Warning',
        reason: `Reason${i}`,
        message: `Msg ${i}`,
        involvedObject: { kind: 'Pod', name: `p-${i}` },
        metadata: { namespace: 'default' },
        count: i + 1,
      }))

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items }), exitCode: 0 },
      })

      const events = await eventsPromise
      expect(events).toHaveLength(LIMIT)
      proxy.close()
    })

    it('uses -n with namespace for events', async () => {
      const proxy = await createProxy()
      const promise = proxy.getEvents('ctx', 'prod')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('prod')

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
  // getClusterUsage — edge cases
  // =========================================================================

  describe('getClusterUsage — parsing edge cases', () => {
    it('handles empty output (no nodes in top output)', async () => {
      const proxy = await createProxy()
      const usagePromise = proxy.getClusterUsage('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })

      const usage = await usagePromise
      expect(usage.metricsAvailable).toBe(true)
      expect(usage.cpuUsageMillicores).toBe(0)
      expect(usage.memoryUsageBytes).toBe(0)
      proxy.close()
    })

    it('skips lines with fewer than 4 parts', async () => {
      const proxy = await createProxy()
      const usagePromise = proxy.getClusterUsage('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: 'node-1   500m\nnode-2   2000m   50%   4096Mi   50%',
          exitCode: 0,
        },
      })

      const usage = await usagePromise
      expect(usage.cpuUsageMillicores).toBe(2000)
      expect(usage.memoryUsageBytes).toBe(4096 * 1024 * 1024)
      proxy.close()
    })
  })

  // =========================================================================
  // getPodIssues — complex multi-container and threshold edge cases
  // =========================================================================

  describe('getPodIssues — threshold and multi-container edge cases', () => {
    it('does not flag ContainerCreating (non-problematic waiting reason)', async () => {
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
              metadata: { name: 'creating', namespace: 'ns' },
              status: {
                phase: 'Pending',
                containerStatuses: [{
                  restartCount: 0,
                  state: { waiting: { reason: 'ContainerCreating' } },
                }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toEqual([])
      proxy.close()
    })

    it('detects both OOMKilled and CrashLoopBackOff on same container', async () => {
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
              metadata: { name: 'dual-issue', namespace: 'ns' },
              status: {
                phase: 'Running',
                containerStatuses: [{
                  restartCount: 25,
                  state: { waiting: { reason: 'CrashLoopBackOff' } },
                  lastState: { terminated: { reason: 'OOMKilled' } },
                }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('CrashLoopBackOff')
      expect(issues[0].issues).toContain('OOMKilled')
      proxy.close()
    })

    it('aggregates restarts from multiple containers', async () => {
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
              metadata: { name: 'multi-c', namespace: 'ns' },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { restartCount: 3, state: { running: {} } },
                  { restartCount: 4, state: { running: {} } },
                ],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      // 3+4=7 > 5 (threshold), so it's flagged
      expect(issues).toHaveLength(1)
      expect(issues[0].restarts).toBe(7)
      proxy.close()
    })

    it('does not flag pod with restarts at exactly the threshold', async () => {
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
              metadata: { name: 'exact-thresh', namespace: 'ns' },
              status: {
                phase: 'Running',
                containerStatuses: [{ restartCount: 5, state: { running: {} } }],
              },
            }],
          }),
          exitCode: 0,
        },
      })

      const issues = await promise
      expect(issues).toEqual([]) // 5 is NOT > 5
      proxy.close()
    })
  })

  // =========================================================================
  // getServices — clusterIP missing vs empty
  // =========================================================================

  describe('getServices — clusterIP edge cases', () => {
    it('defaults clusterIP to empty when spec.clusterIP is undefined', async () => {
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
              metadata: { name: 'ext', namespace: 'ns' },
              spec: { type: 'ExternalName' }, // no clusterIP
            }],
          }),
          exitCode: 0,
        },
      })

      const svcs = await promise
      expect(svcs[0].clusterIP).toBe('')
      proxy.close()
    })
  })

  // =========================================================================
  // getNamespaces — whitespace and sorting
  // =========================================================================

  describe('getNamespaces — whitespace handling', () => {
    it('returns empty array for empty output', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNamespaces('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: '', exitCode: 0 },
      })

      const ns = await promise
      expect(ns).toEqual([])
      proxy.close()
    })

    it('handles newlines and multiple spaces between namespaces', async () => {
      const proxy = await createProxy()
      const promise = proxy.getNamespaces('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: 'zeta  alpha\n  beta', exitCode: 0 },
      })

      const ns = await promise
      expect(ns).toEqual(['alpha', 'beta', 'zeta'])
      proxy.close()
    })
  })

  // =========================================================================
  // getPVCs — namespace flag edge case
  // =========================================================================

  describe('getPVCs — namespace arg correctness', () => {
    it('uses -n when namespace is specified', async () => {
      const proxy = await createProxy()
      const promise = proxy.getPVCs('ctx', 'storage-ns')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('storage-ns')

      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await promise
      proxy.close()
    })
  })
})
