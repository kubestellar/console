/**
 * Tests for useDeployMissions.polling — pollClusterStatus REST fallback paths
 *
 * Covers safe replica parsing, HTTP error classification, and failure counters.
 * Part of #4189 / #16027.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
  agentFetch: vi.fn(),
}))

vi.mock('../useBackendHealth', () => ({
  isInClusterMode: vi.fn(() => false),
}))

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'kc-auth-token',
  }
})

import { pollClusterStatus } from '../useDeployMissions.polling'
import {
  MAX_STATUS_FAILURES,
  MAX_NETWORK_FAILURES,
} from '../useDeployMissions.types'
import type { DeployMission } from '../useDeployMissions.types'

const DEPLOY_MISSION: DeployMission = {
  id: 'deploy-mission-1',
  workload: 'nginx',
  namespace: 'default',
  sourceCluster: 'cluster-a',
  targetClusters: ['cluster-a'],
  status: 'deploying',
  clusterStatuses: [],
  startedAt: Date.now(),
}

function mockResponse(
  status: number,
  body: unknown,
  options: { ok?: boolean; statusText?: string } = {},
): Response {
  const ok = options.ok ?? (status >= 200 && status < 300)
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
  const response = {
    ok,
    status,
    statusText: options.statusText ?? (ok ? 'OK' : 'Error'),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => bodyText,
    clone: () => mockResponse(status, body, options),
  }
  return response as unknown as Response
}

function mockFetchSequence(responses: Array<Response | Error>) {
  const fetchMock = vi.fn()
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response)
    } else {
      fetchMock.mockResolvedValueOnce(response)
    }
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function statusUrl(cluster = 'cluster-a') {
  return `/api/workloads/deploy-status/${encodeURIComponent(cluster)}/default/nginx`
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pollClusterStatus REST fallback', () => {
  it('returns safe integer replica counts when REST API sends string values', async () => {
    mockFetchSequence([
      mockResponse(200, {
        status: 'applying',
        replicas: '3',
        readyReplicas: '2',
        updatedReplicas: '2',
      }),
      mockResponse(200, { logs: [] }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, undefined)

    expect(result.replicas).toBe(3)
    expect(result.readyReplicas).toBe(2)
    expect(typeof result.replicas).toBe('number')
    expect(typeof result.readyReplicas).toBe('number')
  })

  it('returns 0 not NaN when REST API sends null or undefined replica fields', async () => {
    mockFetchSequence([
      mockResponse(200, {
        status: 'applying',
        replicas: null,
        readyReplicas: undefined,
      }),
      mockResponse(200, { logs: [] }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, undefined)

    expect(result.replicas).toBe(0)
    expect(result.readyReplicas).toBe(0)
    expect(Number.isNaN(result.replicas)).toBe(false)
    expect(Number.isNaN(result.readyReplicas)).toBe(false)
  })

  it('does not return negative replica counts under any input', async () => {
    mockFetchSequence([
      mockResponse(200, {
        status: 'applying',
        replicas: -5,
        readyReplicas: '-2',
      }),
      mockResponse(200, { logs: [] }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, undefined)

    expect(result.replicas).toBe(0)
    expect(result.readyReplicas).toBe(0)
    expect(result.replicas).toBeGreaterThanOrEqual(0)
    expect(result.readyReplicas).toBeGreaterThanOrEqual(0)
  })

  it('marks 401 responses as auth-expired and increments httpFailureCount', async () => {
    mockFetchSequence([
      mockResponse(401, { message: 'Unauthorized' }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'pending',
      replicas: 0,
      readyReplicas: 0,
      consecutiveFailures: 0,
      networkFailureCount: 0,
    })

    expect(result.status).toBe('failed')
    expect(result.consecutiveFailures).toBe(1)
    expect(result.networkFailureCount).toBe(0)
    expect(result.logs?.[0]).toContain('Authentication failed (HTTP 401)')
  })

  it('marks 403 RBAC deny responses as permission-denied', async () => {
    mockFetchSequence([
      mockResponse(403, {
        reason: 'Forbidden',
        message: 'cannot get deployments.apps in namespace default',
      }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, undefined)

    expect(result.status).toBe('failed')
    expect(result.logs?.[0]).toContain('Permission denied (HTTP 403)')
    expect(result.logs?.[0]).toContain('cannot get deployments')
  })

  it('marks 429 responses as rate-limited without incrementing networkFailureCount', async () => {
    mockFetchSequence([
      mockResponse(429, 'Too Many Requests', { statusText: 'Too Many Requests' }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'pending',
      replicas: 0,
      readyReplicas: 0,
      consecutiveFailures: 1,
      networkFailureCount: 2,
    })

    expect(result.status).toBe('pending')
    expect(result.consecutiveFailures).toBe(2)
    expect(result.networkFailureCount).toBe(2)
    expect(result.logs?.[0]).toContain('HTTP 429')
  })

  it('increments networkFailureCount on fetch() rejection, not httpFailureCount', async () => {
    mockFetchSequence([new Error('Network unreachable')])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'pending',
      replicas: 0,
      readyReplicas: 0,
      consecutiveFailures: 4,
      networkFailureCount: 1,
    })

    expect(result.status).toBe('pending')
    expect(result.consecutiveFailures).toBe(4)
    expect(result.networkFailureCount).toBe(2)
  })

  it('stops polling after MAX_STATUS_FAILURES consecutive HTTP failures', async () => {
    mockFetchSequence([
      mockResponse(500, { error: 'internal' }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'pending',
      replicas: 0,
      readyReplicas: 0,
      consecutiveFailures: MAX_STATUS_FAILURES - 1,
      networkFailureCount: 0,
    })

    expect(result.status).toBe('failed')
    expect(result.consecutiveFailures).toBe(MAX_STATUS_FAILURES)
    expect(result.logs?.[0]).toContain(`Status unreachable after ${MAX_STATUS_FAILURES} consecutive HTTP errors`)
  })

  it('marks deployment notFound when 404 is received during active polling', async () => {
    mockFetchSequence([
      mockResponse(200, {
        notFound: true,
        message: 'Deployment nginx was deleted',
      }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, undefined)

    expect(result.status).toBe('failed')
    expect(result.logs?.[0]).toContain('Deployment nginx was deleted')
  })

  it('continues polling on transient 503 within failure threshold', async () => {
    mockFetchSequence([
      mockResponse(503, { error: 'service unavailable' }, { statusText: 'Service Unavailable' }),
    ])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'applying',
      replicas: 1,
      readyReplicas: 0,
      consecutiveFailures: 0,
      networkFailureCount: 0,
    })

    expect(result.status).toBe('pending')
    expect(result.consecutiveFailures).toBe(1)
    expect(result.networkFailureCount).toBe(0)
    expect(result.logs?.[0]).toContain('HTTP 503')
  })
})

describe('pollClusterStatus network failure threshold', () => {
  it('marks cluster failed after MAX_NETWORK_FAILURES network errors', async () => {
    mockFetchSequence([new Error('ECONNRESET')])

    const result = await pollClusterStatus('cluster-a', DEPLOY_MISSION, {
      cluster: 'cluster-a',
      status: 'pending',
      replicas: 0,
      readyReplicas: 0,
      consecutiveFailures: 0,
      networkFailureCount: MAX_NETWORK_FAILURES - 1,
    })

    expect(result.status).toBe('failed')
    expect(result.networkFailureCount).toBe(MAX_NETWORK_FAILURES)
    expect(result.logs?.[0]).toContain(`Network unreachable after ${MAX_NETWORK_FAILURES} consecutive attempts`)
  })
})
