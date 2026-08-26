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

describe('KubectlProxy — resource transformation (happy paths)', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ─── getNodes ──────────────────────────────────────────────────────────────

  describe('getNodes', () => {
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

  // ─── getPodMetrics ─────────────────────────────────────────────────────────

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

  // ─── getNamespaces ─────────────────────────────────────────────────────────

  describe('getNamespaces', () => {
    it('splits and sorts namespace output', async () => {
      mockExec(proxy, 'kube-system default monitoring')
      const namespaces = await proxy.getNamespaces('ctx')
      expect(namespaces).toEqual(['default', 'kube-system', 'monitoring'])
    })

    it('handles extra whitespace', async () => {
      mockExec(proxy, '  ns1  ns2  ')
      const namespaces = await proxy.getNamespaces('ctx')
      expect(namespaces).toEqual(['ns1', 'ns2'])
    })

    it('returns empty array for empty output', async () => {
      mockExec(proxy, '')
      const namespaces = await proxy.getNamespaces('ctx')
      expect(namespaces).toEqual([])
    })
  })

  // ─── getServices ───────────────────────────────────────────────────────────

  describe('getServices', () => {
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

  // ─── getPVCs ───────────────────────────────────────────────────────────────

  describe('getPVCs', () => {
    it('maps PVC fields correctly', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'data-pvc', namespace: 'staging' },
            status: { phase: 'Bound', capacity: { storage: '50Gi' } },
            spec: { storageClassName: 'gp3' },
          },
          {
            metadata: { name: 'logs-pvc', namespace: 'staging' },
            status: { phase: 'Pending' },
            spec: {},
          },
        ],
      }
      mockExec(proxy, JSON.stringify(data))
      const pvcs = await proxy.getPVCs('ctx', 'staging')

      expect(pvcs).toHaveLength(2)
      expect(pvcs[0]).toEqual({
        name: 'data-pvc',
        namespace: 'staging',
        status: 'Bound',
        capacity: '50Gi',
        storageClass: 'gp3',
      })
      expect(pvcs[1]).toEqual({
        name: 'logs-pvc',
        namespace: 'staging',
        status: 'Pending',
        capacity: '',
        storageClass: '',
      })
    })
  })

  // ─── getDeployments ────────────────────────────────────────────────────────

  describe('getDeployments', () => {
    it('identifies running deployment (ready === replicas)', async () => {
      const data = {
        items: [
          {
            metadata: { name: 'api', namespace: 'prod', labels: { app: 'api' } },
