/**
 * Unit tests for KubectlProxy pod-related resource transformations.
 *
 * Covers getPodMetrics and getPodIssues transformations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { KubectlProxy } from '../kubectlProxy.resources'

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

describe('KubectlProxy — pod resource transformations', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('getPodMetrics', () => {
    it('aggregates cpu/memory requests across all containers', async () => {
      const data = {
        items: [
          {
            spec: {
              containers: [
                { resources: { requests: { cpu: '500m', memory: '256Mi' } } },
                { resources: { requests: { cpu: '250m', memory: '128Mi' } } },
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
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const result = await proxy.getPodMetrics('ctx')

      expect(result.count).toBe(2)
      expect(result.cpuRequestsMillicores).toBe(500 + 250 + 1000)
      expect(result.memoryRequestsBytes).toBe(
        256 * 1024 * 1024 + 128 * 1024 * 1024 + 1024 * 1024 * 1024,
      )
    })

    it('handles pods with no resource requests', async () => {
      const data = {
        items: [
          { spec: { containers: [{ resources: {} }] } },
          { spec: { containers: [{}] } },
          { spec: {} },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const result = await proxy.getPodMetrics('ctx')

      expect(result.count).toBe(3)
      expect(result.cpuRequestsMillicores).toBe(0)
      expect(result.memoryRequestsBytes).toBe(0)
    })
  })

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
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Unschedulable')
    })

    it('reports Failed phase pods', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'dead-pod', namespace: 'batch' },
            status: {
              phase: 'Failed',
              reason: 'Evicted',
              containerStatuses: [],
            },
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const issues = await proxy.getPodIssues('ctx')

      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Evicted')
      expect(issues[0].cluster).toBe('ctx')
    })
  })
})
