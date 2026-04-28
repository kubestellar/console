import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockClusterCacheRef } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockClusterCacheRef: {
    clusters: [] as Array<{ name: string; context?: string; server?: string; reachable?: boolean }>,
  },
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  clusterCacheRef: mockClusterCacheRef,
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
    createCachedHook: vi.fn(),
  fetchAPI: vi.fn(),
  fetchFromAllClusters: vi.fn(),
  fetchViaSSE: vi.fn(),
}))

vi.mock('../../lib/utils/concurrency', () => ({
    createCachedHook: vi.fn(),
  settledWithConcurrency: vi.fn(async () => []),
}))

vi.mock('../../lib/schemas', () => ({
    createCachedHook: vi.fn(),
  NodesResponseSchema: {},
}))

vi.mock('../../lib/schemas/validate', () => ({
    createCachedHook: vi.fn(),
  validateArrayResponse: vi.fn((_, raw: unknown) => raw),
}))

vi.mock('../useCachedData/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoCachedNodes: () => [{ name: 'demo-node', status: 'Ready', cluster: 'demo' }],
  getDemoCoreDNSStatus: () => [],
}))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 60000,
}))

import { useCachedNodes, useCachedCoreDNSStatus, useCachedAllNodes } from '../useCachedNodes'
import { fetchAPI } from '../../lib/cache/fetcherUtils'
import { settledWithConcurrency } from '../../lib/utils/concurrency'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCache(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClusterCacheRef.clusters = []
  mockUseCache.mockReturnValue(defaultCache())
})

// ---------------------------------------------------------------------------
// useCachedNodes
// ---------------------------------------------------------------------------

describe('useCachedNodes', () => {
  it('returns expected fields', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current).toHaveProperty('nodes')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('nodes aliases data', () => {
    const nodes = [{ name: 'n1', status: 'Ready', cluster: 'c1' }]
    mockUseCache.mockReturnValue(defaultCache({ data: nodes }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.nodes).toEqual(nodes)
    expect(result.current.data).toEqual(nodes)
  })

  it('passes a cache key based on cluster arg', () => {
    renderHook(() => useCachedNodes('prod'))
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('prod')
  })

  it('passes default key when no cluster given', () => {
    renderHook(() => useCachedNodes())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('all')
  })

  it('exposes isLoading from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isLoading: true }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.isLoading).toBe(true)
  })

  it('exposes isDemoFallback from cache', () => {
    mockUseCache.mockReturnValue(defaultCache({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedNodes())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('refetch is a function', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(typeof result.current.refetch).toBe('function')
  })

  it('initialData is an empty array (no crash on first render)', () => {
    const { result } = renderHook(() => useCachedNodes())
    expect(Array.isArray(result.current.nodes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useCachedCoreDNSStatus
// ---------------------------------------------------------------------------

describe('useCachedCoreDNSStatus', () => {
  it('returns expected fields', () => {
    const { result } = renderHook(() => useCachedCoreDNSStatus())
    expect(result.current).toHaveProperty('clusters')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('refetch')
  })

  it('clusters aliases data', () => {
    const clusterData = [{ cluster: 'c1', pods: [], healthy: true, totalRestarts: 0 }]
    mockUseCache.mockReturnValue(defaultCache({ data: clusterData }))
    const { result } = renderHook(() => useCachedCoreDNSStatus())
    expect(result.current.clusters).toEqual(clusterData)
  })

  it('passes a key containing coredns', () => {
    renderHook(() => useCachedCoreDNSStatus())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('coredns')
  })

  it('passes cluster name in key when cluster provided', () => {
    renderHook(() => useCachedCoreDNSStatus('my-cluster'))
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toContain('my-cluster')
  })
})

// ---------------------------------------------------------------------------
// useCachedAllNodes — Issue 9355 per-cluster error surfacing
// ---------------------------------------------------------------------------

describe('useCachedAllNodes — Issue 9355 clusterErrors surfacing', () => {
  // Helper: capture the fetcher passed to useCache so we can invoke it
  // directly with a given cluster cache + fetchAPI behaviour, then read the
  // per-cluster errors from the hook's returned `clusterErrors`.
  async function runFetcherAndGetErrors(
    clusters: Array<{ name: string; reachable?: boolean }>,
    fetchBehaviour: (cluster: string) => Promise<unknown>,
  ) {
    mockClusterCacheRef.clusters = clusters
    // Run each fan-out task sequentially so we can deterministically
    // observe which clusters produced errors.
    vi.mocked(settledWithConcurrency).mockImplementation(
      async (tasks, _concurrency, handleSettled) => {
        const results: PromiseSettledResult<unknown>[] = []
        for (const task of tasks) {
          try {
            const value = await task()
            const res: PromiseSettledResult<unknown> = { status: 'fulfilled', value }
            results.push(res)
            if (handleSettled) await handleSettled(res as PromiseSettledResult<never>)
          } catch (reason) {
            const res: PromiseSettledResult<unknown> = { status: 'rejected', reason }
            results.push(res)
            if (handleSettled) await handleSettled(res as PromiseSettledResult<never>)
          }
        }
        return results as never
      },
    )
    vi.mocked(fetchAPI).mockImplementation(
      async (_endpoint, params) => fetchBehaviour(params?.cluster as string),
    )

    // Render the hook so useCache is invoked and the fetcher option is
    // captured. The hook itself returns `clusterErrors: []` initially
    // because the module-level snapshot is empty until the fetcher runs.
    const { result, rerender } = renderHook(() => useCachedAllNodes())

    // Pull the fetcher out of the most recent mockUseCache invocation and
    // run it — this mirrors what useCache does internally when it decides
    // to refresh the cache.
    const fetcherArg = mockUseCache.mock.calls.at(-1)?.[0] as {
      fetcher: () => Promise<unknown>
    }
    expect(typeof fetcherArg?.fetcher).toBe('function')
    await fetcherArg.fetcher()

    // Re-render so useSyncExternalStore picks up the published snapshot.
    rerender()
    return result.current.clusterErrors
  }

  it('exposes clusterErrors as an array on the hook return', () => {
    const { result } = renderHook(() => useCachedAllNodes())
    expect(Array.isArray(result.current.clusterErrors)).toBe(true)
  })

  // Issue 9355 — the core acceptance criterion: when one cluster's
  // `/api/mcp/nodes` returns 403 Forbidden (RBAC denial) and another
  // returns context deadline exceeded (transient), the hook surfaces
  // both as typed per-cluster entries so the drill-down can render
  // "RBAC denied" vs "Transient timeout" instead of a single generic
  // warning.
  it('surfaces per-cluster RBAC denials and transient failures separately', async () => {
    const errors = await runFetcherAndGetErrors(
      [
        { name: 'rbac-cluster', reachable: true },
        { name: 'slow-cluster', reachable: true },
        { name: 'happy-cluster', reachable: true },
      ],
      async (cluster) => {
        if (cluster === 'rbac-cluster') {
          throw new Error('nodes is forbidden: User "u" cannot list resource "nodes"')
        }
        if (cluster === 'slow-cluster') {
          throw new Error('context deadline exceeded')
        }
        return { nodes: [{ name: 'n1', cluster, status: 'Ready' }] }
      },
    )

    expect(errors).toHaveLength(2)
    const rbac = errors.find(e => e.cluster === 'rbac-cluster')
    const slow = errors.find(e => e.cluster === 'slow-cluster')
    expect(rbac?.errorType).toBe('auth')
    expect(slow?.errorType).toBe('timeout')
  })

  it('returns empty clusterErrors when every cluster succeeds', async () => {
    const errors = await runFetcherAndGetErrors(
      [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ],
      async (cluster) => ({ nodes: [{ name: `n-${cluster}`, cluster, status: 'Ready' }] }),
    )

    expect(errors).toEqual([])
  })
})
