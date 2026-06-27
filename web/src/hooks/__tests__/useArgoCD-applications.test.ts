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
// useArgoCDApplications
// ============================================================================

describe('useArgoCDApplications', () => {
  it('returns expected shape with all properties', () => {
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    expect(result.current).toHaveProperty('applications')
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

  it('falls back to demo data when fetch rejects', async () => {
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
    unmount()
  })

  it('uses real data when API returns non-demo applications', async () => {
    const realApps = [makeApp({ name: 'real-app-1' }), makeApp({ name: 'real-app-2' })]
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: realApps, isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applications).toHaveLength(2)
    expect(result.current.applications[0].name).toBe('real-app-1')
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.lastRefresh).toBeTypeOf('number')
    unmount()
  })

  it('falls back to demo when API returns isDemoData: true in error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'ArgoCD not installed' }, 503)
    )

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // isDemoData response from the API causes fallback to mock data
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })

  it('falls back to demo when API returns non-ok status without isDemoData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Internal Server Error' }, 500)
    )

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })

  it('uses real data when API returns empty items with isDemoData false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Empty items with isDemoData=false is kept as real data (#4201)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applications).toEqual([])
    unmount()
  })

  it('does not write the retired legacy applications localStorage cache', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(localStorage.getItem('kc-argocd-apps-cache')).toBeNull()
    unmount()
  })

  it('ignores the retired legacy applications localStorage cache on initialization', async () => {
    localStorage.setItem('kc-argocd-apps-cache', JSON.stringify({
      data: [makeApp({ name: 'cached-app' })],
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDApplications())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.applications.some(app => app.name === 'cached-app')).toBe(false)
    unmount()
  })

  it('ignores expired cache', async () => {
    const EXPIRED_TIMESTAMP = Date.now() - 400_000 // > 5 minutes
    localStorage.setItem('kc-argocd-apps-cache', JSON.stringify({
      data: [makeApp({ name: 'expired-app' })],
      timestamp: EXPIRED_TIMESTAMP,
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    // Cache is expired, so hook starts in loading state (no cached data)
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have fetched fresh data (falls back to demo since fetch rejects)
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('ignores corrupt cache JSON', async () => {
    localStorage.setItem('kc-argocd-apps-cache', 'not-valid-json{{{')

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('sets isLoading false with no clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.applications).toHaveLength(0)
    unmount()
  })

  it('reports isLoading true while clusters are loading', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: true,
    })

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('handles refetch correctly', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now switch to real data
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp({ name: 'refetched' })], isDemoData: false })
    )

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applications[0].name).toBe('refetched')
    unmount()
  })

  it('does not throw on unmount', () => {
    const { unmount } = renderHook(() => useArgoCDApplications())
    expect(() => unmount()).not.toThrow()
  })

  it('shows demo data after fetch fails and unmounts cleanly', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.applications.length).toBeGreaterThan(0))

    expect(result.current.isDemoData).toBe(true)
    expect(() => unmount()).not.toThrow()
  })

  it('includes auth token in headers when present', async () => {
    localStorage.setItem('token', 'my-jwt-token')
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp()], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetch).toHaveBeenCalled()
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-jwt-token')
    unmount()
  })

  it('generates mock apps based on cluster names', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'prod-east', reachable: true },
        { name: 'staging-west', reachable: true },
        { name: 'dev-local', reachable: true },
      ],
      clusters: [
        { name: 'prod-east', reachable: true },
        { name: 'staging-west', reachable: true },
        { name: 'dev-local', reachable: true },
      ],
      isLoading: false,
    })

    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    // prod clusters get first 3 apps, staging gets last 2, others get all 4
    const prodApps = result.current.applications.filter(a => a.cluster === 'prod-east')
    const stagingApps = result.current.applications.filter(a => a.cluster === 'staging-west')
    const devApps = result.current.applications.filter(a => a.cluster === 'dev-local')
    expect(prodApps.length).toBe(3)
    expect(stagingApps.length).toBe(2)
    expect(devApps.length).toBe(4)
    unmount()
  })

  it('falls back to demo when res.json() throws on non-ok response', async () => {
    // Simulate a non-ok response where .json() also fails (non-JSON error body)
    const badResponse = new Response('Bad Gateway', { status: 502 })
    vi.mocked(fetch).mockResolvedValue(badResponse)

    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })
})
