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

  // ─── getClusterUsage ───────────────────────────────────────────────────────

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

  // ─── getClusterHealth ──────────────────────────────────────────────────────

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

      // getClusterHealth calls getNodes and getPodMetrics (both use exec)
      // then getClusterUsage (also uses exec)
      const execSpy = vi.spyOn(proxy as unknown as { exec: () => unknown }, 'exec')
      execSpy
        .mockResolvedValueOnce({ output: JSON.stringify(nodesData), exitCode: 0 }) // getNodes
        .mockResolvedValueOnce({ output: JSON.stringify(podsData), exitCode: 0 }) // getPodMetrics
        .mockResolvedValueOnce({ output: '', exitCode: 1 }) // getClusterUsage (no metrics)

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
