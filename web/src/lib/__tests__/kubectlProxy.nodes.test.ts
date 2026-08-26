/**
 * Unit tests for KubectlProxy getNodes resource transformation.
 *
 * Covers label→role parsing, ready detection, and resource quantities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (re-used from parent; see original file for full mock setup)
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

describe('KubectlProxy — getNodes resource transformation', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parses node roles from labels', async () => {
    const data = {
      items: [
        {
          metadata: {
            name: 'node-1',
            labels: {
              'node-role.kubernetes.io/control-plane': '',
              'node-role.kubernetes.io/master': '',
              'kubernetes.io/os': 'linux',
            },
          },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            allocatable: { cpu: '4', memory: '8Gi', 'ephemeral-storage': '100Gi' },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const nodes = await proxy.getNodes('test-ctx')

    expect(nodes).toHaveLength(1)
    expect(nodes[0].name).toBe('node-1')
    expect(nodes[0].roles).toEqual(['control-plane', 'master'])
    expect(nodes[0].ready).toBe(true)
  })

  it('detects not-ready node', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'node-unready', labels: {} },
          status: {
            conditions: [{ type: 'Ready', status: 'False' }],
            allocatable: { cpu: '2', memory: '4Gi' },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const nodes = await proxy.getNodes('ctx')

    expect(nodes[0].ready).toBe(false)
    expect(nodes[0].roles).toEqual([])
  })

  it('falls back to capacity when allocatable is missing', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'node-cap', labels: {} },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            capacity: { cpu: '8', memory: '16Gi', 'ephemeral-storage': '200Gi' },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const nodes = await proxy.getNodes('ctx')

    expect(nodes[0].cpuCores).toBe(8)
    expect(nodes[0].memoryBytes).toBe(16 * 1024 * 1024 * 1024)
  })

  it('handles node with no labels', async () => {
    const data = {
      items: [
        {
          metadata: { name: 'bare-node' },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            allocatable: { cpu: '1' },
          },
        },
      ],
    }
    mockExec(proxy, JSON.stringify(data))
    const nodes = await proxy.getNodes('ctx')

    expect(nodes[0].roles).toEqual([])
  })

  it('handles empty items', async () => {
    mockExec(proxy, JSON.stringify({ items: [] }))
    const nodes = await proxy.getNodes('ctx')
    expect(nodes).toEqual([])
  })

  it('handles missing items key', async () => {
    mockExec(proxy, JSON.stringify({}))
    const nodes = await proxy.getNodes('ctx')
    expect(nodes).toEqual([])
  })
})
