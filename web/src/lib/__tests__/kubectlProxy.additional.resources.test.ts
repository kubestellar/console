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


describe('KubectlProxy — additional coverage (resource error branches)', () => {
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
      expect(issues[0].issues).toContain('Unschedulable')
      expect(issues[0].status).toBe('Unschedulable')
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

})
