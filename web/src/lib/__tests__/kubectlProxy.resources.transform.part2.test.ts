/**
 * Unit tests for KubectlProxy resource transformation logic.
 *
 * The existing tests cover error branches; these tests verify the
 * happy-path data transformations in:
 * - getNodes: label→role parsing, ready detection, resource quantities
 * - getServices: LB status, external IP aggregation, port formatting
 * - getPVCs: field mapping from raw k8s data
 * - getDeployments: status derivation (running/deploying/failed), progress calc
 * - getEvents: slice/reverse ordering, field mapping
 * - getPodIssues: restart threshold, problem detection, normalization
 * - getClusterUsage: `kubectl top nodes` output parsing
 * - getClusterHealth: health threshold, aggregated metrics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../utils/wsAuth', () => ({
  getWsAuthParams: (url: string) => Promise.resolve({ url, protocols: [] }),
}))

vi.mock('../demoMode', () => ({
  isDemoModeForced: false,
  isNetlifyDeployment: false,
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
  FOCUS_DELAY_MS: 10,
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

vi.mock('../backendHealthEvents', () => ({
  reportBackendAvailable: vi.fn(),
  reportBackendUnavailable: vi.fn(),
}))

// Stub WebSocket so module loads
const WS_OPEN = 1
class FakeWebSocket {
  readyState = WS_OPEN
  url = ''
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}
vi.stubGlobal('WebSocket', FakeWebSocket)

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { KubectlProxy } from '../kubectlProxy.resources'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProxy(): KubectlProxy {
  const proxy = new KubectlProxy()
  return proxy
}

function mockExec(proxy: KubectlProxy, output: string, exitCode = 0, error?: string) {
  vi.spyOn(proxy as unknown as { exec: () => unknown }, 'exec').mockResolvedValue({
    output,
    exitCode,
    error,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


// ── Tests (continued) ──

            spec: {
              replicas: 3,
              template: { spec: { containers: [{ image: 'api:v2.1.0' }] } },
            },
            status: { readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const deployments = await proxy.getDeployments('ctx')

      expect(deployments[0].status).toBe('running')
      expect(deployments[0].progress).toBe(100)
      expect(deployments[0].image).toBe('api:v2.1.0')
    })

    it('identifies deploying status (ready < replicas, updated > 0)', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'web', namespace: 'prod' },
            spec: { replicas: 5 },
            status: { readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2 },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const deployments = await proxy.getDeployments('ctx')

      expect(deployments[0].status).toBe('deploying')
      expect(deployments[0].progress).toBe(40)
    })

    it('identifies failed status (ready < replicas, updated === 0)', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'broken', namespace: 'dev' },
            spec: { replicas: 2 },
            status: { readyReplicas: 0, updatedReplicas: 0, availableReplicas: 0 },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const deployments = await proxy.getDeployments('ctx')

      expect(deployments[0].status).toBe('failed')
      expect(deployments[0].progress).toBe(0)
    })

    it('defaults replicas to 1 when spec.replicas is missing', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'single', namespace: 'ns' },
            spec: {},
            status: { readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1 },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const deployments = await proxy.getDeployments('ctx')

      expect(deployments[0].replicas).toBe(1)
      expect(deployments[0].status).toBe('running')
    })
  })

  // ─── getEvents ─────────────────────────────────────────────────────────────

  describe('getEvents', () => {
    it('slices to limit and reverses for most-recent-first', async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        type: 'Normal',
        reason: `Reason${i}`,
        message: `msg${i}`,
        involvedObject: { kind: 'Pod', name: `pod-${i}` },
        metadata: { namespace: 'default' },
        count: i + 1,
        firstTimestamp: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        lastTimestamp: `2025-01-01T01:${String(i).padStart(2, '0')}:00Z`,
      }))
      mockExec(proxy, JSON.stringify({ items: events }))
      const result = await proxy.getEvents('ctx', undefined, 10)

      expect(result).toHaveLength(10)
      // Last 10 events reversed: event 99 first, event 90 last
      expect(result[0].reason).toBe('Reason99')
      expect(result[9].reason).toBe('Reason90')
    })

    it('maps event fields correctly', async () => {
      const data = {
        items: [
          {
            type: 'Warning',
            reason: 'BackOff',
            message: 'Back-off restarting failed container',
            involvedObject: { kind: 'Pod', name: 'worker-abc' },
            metadata: { namespace: 'jobs' },
            count: 7,
            firstTimestamp: '2025-06-01T10:00:00Z',
            lastTimestamp: '2025-06-01T11:00:00Z',
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const result = await proxy.getEvents('my-cluster')

      expect(result[0]).toEqual({
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        object: 'Pod/worker-abc',
        namespace: 'jobs',
        cluster: 'my-cluster',
        count: 7,
        firstSeen: '2025-06-01T10:00:00Z',
        lastSeen: '2025-06-01T11:00:00Z',
      })
    })

    it('defaults count to 1 when missing', async () => {
      const data = {
        items: [
          {
            type: 'Normal',
            reason: 'Scheduled',
            message: 'scheduled',
            involvedObject: { kind: 'Pod', name: 'x' },
            metadata: { namespace: 'ns' },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const result = await proxy.getEvents('ctx')
      expect(result[0].count).toBe(1)
    })
  })

  // ─── getPodIssues ──────────────────────────────────────────────────────────

  describe('getPodIssues', () => {
    it('detects CrashLoopBackOff in container waiting state', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'crash-pod', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [
                {
                  restartCount: 10,
                  state: { waiting: { reason: 'CrashLoopBackOff' } },
                },
              ],
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      expect(issues).toHaveLength(1)
      expect(issues[0].name).toBe('crash-pod')
      expect(issues[0].issues).toContain('CrashLoopBackOff')
      expect(issues[0].restarts).toBe(10)
    })

    it('detects OOMKilled from lastState.terminated', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'oom-pod', namespace: 'prod' },
            status: {
              phase: 'Running',
              containerStatuses: [
                {
                  restartCount: 3,
                  lastState: { terminated: { reason: 'OOMKilled' } },
                  state: {},
                },
              ],
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('OOMKilled')
    })

    it('reports high-restart pods even without waiting problems', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'restart-pod', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [
                { restartCount: 8, state: {} },
              ],
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      // threshold is 5 so 8 > 5 should be reported
      expect(issues).toHaveLength(1)
      expect(issues[0].restarts).toBe(8)
    })

    it('does not report healthy pods below restart threshold', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'healthy-pod', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [
                { restartCount: 2, state: {} },
              ],
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      expect(issues).toHaveLength(0)
    })

    it('detects Unschedulable pending pods', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'stuck-pod', namespace: 'default' },
            status: {
              phase: 'Pending',
              conditions: [
                { type: 'PodScheduled', status: 'False', reason: 'Unschedulable' },
              ],
              containerStatuses: [],
