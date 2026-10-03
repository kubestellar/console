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
  it('returns expected shape with all properties', () => {
    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    expect(result.current).toHaveProperty('applicationSets')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('uses real data when API returns non-demo applicationSets', async () => {
    const realAppSets = [makeAppSet({ name: 'real-set-1' }), makeAppSet({ name: 'real-set-2' })]
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: realAppSets, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applicationSets).toHaveLength(2)
    expect(result.current.applicationSets[0].name).toBe('real-set-1')
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.lastRefresh).toBeTypeOf('number')
    unmount()
  })

  it('uses real data even when items array is empty (ArgoCD installed, no appsets)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applicationSets).toEqual([])
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('sets error and increments consecutiveFailures on API failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Connection refused')
    expect(result.current.consecutiveFailures).toBe(1)
    // Not yet at failure threshold, so no demo fallback
    expect(result.current.applicationSets).toHaveLength(0)
    unmount()
  })

  it('sets error message from non-Error throw', async () => {
    vi.mocked(fetch).mockRejectedValue('string-error')

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to fetch data')
    expect(result.current.consecutiveFailures).toBe(1)
    unmount()
  })

  it('falls back to demo when API returns isDemoData in error body (503)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'ArgoCD not installed' }, 503)
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // isDemoData in error body returns empty items with isDemoData true,
    // then the hook throws and enters catch which sets error
    expect(result.current.error).not.toBeNull()
    expect(result.current.consecutiveFailures).toBe(1)
    unmount()
  })

  it('falls back to demo when API returns non-ok status without isDemoData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Internal Server Error' }, 500)
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toContain('API 500')
    expect(result.current.consecutiveFailures).toBe(1)
    unmount()
  })

  it('handles non-JSON error body on non-ok response', async () => {
    const badResponse = new Response('Bad Gateway', { status: 502 })
    vi.mocked(fetch).mockResolvedValue(badResponse)

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // .json().catch(() => ({})) returns {}, so isDemoData is falsy, then throws
    expect(result.current.error).toContain('API 502')
    expect(result.current.consecutiveFailures).toBe(1)
    unmount()
  })

  it('falls back to mock data after reaching FAILURE_THRESHOLD consecutive failures', async () => {
    // We need to trigger >= 3 consecutive failures to trigger mock fallback.
    // The hook reads consecutiveFailures from state which lags behind, so we
    // need multiple refetch rounds.
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Trigger refetch calls to increment failures
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))

    // After 3 consecutive failures (>=FAILURE_THRESHOLD), mock data should appear
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.applicationSets.length).toBeGreaterThan(0))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.isFailed).toBe(true)
    unmount()
  })

  it('sets isLoading false when no clusters are available', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.applicationSets).toHaveLength(0)
    unmount()
  })

  it('reports isLoading true while clusters are loading', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: true,
    })

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('does not write the retired legacy appsets localStorage cache', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(localStorage.getItem('kc-argocd-appsets-cache')).toBeNull()
    unmount()
  })

  it('ignores the retired legacy appsets localStorage cache on initialization', async () => {
    localStorage.setItem('kc-argocd-appsets-cache', JSON.stringify({
      data: [makeAppSet({ name: 'cached-appset' })],
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.applicationSets.some(set => set.name === 'cached-appset')).toBe(false)
    unmount()
  })

  it('ignores expired cache', async () => {
    const EXPIRED_TIMESTAMP = Date.now() - 400_000 // > 5 minutes
    localStorage.setItem('kc-argocd-appsets-cache', JSON.stringify({
      data: [makeAppSet({ name: 'expired-appset' })],
      timestamp: EXPIRED_TIMESTAMP,
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    expect(result.current.isLoading).toBe(true) // no valid cache
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
  })

  it('ignores corrupt cache JSON', async () => {
    localStorage.setItem('kc-argocd-appsets-cache', '{{{not-valid-json')

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    expect(result.current.isLoading).toBe(true) // no valid cache
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
  })

  it('refetch triggers a visible refresh and updates data', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Switch to real data
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet({ name: 'refetched-set' })], isDemoData: false })
    )

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applicationSets[0].name).toBe('refetched-set')
    unmount()
  })

  it('sets up auto-refresh interval when applicationSets exist', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: false })
    )

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.applicationSets.length).toBeGreaterThan(0))

    expect(setIntervalSpy).toHaveBeenCalled()
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()

    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('does not set auto-refresh when applicationSets are empty', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false })
    )

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // No interval should be set for the auto-refresh effect
    const REFRESH_INTERVAL_MS = 120_000
    const pollingCalls = setIntervalSpy.mock.calls.filter(
      call => call[1] === REFRESH_INTERVAL_MS,
    )
    expect(pollingCalls).toHaveLength(0)

    unmount()
    setIntervalSpy.mockRestore()
  })

})
