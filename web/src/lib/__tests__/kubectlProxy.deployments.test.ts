/**
 * Unit tests for KubectlProxy getDeployments, getPVCs, and getNamespaces transformations.
 *
 * Covers status derivation, field mapping, and namespace parsing.
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

describe('KubectlProxy — deployments, PVCs, and namespaces transformations', () => {
  let proxy: KubectlProxy

  beforeEach(() => {
    vi.useFakeTimers()
    proxy = createProxy()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

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
})
