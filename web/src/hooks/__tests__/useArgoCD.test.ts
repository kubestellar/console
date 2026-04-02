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
  useArgoCDApplications,
  useArgoCDHealth,
  useArgoCDTriggerSync,
  useArgoCDSyncStatus,
  type ArgoApplication,
} from '../useArgoCD'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not available')))

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
      jsonResponse({ items: realApps, isDemoData: false }),
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

  it('keeps real data when API returns empty items with isDemoData=false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applications).toHaveLength(0)
    unmount()
  })

  it('falls back to demo when API returns isDemoData: true in error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ isDemoData: true, error: 'ArgoCD not installed' }, 503),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })

  it('falls back to demo when API returns non-ok status without isDemoData', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Internal Server Error' }, 500),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })

  it('caches applications to localStorage after fetch', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-apps-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(true)
    expect(parsed.data.length).toBeGreaterThan(0)
    expect(parsed.timestamp).toBeTypeOf('number')
    unmount()
  })

  it('loads from cache on initialization when cache is valid', () => {
    const cachedApps = [makeApp({ name: 'cached-app' })]
    localStorage.setItem(
      'kc-argocd-apps-cache',
      JSON.stringify({ data: cachedApps, timestamp: Date.now(), isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    expect(result.current.applications).toHaveLength(1)
    expect(result.current.applications[0].name).toBe('cached-app')
    unmount()
  })

  it('ignores expired cache', async () => {
    const EXPIRED_TIMESTAMP = Date.now() - 400_000
    localStorage.setItem(
      'kc-argocd-apps-cache',
      JSON.stringify({
        data: [makeApp({ name: 'expired-app' })],
        timestamp: EXPIRED_TIMESTAMP,
        isDemoData: false,
      }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
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
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp({ name: 'refetched' })], isDemoData: false }),
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

  it('sets up an auto-refresh interval when applications exist', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.applications.length).toBeGreaterThan(0))
    expect(setIntervalSpy).toHaveBeenCalled()
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('includes auth token in headers when present', async () => {
    localStorage.setItem('token', 'my-jwt-token')
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp()], isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetch).toHaveBeenCalled()
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-jwt-token')
    unmount()
  })

  it('does not include Authorization header when no token in localStorage', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp()], isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['Accept']).toBe('application/json')
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
    const prodApps = result.current.applications.filter(a => a.cluster === 'prod-east')
    const stagingApps = result.current.applications.filter(a => a.cluster === 'staging-west')
    const devApps = result.current.applications.filter(a => a.cluster === 'dev-local')
    expect(prodApps.length).toBe(3)
    expect(stagingApps.length).toBe(2)
    expect(devApps.length).toBe(4)
    unmount()
  })

  it('falls back to demo when res.json() throws on non-ok response', async () => {
    const badResponse = new Response('Bad Gateway', { status: 502 })
    vi.mocked(fetch).mockResolvedValue(badResponse)
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
    unmount()
  })

  it('caches real data to localStorage on successful API fetch', async () => {
    const realApps = [makeApp({ name: 'real-cached' })]
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: realApps, isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-apps-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(false)
    expect(parsed.data).toHaveLength(1)
    expect(parsed.data[0].name).toBe('real-cached')
    unmount()
  })

  it('uses AbortSignal for timeout on fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [makeApp()], isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callArgs = vi.mocked(fetch).mock.calls[0]
    expect(callArgs[1]?.signal).toBeDefined()
    unmount()
  })
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
    const expectedTotal =
      stats.healthy + stats.degraded + stats.progressing + stats.missing + stats.unknown
    expect(total).toBe(expectedTotal)
    expect(healthyPercent).toBeCloseTo((stats.healthy / total) * 100, 1)
    expect(healthyPercent).toBeGreaterThanOrEqual(0)
    expect(healthyPercent).toBeLessThanOrEqual(100)
    unmount()
  })

  it('uses real health data when API returns non-demo stats', async () => {
    const realStats = { healthy: 10, degraded: 2, progressing: 1, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false }),
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
      jsonResponse({ isDemoData: true, error: 'ArgoCD unavailable' }, 503),
    )
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('keeps real data when API returns zero-total stats with isDemoData=false', async () => {
    const zeroStats = { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: zeroStats, isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    expect(result.current.healthyPercent).toBe(0)
    unmount()
  })

  it('caches health data to localStorage', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-health-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(true)
    expect(parsed.data).toHaveProperty('healthy')
    unmount()
  })

  it('loads from valid cache on initialization', () => {
    const cachedStats = { healthy: 5, degraded: 1, progressing: 0, missing: 0, unknown: 0 }
    localStorage.setItem(
      'kc-argocd-health-cache',
      JSON.stringify({ data: cachedStats, timestamp: Date.now(), isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    expect(result.current.stats.healthy).toBe(5)
    expect(result.current.isDemoData).toBe(false)
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
      jsonResponse({ error: 'Server Error' }, 500),
    )
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('handles non-JSON error body on health endpoint', async () => {
    const badResponse = new Response('Service Unavailable', { status: 503 })
    vi.mocked(fetch).mockResolvedValue(badResponse)
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
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

  it('handles refetch correctly', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const realStats = { healthy: 20, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false }),
    )
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.stats.healthy).toBe(20)
    expect(result.current.total).toBe(20)
    const FULL_PERCENT = 100
    expect(result.current.healthyPercent).toBeCloseTo(FULL_PERCENT, 1)
    unmount()
  })

  it('caches real health data with isDemoData=false', async () => {
    const realStats = { healthy: 7, degraded: 1, progressing: 0, missing: 0, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-health-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(false)
    expect(parsed.data.healthy).toBe(7)
    unmount()
  })

  it('handles API response with missing stats field', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ isDemoData: false }))
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    unmount()
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
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }))
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    let syncResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('my-app', 'argocd', 'prod-cluster')
    })
    expect(syncResult!.success).toBe(true)
    expect(result.current.lastResult).toEqual({ success: true })
    expect(result.current.isSyncing).toBe(false)
    const callArgs = vi.mocked(fetch).mock.calls[0]
    expect(callArgs[0]).toBe('/api/gitops/argocd/sync')
    expect(callArgs[1]?.method).toBe('POST')
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.appName).toBe('my-app')
    expect(body.namespace).toBe('argocd')
    expect(body.cluster).toBe('prod-cluster')
    unmount()
  })

  it('returns API error result', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: 'App not found' }),
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
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }))
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    await act(async () => {
      await result.current.triggerSync('my-app', 'argocd')
    })
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.cluster).toBe('')
    unmount()
  })

  it('includes auth token and content-type in sync request', async () => {
    localStorage.setItem('token', 'sync-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }))
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    await act(async () => {
      await result.current.triggerSync('my-app', 'argocd')
    })
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sync-token')
    expect(headers['Content-Type']).toBe('application/json')
    unmount()
  })

  it('resets lastResult to null before each sync', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }))
    const { result, unmount } = renderHook(() => useArgoCDTriggerSync())
    await act(async () => {
      await result.current.triggerSync('app-1', 'argocd')
    })
    expect(result.current.lastResult).toEqual({ success: true })
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: 'timeout' }),
    )
    await act(async () => {
      await result.current.triggerSync('app-2', 'argocd')
    })
    expect(result.current.lastResult?.success).toBe(false)
    expect(result.current.lastResult?.error).toBe('timeout')
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
      jsonResponse({ stats: realStats, isDemoData: false }),
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
      jsonResponse({ isDemoData: true, error: 'ArgoCD unavailable' }, 503),
    )
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('keeps real data when API returns zero-total stats with isDemoData=false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: { synced: 0, outOfSync: 0, unknown: 0 }, isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    expect(result.current.syncedPercent).toBe(0)
    expect(result.current.outOfSyncPercent).toBe(0)
    unmount()
  })

  it('accepts local cluster filter', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() =>
      useArgoCDSyncStatus(['cluster-a', 'cluster-b', 'cluster-c']),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('local cluster filter overrides global cluster selection', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
        { name: 'c3', reachable: true },
      ],
      clusters: [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
        { name: 'c3', reachable: true },
      ],
      isLoading: false,
    })
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['c1', 'c2', 'c3'],
      setSelectedClusters: vi.fn(),
      selectedNamespaces: [],
      setSelectedNamespaces: vi.fn(),
      isAllClustersSelected: true,
    })
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() =>
      useArgoCDSyncStatus(['local-a', 'local-b']),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
    unmount()
  })

  it('caches sync data to localStorage', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-sync-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(true)
    expect(parsed.data).toHaveProperty('synced')
    unmount()
  })

  it('loads from valid cache on initialization', () => {
    const cachedStats = { synced: 8, outOfSync: 2, unknown: 1 }
    localStorage.setItem(
      'kc-argocd-sync-cache',
      JSON.stringify({ data: cachedStats, timestamp: Date.now(), isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    expect(result.current.stats.synced).toBe(8)
    expect(result.current.isDemoData).toBe(false)
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
      jsonResponse({ error: 'Server Error' }, 500),
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
      jsonResponse({ stats: { synced: 99, outOfSync: 1, unknown: 0 }, isDemoData: false }),
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

  it('caches real sync data with isDemoData=false', async () => {
    const realStats = { synced: 12, outOfSync: 3, unknown: 0 }
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ stats: realStats, isDemoData: false }),
    )
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const cached = localStorage.getItem('kc-argocd-sync-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.isDemoData).toBe(false)
    expect(parsed.data.synced).toBe(12)
    unmount()
  })

  it('handles API response with missing stats field', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ isDemoData: false }))
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
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
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isFailed).toBe(false)
    unmount()
  })

  it('health hook resets consecutiveFailures on successful demo fallback', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isFailed).toBe(false)
    unmount()
  })

  it('sync hook resets consecutiveFailures on successful demo fallback', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result, unmount } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isFailed).toBe(false)
    unmount()
  })
})
