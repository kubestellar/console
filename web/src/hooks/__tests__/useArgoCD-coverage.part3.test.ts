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
  useArgoCDApplications,
  useArgoCDHealth,
  useArgoCDSyncStatus,
  useArgoCDTriggerSync,
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

describe('useArgoCDApplications — mock data cluster branching', () => {
  it('generates correct mock apps for staging clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'staging-us', reachable: true }],
      clusters: [{ name: 'staging-us', reachable: true }],
      isLoading: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Staging clusters get apps with idx > 1 (backend-service, monitoring-stack)
    const stagingApps = result.current.applications.filter(a => a.cluster === 'staging-us')
    expect(stagingApps.length).toBe(2)
    expect(stagingApps.some(a => a.name === 'backend-service')).toBe(true)
    expect(stagingApps.some(a => a.name === 'monitoring-stack')).toBe(true)
    unmount()
  })

  it('generates all 4 mock apps for non-prod non-staging clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'dev-local', reachable: true }],
      clusters: [{ name: 'dev-local', reachable: true }],
      isLoading: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const devApps = result.current.applications.filter(a => a.cluster === 'dev-local')
    expect(devApps.length).toBe(4)
    unmount()
  })
})

describe('useArgoCDHealth — filteredClusterCount with selected clusters', () => {
  it('uses selectedClusters length when isAllClustersSelected is false', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'a', reachable: true },
        { name: 'b', reachable: true },
        { name: 'c', reachable: true },
      ],
      clusters: [
        { name: 'a', reachable: true },
        { name: 'b', reachable: true },
        { name: 'c', reachable: true },
      ],
      isLoading: false,
    })

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['a'],
      setSelectedClusters: vi.fn(),
      selectedNamespaces: [],
      setSelectedNamespaces: vi.fn(),
      isAllClustersSelected: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // filteredClusterCount = 1 (selectedClusters.length), mock data scales accordingly
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    // With 1 cluster: healthy = floor(1 * 3.8) = 3
    expect(result.current.stats.healthy).toBe(3)
    unmount()
  })

  it('handles refetch on health hook', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { healthy: 20, degraded: 0, progressing: 0, missing: 0, unknown: 0 }, isDemoData: false })
    )

    await act(async () => { await result.current.refetch() })

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.healthy).toBe(20)
    expect(result.current.healthyPercent).toBe(100)
    unmount()
  })

  it('handles non-JSON error body on health non-ok response', async () => {
    const badResponse = new Response('Service Unavailable', { status: 503 })
    vi.mocked(fetch).mockResolvedValue(badResponse)

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    unmount()
  })
})

describe('useArgoCDSyncStatus — localClusterFilter override', () => {
  it('localClusterFilter overrides global selectedClusters count', async () => {
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['a', 'b'],
      setSelectedClusters: vi.fn(),
      selectedNamespaces: [],
      setSelectedNamespaces: vi.fn(),
      isAllClustersSelected: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    // localClusterFilter with 5 items overrides selectedClusters (2 items)
    const { result, unmount } = renderHook(() =>
      useArgoCDSyncStatus(['x1', 'x2', 'x3', 'x4', 'x5'])
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // filteredClusterCount = 5 (localClusterFilter), so:
    // synced = floor(5 * 4.2) = 21
    expect(result.current.stats.synced).toBe(21)
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('handles empty localClusterFilter (falls through to global)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus([]))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Empty localClusterFilter => uses global (1 cluster)
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.stats.synced).toBe(4) // floor(1 * 4.2)
    unmount()
  })
})

describe('useArgoCDTriggerSync — edge cases', () => {
  it('handles API returning non-JSON body on sync', async () => {
    const badResponse = new Response('Internal Error', { status: 500 })
    vi.mocked(fetch).mockResolvedValue(badResponse)

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: { success: boolean } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('app', 'ns', 'cluster')
    })

    // .json() on non-JSON throws, so falls back to demo simulated success
    expect(syncResult?.success).toBe(true)
    expect(result.current.isSyncing).toBe(false)
    unmount()
  })
})

describe('authHeaders — token presence', () => {
  it('includes Authorization when token exists in localStorage', async () => {
    localStorage.setItem('token', 'test-jwt-token')
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetch).toHaveBeenCalled()
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-jwt-token')
    expect(headers['Accept']).toBe('application/json')
    unmount()
  })

  it('omits Authorization when no token in localStorage', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['Accept']).toBe('application/json')
    unmount()
  })
})

describe('cache helpers — edge cases', () => {
  it('saveToCache survives localStorage quota error for appsets', async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })

    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Hook works despite cache write failure
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applicationSets).toHaveLength(1)
    vi.mocked(localStorage.setItem).mockImplementation(originalSetItem)
    unmount()
  })
})
