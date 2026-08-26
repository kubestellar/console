/**
 * Unit tests for KubectlProxy cluster health and usage resource transformations.
 *
 * Covers kubectl top nodes output parsing and cluster health aggregation.
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

describe('KubectlProxy — cluster health and usage transformations', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('getClusterUsage', () => {
    it('parses kubectl top nodes output with millicores', async () => {
      const output = [
        'node-1   200m   5%   512Mi   12%',
        'node-2   1500m  38%  2048Mi  50%',
      ].join('\n')
      mockExec(proxy, output)
      const usage = await proxy.getClusterUsage('ctx')

      expect(usage.metricsAvailable).toBe(true)
      expect(usage.cpuUsageMillicores).toBe(200 + 1500)
    })

    it('parses whole-number CPU (cores, not millicores)', async () => {
      const output = 'node-1   2   50%   1Gi   25%'
      mockExec(proxy, output)
      const usage = await proxy.getClusterUsage('ctx')

      expect(usage.cpuUsageMillicores).toBe(2000)
    })

    it('returns metricsAvailable=false on non-zero exit', async () => {
      mockExec(proxy, '', 1, 'metrics-server not available')
      const usage = await proxy.getClusterUsage('ctx')

      expect(usage.metricsAvailable).toBe(false)
      expect(usage.cpuUsageMillicores).toBe(0)
      expect(usage.memoryUsageBytes).toBe(0)
    })

    it('ignores blank lines', async () => {
      const output = '\nnode-1   100m   2%   256Mi   5%\n\n'
      mockExec(proxy, output)
      const usage = await proxy.getClusterUsage('ctx')

      expect(usage.cpuUsageMillicores).toBe(100)
    })
  })

  describe('getClusterHealth', () => {
    it('computes healthy=true when ≥50% nodes are ready', async () => {
      const nodesData = {
        items: [
          {
            metadata: { name: 'n1', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '50Gi' },
            },
          },
          {
            metadata: { name: 'n2', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '50Gi' },
            },
          },
          {
            metadata: { name: 'n3', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'False' }],
              allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '50Gi' },
            },
          },
        ],
      }
      const podsData = { items: [{ spec: { containers: [] } }] }

      const execSpy = vi.spyOn(proxy as unknown as { exec: () => unknown }, 'exec')
      execSpy
        .mockResolvedValueOnce({ output: JSON.stringify(nodesData), exitCode: 0 })
        .mockResolvedValueOnce({ output: JSON.stringify(podsData), exitCode: 0 })
        .mockResolvedValueOnce({ output: '', exitCode: 1 })

      const health = await proxy.getClusterHealth('test-cluster')

      expect(health.healthy).toBe(true)
      expect(health.reachable).toBe(true)
      expect(health.nodeCount).toBe(3)
      expect(health.readyNodes).toBe(2)
      expect(health.cluster).toBe('test-cluster')
      expect(health.cpuCores).toBe(12)
    })

    it('computes healthy=false when <50% nodes are ready', async () => {
      const nodesData = {
        items: [
          {
            metadata: { name: 'n1', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'False' }],
              allocatable: { cpu: '2', memory: '4Gi' },
            },
          },
          {
            metadata: { name: 'n2', labels: {} },
            status: {
              conditions: [{ type: 'Ready', status: 'False' }],
              allocatable: { cpu: '2', memory: '4Gi' },
            },
          },
        ],
      }
      const podsData = { items: [] }

      const execSpy = vi.spyOn(proxy as unknown as { exec: () => unknown }, 'exec')
      execSpy
        .mockResolvedValueOnce({ output: JSON.stringify(nodesData), exitCode: 0 })
        .mockResolvedValueOnce({ output: JSON.stringify(podsData), exitCode: 0 })
        .mockResolvedValueOnce({ output: '', exitCode: 1 })

      const health = await proxy.getClusterHealth('failing-cluster')

      expect(health.healthy).toBe(false)
      expect(health.readyNodes).toBe(0)
    })

    it('returns unreachable when exec throws', async () => {
      vi.spyOn(proxy as unknown as { exec: () => unknown }, 'exec')
        .mockRejectedValue(new Error('connection refused'))

      const health = await proxy.getClusterHealth('dead-cluster')

      expect(health.reachable).toBe(false)
      expect(health.healthy).toBe(false)
      expect(health.errorMessage).toBe('connection refused')
    })
  })
})
