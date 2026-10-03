import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.setConfig({ testTimeout: 15_000 })

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [{ name: 'prod-cluster', reachable: true }],
  clusters: [{ name: 'prod-cluster', reachable: true }],
  isLoading: false,
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
}))

const mockUseGlobalFilters = vi.fn(() => ({
  selectedClusters: [] as string[],
  setSelectedClusters: vi.fn(),
  selectedNamespaces: [] as string[],
  setSelectedNamespaces: vi.fn(),
  isAllClustersSelected: true,
}))

vi.mock('../useGlobalFilters', () => ({
  useGlobalFilters: (...args: unknown[]) => mockUseGlobalFilters(...args),
}))

// Stateful useCache mock — calls the real fetcher, tracks consecutive failures,
// and exposes error/isFailed so the ArgoCD hook's fallback logic works correctly.
// For useArgoApplicationSets, the threshold-based fallback reads result.isFailed
// (set here after FAILURE_THRESHOLD=3 failures). For useArgoCDApplications etc.,
// the immediate fallback reads result.error !== null.
vi.mock('../../lib/cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  const FAILURE_THRESHOLD = 3

  const useCacheMock = ({
    fetcher,
    initialData,
    enabled = true,
  }: {
    fetcher: () => Promise<unknown>
    initialData: unknown
    enabled?: boolean
    [k: string]: unknown
  }) => {
    const [data, setData] = React.useState(initialData)
    const [isLoading, setIsLoading] = React.useState(!!enabled)
    const [error, setError] = React.useState<string | null>(null)
    const failuresRef = React.useRef(0)
    const [consecutiveFailures, setConsecutiveFailures] = React.useState(0)
    const [lastRefresh, setLastRefresh] = React.useState<number | null>(null)
    const fetcherRef = React.useRef(fetcher)
    fetcherRef.current = fetcher

    const doFetch = React.useCallback(() => {
      return Promise.resolve()
        .then(() => fetcherRef.current())
        .then((result: unknown) => {
          failuresRef.current = 0
          setConsecutiveFailures(0)
          setData(result)
          setError(null)
          setLastRefresh(Date.now())
          setIsLoading(false)
        })
        .catch((err: unknown) => {
          failuresRef.current += 1
          const f = failuresRef.current
          setConsecutiveFailures(f)
          setError(err instanceof Error ? err.message : 'Failed to fetch data')
          setIsLoading(false)
        })
    }, [])

    React.useEffect(() => {
      if (!enabled) { setIsLoading(false); return }
      doFetch()
    }, [enabled, doFetch])

    const isFailed = consecutiveFailures >= FAILURE_THRESHOLD
    return {
      data,
      isLoading,
      isRefreshing: false,
      isFailed,
      isDemoFallback: false,
      error,
      consecutiveFailures,
      lastRefresh,
      refetch: () => doFetch(),
      retryFetch: () => { failuresRef.current = 0; setConsecutiveFailures(0); return doFetch() },
      clearAndRefetch: () => doFetch(),
    }
  }

  return {
    useCache: useCacheMock,
    createCachedHook: ({ fetcher, initialData }: {
      fetcher: () => Promise<unknown>; initialData: unknown; [k: string]: unknown
    }) => () => useCacheMock({ fetcher, initialData }),
  }
})

import {
  useArgoApplicationSets,
  type ArgoApplicationSet,
} from '../useArgoCD'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeAppSet(overrides: Partial<ArgoApplicationSet> = {}): ArgoApplicationSet {
  return {
    name: 'platform-services',
    namespace: 'argocd',
    cluster: 'prod-cluster',
    generators: ['clusters'],
    template: '{{name}}-platform',
    syncPolicy: 'Automated',
    status: 'Healthy',
    appCount: 5,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not available')))

  mockUseClusters.mockReturnValue({
    deduplicatedClusters: [{ name: 'prod-cluster', reachable: true }],
    clusters: [{ name: 'prod-cluster', reachable: true }],
    isLoading: false,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [] as string[],
    setSelectedClusters: vi.fn(),
    selectedNamespaces: [] as string[],
    setSelectedNamespaces: vi.fn(),
    isAllClustersSelected: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

// ============================================================================
// useArgoApplicationSets — full coverage (previously untested)
// ============================================================================

describe('useArgoApplicationSets', () => {

  it('generates mock appsets distributed across multiple clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-even', reachable: true },
        { name: 'cluster-odd', reachable: true },
      ],
      clusters: [
        { name: 'cluster-even', reachable: true },
        { name: 'cluster-odd', reachable: true },
      ],
      isLoading: false,
    })

    // Force failure threshold to trigger mock data generation
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())

    // Need to hit failure threshold (3) to get mock data
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))
    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect(result.current.applicationSets.length).toBeGreaterThan(0))

    // Even-index clusters get templates 0-1, odd-index get templates 2-3
    const evenClusterSets = result.current.applicationSets.filter(
      s => s.cluster === 'cluster-even'
    )
    const oddClusterSets = result.current.applicationSets.filter(
      s => s.cluster === 'cluster-odd'
    )
    expect(evenClusterSets.length).toBe(2)
    expect(oddClusterSets.length).toBe(2)
    // Even gets templates starting at index 0 (platform-services, microservices-fleet)
    expect(evenClusterSets.some(s => s.name === 'platform-services')).toBe(true)
    // Odd gets templates starting at index 2 (monitoring-stack, multi-region-apps)
    expect(oddClusterSets.some(s => s.name === 'monitoring-stack')).toBe(true)
    unmount()
  })

  it('isFailed is true when consecutiveFailures >= FAILURE_THRESHOLD', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    expect(result.current.isFailed).toBe(false)

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))
    expect(result.current.isFailed).toBe(false)

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))
    expect(result.current.isFailed).toBe(true)

    unmount()
  })

  it('does not throw on unmount', () => {
    const { unmount } = renderHook(() => useArgoApplicationSets())
    expect(() => unmount()).not.toThrow()
  })

  it('handles API returning isDemoData true in success body (200)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: true })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // isDemoData: true causes the hook to throw and enter catch path
    expect(result.current.error).not.toBeNull()
    expect(result.current.consecutiveFailures).toBe(1)
    unmount()
  })

  it('resets consecutiveFailures on successful real data fetch', async () => {
    // First call fails
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Second call succeeds
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: false })
    )
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
    unmount()
  })
})

// ============================================================================
// Additional edge cases for existing hooks to fill remaining coverage gaps
// ============================================================================

