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

    expect(result.current.error).toBe('Failed to fetch ApplicationSets')
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

  it('caches applicationSets to localStorage after successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeAppSet()], isDemoData: false })
    )

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const cached = localStorage.getItem('kc-argocd-appsets-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(false)
    expect(parsed.data).toHaveLength(1)
    expect(parsed.timestamp).toBeTypeOf('number')
    unmount()
  })

  it('loads from valid cache on initialization', () => {
    const cachedAppSets = [makeAppSet({ name: 'cached-appset' })]
    localStorage.setItem('kc-argocd-appsets-cache', JSON.stringify({
      data: cachedAppSets,
      timestamp: Date.now(),
      isDemoData: false,
    }))

    const { result, unmount } = renderHook(() => useArgoApplicationSets())
    expect(result.current.applicationSets).toHaveLength(1)
    expect(result.current.applicationSets[0].name).toBe('cached-appset')
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.isLoading).toBe(false)
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
