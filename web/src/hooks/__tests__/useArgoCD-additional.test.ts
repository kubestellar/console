import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Increase test timeout for hooks with retry/backoff logic
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
vi.mock('../../lib/cache', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  const FAILURE_THRESHOLD = 3
  const actual = await importOriginal<typeof import('../../lib/cache')>()

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
    ...actual,
    useCache: useCacheMock,
    createCachedHook: ({ fetcher, initialData }: {
      fetcher: () => Promise<unknown>; initialData: unknown; [k: string]: unknown
    }) => () => useCacheMock({ fetcher, initialData }),
  }
})

import {
  useArgoCDApplications,
  useArgoCDHealth,
  useArgoCDTriggerSync,
  useArgoCDSyncStatus,
  type ArgoApplication,
} from '../useArgoCD'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid ArgoApplication */
function makeApp(overrides: Partial<ArgoApplication> = {}): ArgoApplication {
  return {
    name: 'test-app',
    namespace: 'argocd',
    cluster: 'prod-cluster',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    source: {
      repoURL: 'https://github.com/example-org/test-app',
      path: 'k8s',
      targetRevision: 'main',
    },
    lastSynced: '2 minutes ago',
    ...overrides,
  }
}

/** Create a Response-like object from JSON data */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()

  // Default: all fetches reject (simulates API unavailable)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not available')))

  // Reset mock return values to defaults
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: [{ name: 'prod-cluster', reachable: true }],
    clusters: [{ name: 'prod-cluster', reachable: true }],
    isLoading: false,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [],
    setSelectedClusters: vi.fn(),
    selectedNamespaces: [],
    setSelectedNamespaces: vi.fn(),
    isAllClustersSelected: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

describe('useArgoCDHealth — additional coverage', () => {
  it('falls back to mock health data when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    expect(result.current.healthyPercent).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('uses real health data when API returns non-demo stats', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { healthy: 10, degraded: 2, progressing: 1, missing: 0, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.healthy).toBe(10)
    expect(result.current.stats.degraded).toBe(2)
    expect(result.current.total).toBe(13)
    unmount()
  })

  it('falls back to mock when API indicates isDemoData in error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'not installed' }, 503)
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('computes healthyPercent correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { healthy: 8, degraded: 0, progressing: 2, missing: 0, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.healthyPercent).toBe(80) // 8/10 * 100
    unmount()
  })

  it('healthyPercent is 0 when total is 0', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.healthyPercent).toBe(0)
    expect(result.current.total).toBe(0)
    unmount()
  })

  it('ignores retired legacy health localStorage entries', async () => {
    localStorage.setItem('kc-argocd-health-cache', JSON.stringify({
      data: { healthy: 5, degraded: 1, progressing: 0, missing: 0, unknown: 0 },
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.healthy).not.toBe(5)
    expect(result.current.stats.degraded).not.toBe(1)
    unmount()
  })

  it('sets isLoading false with no clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(0)
    unmount()
  })
})

describe('useArgoCDSyncStatus — additional coverage', () => {
  it('falls back to mock sync data when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    expect(result.current.syncedPercent).toBeGreaterThan(0)
    unmount()
  })

  it('uses real sync data when API returns non-demo stats', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 15, outOfSync: 3, unknown: 1 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.synced).toBe(15)
    expect(result.current.stats.outOfSync).toBe(3)
    expect(result.current.total).toBe(19)
    unmount()
  })

  it('computes syncedPercent and outOfSyncPercent correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 8, outOfSync: 2, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.syncedPercent).toBe(80)
    expect(result.current.outOfSyncPercent).toBe(20)
    unmount()
  })

  it('syncedPercent is 0 when total is 0', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 0, outOfSync: 0, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.syncedPercent).toBe(0)
    expect(result.current.outOfSyncPercent).toBe(0)
    unmount()
  })

  it('applies localClusterFilter when provided', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus(['filtered-1', 'filtered-2']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('ignores retired legacy sync localStorage entries', async () => {
    localStorage.setItem('kc-argocd-sync-cache', JSON.stringify({
      data: { synced: 7, outOfSync: 2, unknown: 1 },
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.synced).not.toBe(7)
    expect(result.current.stats.outOfSync).not.toBe(2)
    unmount()
  })
})

describe('useArgoCDTriggerSync — additional coverage', () => {
  it('returns expected shape with all properties', () => {
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    expect(result.current).toHaveProperty('triggerSync')
    expect(result.current).toHaveProperty('isSyncing')
    expect(result.current).toHaveProperty('lastResult')
    expect(result.current.isSyncing).toBe(false)
    expect(result.current.lastResult).toBeNull()
    unmount()
  })

  it('sends sync request to API and returns success result', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: unknown
    await act(async () => {
      syncResult = await result.current.triggerSync('my-app', 'argocd', 'prod-cluster')
    })

    expect(syncResult).toEqual({ success: true })
    expect(result.current.isSyncing).toBe(false)
    expect(result.current.lastResult).toEqual({ success: true })
    unmount()
  })

  it('returns error from API when sync fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: 'app not found' })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: unknown
    await act(async () => {
      syncResult = await result.current.triggerSync('missing-app', 'argocd')
    })

    expect(syncResult).toEqual({ success: false, error: 'app not found' })
    expect(result.current.lastResult).toEqual({ success: false, error: 'app not found' })
    unmount()
  })

  it('falls back to simulated sync on network error (demo mode)', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: unknown
    await act(async () => {
      const promise = result.current.triggerSync('app', 'ns')
      await vi.advanceTimersByTimeAsync(2000)
      syncResult = await promise
    })

    expect(syncResult).toEqual({ success: true })
    expect(result.current.isSyncing).toBe(false)
    unmount()
  })

  it('triggerSync without cluster param uses empty string', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    await act(async () => {
      await result.current.triggerSync('app', 'ns')
    })

    const callBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1]?.body as string) || '{}')
    expect(callBody.cluster).toBe('')
    unmount()
  })
})

describe('cache helpers — additional coverage', () => {
  it('saveToCache handles storage errors silently', async () => {
    // Fill localStorage to simulate quota
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })

    // The hook should not throw even if cache write fails
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Hook still works despite cache save failure
    expect(result.current.isDemoData).toBe(true)
    vi.mocked(localStorage.setItem).mockImplementation(originalSetItem)
    unmount()
  })
})
