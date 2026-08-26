/**
 * Unit tests for KubectlProxy getServices resource transformation.
 *
 * Covers LoadBalancer status, external IP aggregation, and port formatting.
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

describe('KubectlProxy — getServices resource transformation', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('computes LoadBalancer status as Ready when ingress exists', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'web-svc', namespace: 'default' },
          spec: {
            type: 'LoadBalancer',
            clusterIP: '10.0.0.1',
            ports: [{ port: 80, protocol: 'TCP' }, { port: 443, protocol: 'TCP' }],
            selector: { app: 'web' },
          },
          status: {
            loadBalancer: {
              ingress: [{ ip: '203.0.113.1' }],
            },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const services = await proxy.getServices('ctx')

    expect(services).toHaveLength(1)
    expect(services[0].lbStatus).toBe('Ready')
    expect(services[0].externalIP).toBe('203.0.113.1')
    expect(services[0].externalIPs).toEqual(['203.0.113.1'])
    expect(services[0].ports).toBe('80/TCP, 443/TCP')
  })

  it('marks LoadBalancer as Provisioning when no ingress', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'pending-lb', namespace: 'default' },
          spec: {
            type: 'LoadBalancer',
            clusterIP: '10.0.0.2',
            ports: [{ port: 8080, protocol: 'TCP' }],
          },
          status: {},
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const services = await proxy.getServices('ctx')

    expect(services[0].lbStatus).toBe('Provisioning')
    expect(services[0].externalIP).toBe('')
  })

  it('aggregates externalIPs and ingress hostnames', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'multi-svc', namespace: 'prod' },
          spec: {
            type: 'LoadBalancer',
            clusterIP: '10.0.0.3',
            externalIPs: ['192.168.1.1'],
            ports: [{ port: 443, protocol: 'TCP' }],
          },
          status: {
            loadBalancer: {
              ingress: [{ hostname: 'lb.example.com' }],
            },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const services = await proxy.getServices('ctx')

    expect(services[0].externalIPs).toEqual(['192.168.1.1', 'lb.example.com'])
    expect(services[0].externalIP).toBe('192.168.1.1, lb.example.com')
    expect(services[0].lbStatus).toBe('Ready')
  })

  it('does not set lbStatus for ClusterIP services', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'internal', namespace: 'default' },
          spec: {
            type: 'ClusterIP',
            clusterIP: '10.0.0.5',
            ports: [{ port: 9090, protocol: 'TCP' }],
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const services = await proxy.getServices('ctx')

    expect(services[0].lbStatus).toBe('')
    expect(services[0].type).toBe('ClusterIP')
  })
})
