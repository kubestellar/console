/**
 * Unit tests for KubectlProxy getEvents resource transformation.
 *
 * Covers slice/reverse ordering and field mapping.
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

describe('KubectlProxy — getEvents resource transformation', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

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
