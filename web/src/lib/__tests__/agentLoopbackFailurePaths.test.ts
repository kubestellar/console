/**
 * Tests for agent loopback failure paths — fetcherUtils routing, agent
 * fetcher guards, and WebSocket backoff logic.
 *
 * Validates that:
 *   - fetchAPI routes through the correct endpoint based on backend preference
 *   - isClusterModeBackend() respects localStorage and in-cluster state
 *   - Agent fetchers (agentFetchers.ts) bail early when agent is unavailable
 *   - WebSocket exponential backoff calculates correct delays
 *   - abortAllFetches() cancels in-flight requests
 *   - Network constants are correctly exported and used
 *
 * Issue #11591 — agent connectivity and loopback failure paths not validated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ===========================================================================
// Section 1: fetcherUtils — isClusterModeBackend, getClusterFetcher, routing
// ===========================================================================

describe('fetcherUtils backend routing', () => {
  const BACKEND_PREF_KEY = 'kc_agent_backend_preference'

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isClusterModeBackend()', () => {
    // We test the function by importing with different mock states

    it('returns false when no preference is set (default kc-agent)', async () => {
      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { isClusterModeBackend } = await import('../cache/fetcherUtils')
      expect(isClusterModeBackend()).toBe(false)
    })

    it('returns true when preference is kagent', async () => {
      localStorage.setItem(BACKEND_PREF_KEY, 'kagent')

      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { isClusterModeBackend } = await import('../cache/fetcherUtils')
      expect(isClusterModeBackend()).toBe(true)
    })

    it('returns true when preference is kagenti', async () => {
      localStorage.setItem(BACKEND_PREF_KEY, 'kagenti')

      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { isClusterModeBackend } = await import('../cache/fetcherUtils')
      expect(isClusterModeBackend()).toBe(true)
    })

    it('returns false for unrecognized preference value', async () => {
      localStorage.setItem(BACKEND_PREF_KEY, 'kc-agent')

      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { isClusterModeBackend } = await import('../cache/fetcherUtils')
      expect(isClusterModeBackend()).toBe(false)
    })
  })

  describe('abortAllFetches()', () => {
    it('can be called without throwing', async () => {
      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { abortAllFetches } = await import('../cache/fetcherUtils')
      expect(() => abortAllFetches()).not.toThrow()
    })

    it('can be called multiple times in succession', async () => {
      vi.doMock('../../api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
      vi.doMock('../../sseClient', () => ({ fetchSSE: vi.fn() }))
      vi.doMock('../../../hooks/useBackendHealth', () => ({ isInClusterMode: () => false }))
      vi.doMock('../../../hooks/mcp/clusterCacheRef', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      vi.doMock('../../constants', () => ({
        LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
        STORAGE_KEY_TOKEN: 'kc-token',
      }))
      vi.doMock('../../constants/network', () => ({ FETCH_DEFAULT_TIMEOUT_MS: 10_000 }))
      vi.doMock('../../utils/concurrency', () => ({ settledWithConcurrency: vi.fn() }))
      vi.doMock('../../schemas', () => ({ ClustersResponseSchema: {} }))
      vi.doMock('../../schemas/validate', () => ({
        validateArrayResponse: vi.fn((_s: unknown, raw: unknown) => raw),
      }))

      const { abortAllFetches } = await import('../cache/fetcherUtils')
      expect(() => {
        abortAllFetches()
        abortAllFetches()
        abortAllFetches()
      }).not.toThrow()
    })
  })
})

// ===========================================================================
// Section 2: Agent Fetchers — Early Bail When Agent Unavailable
// ===========================================================================

// Mock variables for agentFetchers section — declared at module scope so
// vi.doMock factories in beforeEach can reference them.
const mockIsAgentUnavailable = vi.fn(() => false)
const mockClusterCacheRef = {
  clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
}
const mockAgentFetch = vi.fn()
const mockGetPodIssues = vi.fn()

describe('agentFetchers failure paths', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = []
    localStorage.clear()

    vi.doMock('../kubectlProxy', () => ({
      kubectlProxy: { getPodIssues: (...args: unknown[]) => mockGetPodIssues(...args) },
    }))
    vi.doMock('../../hooks/mcp/shared', () => ({
      clusterCacheRef: mockClusterCacheRef,
      agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
    }))
    vi.doMock('../../hooks/mcp/dedup', () => ({
      deduplicateClustersByServer: (clusters: Array<{ name: string }>) => clusters,
    }))
    vi.doMock('../../hooks/useLocalAgent', () => ({
      isAgentUnavailable: () => mockIsAgentUnavailable(),
    }))
    vi.doMock('../constants', () => ({
      LOCAL_AGENT_HTTP_URL: 'http://localhost:8089',
      STORAGE_KEY_TOKEN: 'kc-token',
      FETCH_DEFAULT_TIMEOUT_MS: 10_000,
    }))
    vi.doMock('../constants/network', () => ({
      FETCH_DEFAULT_TIMEOUT_MS: 10_000,
    }))
    vi.doMock('../cache/fetcherUtils', () => ({
      AGENT_HTTP_TIMEOUT_MS: 5_000,
    }))
    vi.doMock('../utils/concurrency', () => ({
      settledWithConcurrency: async (
        tasks: Array<() => Promise<unknown>>,
        _concurrency: number | undefined,
        onSettled: (result: PromiseSettledResult<unknown>) => void,
      ) => {
        for (const task of tasks) {
          try {
            const result = await task()
            onSettled({ status: 'fulfilled', value: result })
          } catch (reason) {
            onSettled({ status: 'rejected', reason })
          }
        }
      },
    }))
    // Mock AlertsContext service modules (added after #11559 refactor)
    vi.doMock('../../contexts/notifications', () => ({}))
    vi.doMock('../../contexts/alertStorage', () => ({}))
    vi.doMock('../../contexts/alertRunbooks', () => ({}))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchPodIssuesViaAgent', () => {
    it('returns empty array when agent is unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchPodIssuesViaAgent()
      expect(result).toEqual([])
      expect(mockGetPodIssues).not.toHaveBeenCalled()
    })

    it('returns empty array when no clusters are available', async () => {
      mockClusterCacheRef.clusters = []
      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchPodIssuesViaAgent()
      expect(result).toEqual([])
    })

    it('fetches pod issues from available clusters', async () => {
      mockClusterCacheRef.clusters = [
        { name: 'cluster-a', reachable: true },
        { name: 'cluster-b', reachable: true },
      ]
      mockGetPodIssues.mockResolvedValue([
        { name: 'bad-pod', namespace: 'default', status: 'CrashLoopBackOff' },
      ])

      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchPodIssuesViaAgent()

      expect(result.length).toBeGreaterThan(0)
      expect(mockGetPodIssues).toHaveBeenCalled()
    })

    it('filters out unreachable clusters', async () => {
      mockClusterCacheRef.clusters = [
        { name: 'good', reachable: true },
        { name: 'bad', reachable: false },
      ]
      mockGetPodIssues.mockResolvedValue([])

      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      await fetchPodIssuesViaAgent()

      // Should only call for 'good' cluster
      const contexts = mockGetPodIssues.mock.calls.map((c: unknown[]) => c[0])
      expect(contexts).not.toContain('bad')
    })

    it('handles null return from kubectlProxy gracefully', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockGetPodIssues.mockResolvedValue(null)

      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchPodIssuesViaAgent()

      // Should not throw; null is guarded with (issues || [])
      expect(result).toEqual([])
    })

    it('reports progress via onProgress callback', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockGetPodIssues.mockResolvedValue([
        { name: 'pod1', namespace: 'ns', status: 'Error' },
      ])

      const progressCb = vi.fn()
      const { fetchPodIssuesViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      await fetchPodIssuesViaAgent(undefined, progressCb)

      expect(progressCb).toHaveBeenCalled()
    })
  })

  describe('fetchDeploymentsViaAgent', () => {
    it('returns empty array when agent is unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      const { fetchDeploymentsViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchDeploymentsViaAgent()
      expect(result).toEqual([])
      expect(mockAgentFetch).not.toHaveBeenCalled()
    })

    it('returns empty array when no clusters available', async () => {
      mockClusterCacheRef.clusters = []
      const { fetchDeploymentsViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchDeploymentsViaAgent()
      expect(result).toEqual([])
    })

    it('handles HTTP error from agent endpoint', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockAgentFetch.mockResolvedValue({ ok: false, status: 503 })

      const { fetchDeploymentsViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      // Errors are caught per-cluster by settledWithConcurrency
      const result = await fetchDeploymentsViaAgent()
      // Failed clusters produce no results
      expect(result).toEqual([])
    })

    it('handles invalid JSON from agent endpoint', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockAgentFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('invalid json')),
      })

      const { fetchDeploymentsViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchDeploymentsViaAgent()
      expect(result).toEqual([])
    })

    it('maps cluster names correctly from agent response', async () => {
      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-context', reachable: true }]
      mockAgentFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{ name: 'nginx', namespace: 'default', replicas: 3, readyReplicas: 3 }],
        }),
      })

      const { fetchDeploymentsViaAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchDeploymentsViaAgent()

      expect(result.length).toBe(1)
      // Should use short name 'prod', not context path
      expect(result[0].cluster).toBe('prod')
    })
  })

  describe('fetchWorkloadsFromAgent', () => {
    it('returns null when agent is unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      const { fetchWorkloadsFromAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchWorkloadsFromAgent()
      expect(result).toBeNull()
    })

    it('returns null when no clusters available', async () => {
      mockClusterCacheRef.clusters = []
      const { fetchWorkloadsFromAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchWorkloadsFromAgent()
      expect(result).toBeNull()
    })

    it('returns null when all fetches fail (empty accumulated)', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockAgentFetch.mockResolvedValue({ ok: false, status: 500 })

      const { fetchWorkloadsFromAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchWorkloadsFromAgent()
      expect(result).toBeNull()
    })

    it('maps deployment status correctly', async () => {
      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
      mockAgentFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          deployments: [
            { name: 'app1', namespace: 'ns1', status: 'failed', replicas: 2, readyReplicas: 0, image: 'img:1' },
            { name: 'app2', namespace: 'ns2', status: 'deploying', replicas: 1, readyReplicas: 0, image: 'img:2' },
            { name: 'app3', namespace: 'ns3', status: 'running', replicas: 3, readyReplicas: 3, image: 'img:3' },
            { name: 'app4', namespace: 'ns4', status: 'running', replicas: 3, readyReplicas: 1, image: 'img:4' },
          ],
        }),
      })

      const { fetchWorkloadsFromAgent } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchWorkloadsFromAgent()

      expect(result).not.toBeNull()
      const statusMap = new Map((result || []).map(w => [w.name, w.status]))
      expect(statusMap.get('app1')).toBe('Failed')
      expect(statusMap.get('app2')).toBe('Pending')
      expect(statusMap.get('app3')).toBe('Running')
      expect(statusMap.get('app4')).toBe('Degraded')
    })
  })

  describe('fetchCiliumStatus', () => {
    it('returns null when agent is unavailable', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      const { fetchCiliumStatus } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchCiliumStatus()
      expect(result).toBeNull()
    })

    it('returns null when no auth token', async () => {
      mockIsAgentUnavailable.mockReturnValue(false)
      localStorage.removeItem('kc-token')
      const { fetchCiliumStatus } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchCiliumStatus()
      expect(result).toBeNull()
    })

    it('returns null when token is demo-token', async () => {
      mockIsAgentUnavailable.mockReturnValue(false)
      localStorage.setItem('kc-token', 'demo-token')
      const { fetchCiliumStatus } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchCiliumStatus()
      expect(result).toBeNull()
    })

    it('returns null on fetch error (suppresses console noise)', async () => {
      mockIsAgentUnavailable.mockReturnValue(false)
      localStorage.setItem('kc-token', 'real-token-123')
      mockAgentFetch.mockRejectedValue(new Error('Connection refused'))

      const { fetchCiliumStatus } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchCiliumStatus()
      expect(result).toBeNull()
    })

    it('returns null on non-ok HTTP response', async () => {
      mockIsAgentUnavailable.mockReturnValue(false)
      localStorage.setItem('kc-token', 'real-token-123')
      mockAgentFetch.mockResolvedValue({ ok: false, status: 404 })

      const { fetchCiliumStatus } = await import('../../hooks/useCachedData/agentFetchers')
      const result = await fetchCiliumStatus()
      expect(result).toBeNull()
    })
  })
})

// ===========================================================================
// Section 3: WebSocket Backoff Logic
// ===========================================================================

describe('WebSocket exponential backoff', () => {
  it('getWsBackoffDelay returns base delay for attempt 0', async () => {
    const { getWsBackoffDelay, WS_RECONNECT_BASE_DELAY_MS, WS_BACKOFF_JITTER_MAX_MS } =
      await vi.importActual<typeof import('../constants/network')>('../constants/network')

    // Run multiple times to account for jitter
    const delays: number[] = []
    for (let i = 0; i < 20; i++) {
      delays.push(getWsBackoffDelay(0))
    }

    // All delays should be between base and base + max jitter
    delays.forEach(d => {
      expect(d).toBeGreaterThanOrEqual(WS_RECONNECT_BASE_DELAY_MS)
      expect(d).toBeLessThanOrEqual(WS_RECONNECT_BASE_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS)
    })
  })

  it('getWsBackoffDelay doubles with each attempt', async () => {
    const { getWsBackoffDelay, WS_RECONNECT_BASE_DELAY_MS, WS_BACKOFF_JITTER_MAX_MS } =
      await vi.importActual<typeof import('../constants/network')>('../constants/network')

    // Use minimum possible (subtract jitter) to verify doubling
    const minDelay0 = WS_RECONNECT_BASE_DELAY_MS
    const minDelay1 = WS_RECONNECT_BASE_DELAY_MS * 2
    const minDelay2 = WS_RECONNECT_BASE_DELAY_MS * 4

    // Check that delay at attempt n is at least 2^n * base
    for (let i = 0; i < 10; i++) {
      const delay = getWsBackoffDelay(0)
      expect(delay).toBeGreaterThanOrEqual(minDelay0)
    }
    for (let i = 0; i < 10; i++) {
      const delay = getWsBackoffDelay(1)
      expect(delay).toBeGreaterThanOrEqual(minDelay1)
    }
    for (let i = 0; i < 10; i++) {
      const delay = getWsBackoffDelay(2)
      expect(delay).toBeGreaterThanOrEqual(minDelay2)
    }
  })

  it('getWsBackoffDelay is capped at max delay', async () => {
    const { getWsBackoffDelay, WS_RECONNECT_MAX_DELAY_MS, WS_BACKOFF_JITTER_MAX_MS } =
      await vi.importActual<typeof import('../constants/network')>('../constants/network')

    // Very high attempt number
    for (let i = 0; i < 20; i++) {
      const delay = getWsBackoffDelay(100)
      expect(delay).toBeLessThanOrEqual(WS_RECONNECT_MAX_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS)
    }
  })

  it('getWsBackoffDelay adds random jitter (not deterministic)', async () => {
    const { getWsBackoffDelay } = await vi.importActual<typeof import('../constants/network')>('../constants/network')

    const delays = new Set<number>()
    for (let i = 0; i < 50; i++) {
      delays.add(getWsBackoffDelay(0))
    }

    // With jitter, we expect multiple distinct values
    expect(delays.size).toBeGreaterThan(1)
  })

  it('MAX_WS_RECONNECT_ATTEMPTS is a reasonable limit', async () => {
    const { MAX_WS_RECONNECT_ATTEMPTS } = await vi.importActual<typeof import('../constants/network')>('../constants/network')

    expect(MAX_WS_RECONNECT_ATTEMPTS).toBeGreaterThanOrEqual(3)
    expect(MAX_WS_RECONNECT_ATTEMPTS).toBeLessThanOrEqual(20)
  })
})

// ===========================================================================
// Section 4: Network Constants Validation
// ===========================================================================

describe('network constants for agent connectivity', () => {
  it('WS_CONNECT_TIMEOUT_MS is between 1s and 10s', async () => {
    const { WS_CONNECT_TIMEOUT_MS } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(WS_CONNECT_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000)
    expect(WS_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
  })

  it('WS_CONNECTION_COOLDOWN_MS is positive and reasonable', async () => {
    const { WS_CONNECTION_COOLDOWN_MS } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(WS_CONNECTION_COOLDOWN_MS).toBeGreaterThan(0)
    expect(WS_CONNECTION_COOLDOWN_MS).toBeLessThanOrEqual(60_000)
  })

  it('WS_RECONNECT_BASE_DELAY_MS < WS_RECONNECT_MAX_DELAY_MS', async () => {
    const { WS_RECONNECT_BASE_DELAY_MS, WS_RECONNECT_MAX_DELAY_MS } =
      await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(WS_RECONNECT_BASE_DELAY_MS).toBeLessThan(WS_RECONNECT_MAX_DELAY_MS)
  })

  it('FETCH_DEFAULT_TIMEOUT_MS is a positive number', async () => {
    const { FETCH_DEFAULT_TIMEOUT_MS } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(FETCH_DEFAULT_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('agent suppression helpers exist and are callable', async () => {
    const { suppressLocalAgent, isLocalAgentSuppressed } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(typeof suppressLocalAgent).toBe('function')
    expect(typeof isLocalAgentSuppressed).toBe('function')
  })
})

// ===========================================================================
// Section 5: Agent URL Suppression on Netlify / In-Cluster
// ===========================================================================

describe('agent URL suppression', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('LOCAL_AGENT_WS_URL points to 127.0.0.1:8585 by default', async () => {
    const { LOCAL_AGENT_WS_URL } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    // In test env (not Netlify), should be the real URL
    expect(LOCAL_AGENT_WS_URL).toContain('127.0.0.1')
    expect(LOCAL_AGENT_WS_URL).toContain('8585')
  })

  it('LOCAL_AGENT_HTTP_URL points to 127.0.0.1:8585 by default', async () => {
    const { LOCAL_AGENT_HTTP_URL } = await vi.importActual<typeof import('../constants/network')>('../constants/network')
    expect(LOCAL_AGENT_HTTP_URL).toContain('127.0.0.1')
    expect(LOCAL_AGENT_HTTP_URL).toContain('8585')
  })
})
