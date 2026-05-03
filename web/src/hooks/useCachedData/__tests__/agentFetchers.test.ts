/**
 * Tests for useCachedData/agentFetchers.ts — kc-agent HTTP fetchers.
 *
 * These functions communicate with the local agent; we mock kubectlProxy,
 * agentFetch, clusterCacheRef, and isAgentUnavailable to exercise all paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockClusterCacheRef,
  mockAgentFetch,
  mockGetPodIssues,
  mockSettledWithConcurrency,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => false),
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
  mockAgentFetch: vi.fn(),
  mockGetPodIssues: vi.fn(),
  mockSettledWithConcurrency: vi.fn(),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { getPodIssues: (...args: unknown[]) => mockGetPodIssues(...args) },
}))

vi.mock('../../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8089' }
})

vi.mock('../../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  AGENT_HTTP_TIMEOUT_MS: 5_000,
}))

// Mock settledWithConcurrency to just run tasks sequentially
vi.mock('../../../lib/utils/concurrency', () => ({
  settledWithConcurrency: async (
    tasks: Array<() => Promise<unknown>>,
    _concurrency: number | undefined,
    onSettled: (result: PromiseSettledResult<unknown>) => void,
  ) => {
    for (const task of tasks) {
      try {
        const value = await task()
        onSettled({ status: 'fulfilled', value })
      } catch (reason: unknown) {
        onSettled({ status: 'rejected', reason })
      }
    }
  },
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  getAgentClusters,
  fetchPodIssuesViaAgent,
  fetchDeploymentsViaAgent,
  fetchWorkloadsFromAgent,
  fetchCiliumStatus,
  fetchJaegerStatus,
} from '../agentFetchers'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalLocalStorage = globalThis.localStorage

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(false)
  mockClusterCacheRef.clusters = []
})

// ===========================================================================
// getAgentClusters
// ===========================================================================

describe('getAgentClusters', () => {
  it('returns empty array when no clusters', () => {
    expect(getAgentClusters()).toEqual([])
  })

  it('filters out clusters with reachable === false', () => {
    mockClusterCacheRef.clusters = [
      { name: 'a', reachable: true },
      { name: 'b', reachable: false },
      { name: 'c', reachable: undefined as unknown as boolean },
    ]
    const result = getAgentClusters()
    expect(result.map(c => c.name)).toEqual(['a', 'c'])
  })

  it('filters out clusters with "/" in name (long context paths)', () => {
    mockClusterCacheRef.clusters = [
      { name: 'short-name', reachable: true },
      { name: 'default/api-server:6443/something', reachable: true },
    ]
    const result = getAgentClusters()
    expect(result).toEqual([{ name: 'short-name', context: undefined }])
  })

  it('includes context when present', () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]
    const result = getAgentClusters()
    expect(result).toEqual([{ name: 'prod', context: 'prod-ctx' }])
  })
})

// ===========================================================================
// fetchPodIssuesViaAgent
// ===========================================================================

describe('fetchPodIssuesViaAgent', () => {
  it('returns empty array when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchPodIssuesViaAgent()
    expect(result).toEqual([])
  })

  it('returns empty array when no clusters available', async () => {
    mockClusterCacheRef.clusters = []
    const result = await fetchPodIssuesViaAgent()
    expect(result).toEqual([])
  })

  it('fetches pod issues from all clusters and tags with short name', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]
    const fakeIssues = [
      { name: 'pod-1', namespace: 'default', restarts: 5, cluster: 'prod-ctx' },
    ]
    mockGetPodIssues.mockResolvedValue(fakeIssues)

    const result = await fetchPodIssuesViaAgent()
    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('prod')
    expect(mockGetPodIssues).toHaveBeenCalledWith('prod-ctx', undefined)
  })

  it('uses name as context when context is undefined', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'dev', reachable: true },
    ]
    mockGetPodIssues.mockResolvedValue([])

    await fetchPodIssuesViaAgent()
    expect(mockGetPodIssues).toHaveBeenCalledWith('dev', undefined)
  })

  it('passes namespace parameter when provided', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockGetPodIssues.mockResolvedValue([])

    await fetchPodIssuesViaAgent('kube-system')
    expect(mockGetPodIssues).toHaveBeenCalledWith('prod', 'kube-system')
  })

  it('handles null return from kubectlProxy gracefully', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockGetPodIssues.mockResolvedValue(null)

    const result = await fetchPodIssuesViaAgent()
    expect(result).toEqual([])
  })

  it('calls onProgress with accumulated results', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'a', reachable: true },
      { name: 'b', reachable: true },
    ]
    mockGetPodIssues
      .mockResolvedValueOnce([{ name: 'p1', cluster: 'a' }])
      .mockResolvedValueOnce([{ name: 'p2', cluster: 'b' }])

    const onProgress = vi.fn()
    const result = await fetchPodIssuesViaAgent(undefined, onProgress)

    expect(result).toHaveLength(2)
    expect(onProgress).toHaveBeenCalled()
  })

  it('silently skips clusters that fail', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'ok', reachable: true },
      { name: 'fail', reachable: true },
    ]
    mockGetPodIssues
      .mockResolvedValueOnce([{ name: 'p1', cluster: 'ok' }])
      .mockRejectedValueOnce(new Error('connection refused'))

    const result = await fetchPodIssuesViaAgent()
    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('ok')
  })
})

// ===========================================================================
// fetchDeploymentsViaAgent
// ===========================================================================

describe('fetchDeploymentsViaAgent', () => {
  it('returns empty array when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchDeploymentsViaAgent()
    expect(result).toEqual([])
  })

  it('returns empty array when no clusters', async () => {
    mockClusterCacheRef.clusters = []
    const result = await fetchDeploymentsViaAgent()
    expect(result).toEqual([])
  })

  it('fetches deployments and tags with short cluster name', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', context: 'prod-ctx', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        deployments: [{ name: 'nginx', namespace: 'default', cluster: 'prod-ctx' }],
      }),
    })

    const result = await fetchDeploymentsViaAgent()
    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('prod')
  })

  it('throws on non-ok response', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({ ok: false, status: 500 })

    // The error is caught by settledWithConcurrency, so result is empty
    const result = await fetchDeploymentsViaAgent()
    expect(result).toEqual([])
  })

  it('handles invalid JSON gracefully', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('invalid json') },
    })

    const result = await fetchDeploymentsViaAgent()
    expect(result).toEqual([])
  })

  it('passes namespace parameter in query string', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'dev', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: [] }),
    })

    await fetchDeploymentsViaAgent('kube-system')
    const calledUrl = mockAgentFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('namespace=kube-system')
  })

  it('calls onProgress with accumulated results', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'a', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: [{ name: 'd1' }] }),
    })

    const onProgress = vi.fn()
    await fetchDeploymentsViaAgent(undefined, onProgress)
    expect(onProgress).toHaveBeenCalled()
  })
})

// ===========================================================================
// fetchWorkloadsFromAgent
// ===========================================================================

describe('fetchWorkloadsFromAgent', () => {
  it('returns null when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchWorkloadsFromAgent()
    expect(result).toBeNull()
  })

  it('returns null when no clusters', async () => {
    mockClusterCacheRef.clusters = []
    const result = await fetchWorkloadsFromAgent()
    expect(result).toBeNull()
  })

  it('maps deployment data to Workload shape', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        deployments: [{
          name: 'nginx',
          namespace: 'web',
          replicas: 3,
          readyReplicas: 3,
          status: 'running',
          image: 'nginx:latest',
        }],
      }),
    })

    const result = await fetchWorkloadsFromAgent()
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    const w = result![0]
    expect(w.name).toBe('nginx')
    expect(w.namespace).toBe('web')
    expect(w.type).toBe('Deployment')
    expect(w.cluster).toBe('prod')
    expect(w.status).toBe('Running')
  })

  it('maps failed status correctly', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        deployments: [{ name: 'broken', status: 'failed', replicas: 1, readyReplicas: 0 }],
      }),
    })

    const result = await fetchWorkloadsFromAgent()
    expect(result![0].status).toBe('Failed')
  })

  it('maps deploying status correctly', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        deployments: [{ name: 'rolling', status: 'deploying', replicas: 1, readyReplicas: 0 }],
      }),
    })

    const result = await fetchWorkloadsFromAgent()
    expect(result![0].status).toBe('Pending')
  })

  it('maps degraded status when readyReplicas < replicas', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        deployments: [{ name: 'partial', status: 'running', replicas: 3, readyReplicas: 1 }],
      }),
    })

    const result = await fetchWorkloadsFromAgent()
    expect(result![0].status).toBe('Degraded')
  })

  it('returns null when all clusters fail', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
    ]
    mockAgentFetch.mockRejectedValue(new Error('timeout'))

    const result = await fetchWorkloadsFromAgent()
    expect(result).toBeNull()
  })

  it('filters out clusters with "/" in name', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod', reachable: true },
      { name: 'default/api-long-path:6443/x', reachable: true },
    ]
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ deployments: [{ name: 'app' }] }),
    })

    await fetchWorkloadsFromAgent()
    // Only one cluster should have been fetched
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// fetchCiliumStatus
// ===========================================================================

describe('fetchCiliumStatus', () => {
  it('returns null when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })

  it('returns null when no token', async () => {
    localStorage.removeItem('token')
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })

  it('returns null for demo-token', async () => {
    localStorage.setItem('token', 'demo-token')
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })

  it('fetches cilium status with auth header', async () => {
    localStorage.setItem('token', 'real-token')
    const fakeStatus = { enabled: true, pods: 5 }
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => fakeStatus,
    })

    const result = await fetchCiliumStatus()
    expect(result).toEqual(fakeStatus)
    expect(mockAgentFetch).toHaveBeenCalledWith(
      'http://localhost:8089/cilium-status',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer real-token',
        }),
      }),
    )
  })

  it('returns null on non-ok response', async () => {
    localStorage.setItem('token', 'real-token')
    mockAgentFetch.mockResolvedValue({ ok: false, status: 500 })
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })

  it('returns null on fetch error', async () => {
    localStorage.setItem('token', 'real-token')
    mockAgentFetch.mockRejectedValue(new Error('network'))
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })

  it('returns null on JSON parse error', async () => {
    localStorage.setItem('token', 'real-token')
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('bad json') },
    })
    const result = await fetchCiliumStatus()
    expect(result).toBeNull()
  })
})

// ===========================================================================
// fetchJaegerStatus
// ===========================================================================

describe('fetchJaegerStatus', () => {
  it('returns null when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const result = await fetchJaegerStatus()
    expect(result).toBeNull()
  })

  it('returns null when no token', async () => {
    localStorage.removeItem('token')
    const result = await fetchJaegerStatus()
    expect(result).toBeNull()
  })

  it('returns null for demo-token', async () => {
    localStorage.setItem('token', 'demo-token')
    const result = await fetchJaegerStatus()
    expect(result).toBeNull()
  })

  it('fetches jaeger status with auth header', async () => {
    localStorage.setItem('token', 'real-token')
    const fakeStatus = { services: ['svc-a'] }
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => fakeStatus,
    })

    const result = await fetchJaegerStatus()
    expect(result).toEqual(fakeStatus)
  })

  it('returns null on non-ok response', async () => {
    localStorage.setItem('token', 'real-token')
    mockAgentFetch.mockResolvedValue({ ok: false, status: 404 })
    const result = await fetchJaegerStatus()
    expect(result).toBeNull()
  })

  it('returns null on fetch error', async () => {
    localStorage.setItem('token', 'real-token')
    mockAgentFetch.mockRejectedValue(new Error('timeout'))
    const result = await fetchJaegerStatus()
    expect(result).toBeNull()
  })
})
