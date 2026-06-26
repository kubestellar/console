import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const {
  mockAgentFetch,
  mockConnectSharedWebSocket,
  mockFullFetchClusters,
  mockSubscribePolling,
  mockTriggerAggressiveDetection,
  sharedState,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockConnectSharedWebSocket: vi.fn(),
  mockFullFetchClusters: vi.fn(),
  mockSubscribePolling: vi.fn(() => vi.fn()),
  mockTriggerAggressiveDetection: vi.fn(() => Promise.resolve()),
  sharedState: {
    initialFetchStarted: false,
    clusterCache: {
      clusters: [],
      lastUpdated: null,
      consecutiveFailures: 0,
      isFailed: false,
      isLoading: true,
      isRefreshing: false,
      error: null,
      lastRefresh: null,
    },
  },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
}))

vi.mock('../../useLocalAgent', () => ({
  triggerAggressiveDetection: () => mockTriggerAggressiveDetection(),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585' }
})

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 15_000,
  CLUSTER_POLL_INTERVAL_MS: 30_000,
  getEffectiveInterval: (ms: number) => ms,
  get clusterCache() {
    return sharedState.clusterCache
  },
  subscribeClusterData: () => () => {},
  subscribeClusterUI: () => () => {},
  connectSharedWebSocket: () => mockConnectSharedWebSocket(),
  fullFetchClusters: () => mockFullFetchClusters(),
  get initialFetchStarted() {
    return sharedState.initialFetchStarted
  },
  deduplicateClustersByServer: (clusters: Array<{ name: string; server?: string }>) => {
    const seen = new Map<string, { name: string; server?: string }>()
    clusters.forEach(cluster => {
      const key = cluster.server || cluster.name
      if (!seen.has(key)) {
        seen.set(key, cluster)
      }
    })
    return Array.from(seen.values())
  },
  shareMetricsBetweenSameServerClusters: <T,>(clusters: T[]) => clusters,
  sharedWebSocket: { connecting: false, ws: null },
  fetchSingleClusterHealth: vi.fn(),
  shouldMarkOffline: vi.fn(() => false),
  recordClusterFailure: vi.fn(),
  clearClusterFailure: vi.fn(),
  setInitialFetchStarted: (value: boolean) => {
    sharedState.initialFetchStarted = value
  },
  setHealthCheckFailures: vi.fn(),
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

import { useClusters, useMCPStatus } from '../clusters'

describe('clusters smoke coverage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-token')
    sharedState.initialFetchStarted = false
    sharedState.clusterCache = {
      clusters: [
        {
          name: 'cluster-a',
          context: 'cluster-a',
          server: 'https://same-server.example.com',
          cpuCores: 4,
          reachable: true,
        },
        {
          name: 'cluster-a-alias',
          context: 'cluster-a-alias',
          server: 'https://same-server.example.com',
          reachable: true,
        },
      ],
      lastUpdated: null,
      consecutiveFailures: 0,
      isFailed: false,
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastRefresh: null,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bootstraps cluster polling from the shared cache and opens the shared websocket', async () => {
    const { result } = renderHook(() => useClusters())

    expect(result.current.clusters).toHaveLength(2)
    expect(result.current.deduplicatedClusters).toHaveLength(1)
    expect(result.current.metricsCompleteness).toEqual({
      contributingClusters: ['cluster-a'],
      missingClusters: [],
      isComplete: true,
    })
    expect(mockFullFetchClusters).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(mockConnectSharedWebSocket).toHaveBeenCalledTimes(1)
    })
    expect(mockSubscribePolling).toHaveBeenCalledWith('clusters', 30_000, expect.any(Function))
  })

  it('reports MCP status success and failure states', async () => {
    mockAgentFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ connected: true, version: '1.2.3' }),
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValue(new Error('offline'))

    const success = renderHook(() => useMCPStatus())
    expect(success.result.current.isLoading).toBe(true)

    await waitFor(() => expect(success.result.current.isLoading).toBe(false))
    expect(success.result.current.status).toEqual({ connected: true, version: '1.2.3' })
    expect(success.result.current.error).toBeNull()
    expect(mockSubscribePolling).toHaveBeenCalledWith('mcpStatus', 15_000, expect.any(Function))

    const failure = renderHook(() => useMCPStatus())
    await waitFor(() => expect(failure.result.current.isLoading).toBe(false))
    expect(failure.result.current.status).toBeNull()
    expect(failure.result.current.error).toBe('MCP bridge not available')
  })
})
