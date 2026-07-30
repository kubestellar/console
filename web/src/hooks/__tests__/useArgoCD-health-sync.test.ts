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

// ============================================================================
// useArgoCDHealth
// ============================================================================

describe('useArgoCDHealth', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    expect(result.current).toHaveProperty('stats')
    expect(result.current).toHaveProperty('total')
    expect(result.current).toHaveProperty('healthyPercent')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    unmount()
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('calculates healthyPercent correctly from mock data', async () => {
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const { stats, total, healthyPercent } = result.current
    const expectedTotal = stats.healthy + stats.degraded + stats.progressing + stats.missing + stats.unknown
    expect(total).toBe(expectedTotal)
    expect(healthyPercent).toBeCloseTo((stats.healthy / total) * 100, 1)
    expect(healthyPercent).toBeGreaterThanOrEqual(0)
    expect(healthyPercent).toBeLessThanOrEqual(100)
    unmount()
  })

  it('uses real health data when API returns non-demo stats', async () => {
    const realStats = { healthy: 10, degraded: 2, progressing: 1, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.healthy).toBe(10)
    expect(result.current.stats.degraded).toBe(2)
    expect(result.current.total).toBe(13)
    const EXPECTED_PERCENT = (10 / 13) * 100
    expect(result.current.healthyPercent).toBeCloseTo(EXPECTED_PERCENT, 1)
    unmount()
  })

  it('falls back to demo when API responds with isDemoData in error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'ArgoCD unavailable' }, 503)
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('uses real data when API returns 0-total stats with isDemoData false', async () => {
    const zeroStats = { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: zeroStats, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Zero total with isDemoData=false is kept as real data (#4201)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    expect(result.current.healthyPercent).toBe(0)
    unmount()
  })

  it('does not write the retired legacy health localStorage cache', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(localStorage.getItem('kc-argocd-health-cache')).toBeNull()
    unmount()
  })

  it('ignores the retired legacy health localStorage cache on initialization', async () => {
    localStorage.setItem('kc-argocd-health-cache', JSON.stringify({
      data: { healthy: 5, degraded: 1, progressing: 0, missing: 0, unknown: 0 },
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.healthy).not.toBe(5)
    unmount()
  })

  it('sets isLoading false when no clusters available', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(0)
    expect(result.current.healthyPercent).toBe(0)
    unmount()
  })

  it('respects global cluster filter (selectedClusters)', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-a', reachable: true },
        { name: 'cluster-b', reachable: true },
        { name: 'cluster-c', reachable: true },
      ],
      clusters: [
        { name: 'cluster-a', reachable: true },
        { name: 'cluster-b', reachable: true },
        { name: 'cluster-c', reachable: true },
      ],
      isLoading: false,
    })

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['cluster-a', 'cluster-b'],
      setSelectedClusters: vi.fn(),
      selectedNamespaces: [],
      setSelectedNamespaces: vi.fn(),
      isAllClustersSelected: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('handles non-ok response without isDemoData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Server Error' }, 500)
    )

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('sets up an auto-refresh interval when health data exists', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0))

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })
})

// ============================================================================
// useArgoCDTriggerSync
// ============================================================================

describe('useArgoCDTriggerSync', () => {
  it('returns a triggerSync function, isSyncing, and lastResult', () => {
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    expect(typeof result.current.triggerSync).toBe('function')
    expect(result.current.isSyncing).toBe(false)
    expect(result.current.lastResult).toBeNull()
    unmount()
  })

  it('calls the real API and returns success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('my-app', 'argocd', 'prod-cluster')
    })

    expect(syncResult!.success).toBe(true)
    expect(result.current.lastResult).toEqual({ success: true })
    expect(result.current.isSyncing).toBe(false)

    // Verify POST was made with correct body. #7993 Phase 4: sync moved to
    // kc-agent at /argocd/sync (under LOCAL_AGENT_HTTP_URL).
    const callArgs = vi.mocked(fetch).mock.calls[0]
    expect(callArgs[0] as string).toContain('/argocd/sync')
    expect(callArgs[1]?.method).toBe('POST')
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.appName).toBe('my-app')
    expect(body.namespace).toBe('argocd')
    expect(body.cluster).toBe('prod-cluster')
    unmount()
  })

  it('returns API error result', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: 'App not found' })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('missing-app', 'argocd')
    })

    expect(syncResult!.success).toBe(false)
    expect(syncResult!.error).toBe('App not found')
    expect(result.current.lastResult?.success).toBe(false)
    unmount()
  })

  it('falls back to demo mode when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    let syncResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('demo-app', 'argocd')
    })

    expect(syncResult!.success).toBe(true)
    expect(result.current.isSyncing).toBe(false)
    expect(result.current.lastResult?.success).toBe(true)
    unmount()
  })

  it('passes empty string for cluster when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true })
    )

    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())

    await act(async () => {
      await result.current.triggerSync('my-app', 'argocd')
    })

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.cluster).toBe('')
    unmount()
  })
})

// ============================================================================
// useArgoCDSyncStatus
// ============================================================================

describe('useArgoCDSyncStatus', () => {
  it('returns expected shape', () => {
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    expect(result.current).toHaveProperty('stats')
    expect(result.current).toHaveProperty('total')
    expect(result.current).toHaveProperty('syncedPercent')
    expect(result.current).toHaveProperty('outOfSyncPercent')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    unmount()
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    expect(result.current.syncedPercent).toBeGreaterThan(0)
    unmount()
  })

  it('uses real sync data when API returns non-demo stats', async () => {
    const realStats = { synced: 15, outOfSync: 3, unknown: 1 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.synced).toBe(15)
    expect(result.current.stats.outOfSync).toBe(3)
    expect(result.current.total).toBe(19)
    const EXPECTED_SYNCED_PCT = (15 / 19) * 100
    const EXPECTED_OOS_PCT = (3 / 19) * 100
    expect(result.current.syncedPercent).toBeCloseTo(EXPECTED_SYNCED_PCT, 1)
    expect(result.current.outOfSyncPercent).toBeCloseTo(EXPECTED_OOS_PCT, 1)
    unmount()
  })

  it('falls back to demo when API returns isDemoData in error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'ArgoCD unavailable' }, 503)
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('uses real data when API returns 0-total sync stats with isDemoData false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 0, outOfSync: 0, unknown: 0 }, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Zero totals with isDemoData=false is kept as real data (#4201)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    expect(result.current.syncedPercent).toBe(0)
    expect(result.current.outOfSyncPercent).toBe(0)
    unmount()
  })

  it('accepts local cluster filter', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() =>
      useArgoCDSyncStatus(['cluster-a', 'cluster-b', 'cluster-c'])
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('does not write the retired legacy sync localStorage cache', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(localStorage.getItem('kc-argocd-sync-cache')).toBeNull()
    unmount()
  })

  it('ignores the retired legacy sync localStorage cache on initialization', async () => {
    localStorage.setItem('kc-argocd-sync-cache', JSON.stringify({
      data: { synced: 8, outOfSync: 2, unknown: 1 },
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.synced).not.toBe(8)
    unmount()
  })

  it('sets isLoading false with no clusters and no local filter', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(0)
    expect(result.current.syncedPercent).toBe(0)
    expect(result.current.outOfSyncPercent).toBe(0)
    unmount()
  })

  it('handles non-ok response without isDemoData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Server Error' }, 500)
    )

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('handles non-JSON error body on non-ok response', async () => {
    const badResponse = new Response('Gateway Timeout', { status: 504 })
    vi.mocked(fetch).mockResolvedValue(badResponse)

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('refetch works correctly', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 99, outOfSync: 1, unknown: 0 }, isDemoData: false })
    )

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.synced).toBe(99)
    unmount()
  })

  it('sets up an auto-refresh interval when sync data exists', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0))

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('respects selectedClusters when not all selected', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ],
      clusters: [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ],
      isLoading: false,
    })

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['c1'],
      setSelectedClusters: vi.fn(),
      selectedNamespaces: [],
      setSelectedNamespaces: vi.fn(),
      isAllClustersSelected: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })
})

// ============================================================================
// Cross-cutting: isFailed threshold
// ============================================================================

describe('isFailed threshold', () => {
  it('isFailed is false when consecutiveFailures < 3', async () => {
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook resets consecutiveFailures to 0 on fallback to demo data
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isFailed).toBe(false)
    unmount()
  })
})
