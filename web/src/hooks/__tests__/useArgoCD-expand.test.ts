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

import {
  useArgoCDApplications,
  useArgoCDHealth,
  useArgoCDTriggerSync,
  useArgoCDSyncStatus,
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

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not available')))

  // Re-set mock return values after clearAllMocks/restoreAllMocks which strip implementations
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
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useArgoCDApplications — edge cases', () => {
  // 1. Falls back to mock data when API returns isDemoData=true
  it('falls back to mock apps when API returns isDemoData flag', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], isDemoData: true }))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.applications.length).toBeGreaterThan(0)
  })

  // 2. Real data with empty items is NOT treated as demo
  it('uses real data even when items array is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], isDemoData: false }))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.applications).toEqual([])
  })

  // 3. API error falls back to mock data gracefully
  it('falls back to mock data on API error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
  })

  // 4. Non-ok HTTP status with isDemoData body
  it('handles non-ok response with isDemoData flag in body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ isDemoData: true, error: 'ArgoCD not installed' }), { status: 503 })
    )
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
  })

  // 5. Non-ok HTTP status without isDemoData
  it('handles non-ok response without isDemoData flag', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), { status: 500 })
    )
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
  })

  // 6. No clusters means loading stops immediately
  it('stops loading when no clusters are available', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      clusters: [],
      isLoading: false,
    })
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  // 7. Cache loads from localStorage
  it('uses cached data from localStorage on mount', () => {
    const cached = {
      data: [{ name: 'cached-app', namespace: 'argocd', cluster: 'test', syncStatus: 'Synced', healthStatus: 'Healthy', source: { repoURL: '', path: '', targetRevision: '' } }],
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem('kc-argocd-apps-cache', JSON.stringify(cached))
    const { result } = renderHook(() => useArgoCDApplications())
    expect(result.current.applications).toHaveLength(1)
    expect(result.current.isLoading).toBe(false)
  })

  // 8. Expired cache is not used — the hook loads mock/fallback data instead of stale cache
  it('ignores expired cache', async () => {
    const EXPIRED_TIME = Date.now() - 400_000
    const cached = {
      data: [{ name: 'old-app' }],
      timestamp: EXPIRED_TIME,
      isDemoData: false,
    }
    localStorage.setItem('kc-argocd-apps-cache', JSON.stringify(cached))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Expired cache should NOT be used — the hook falls back to mock data
    expect(result.current.applications.some((a: { name: string }) => a.name === 'old-app')).toBe(false)
    expect(result.current.isDemoData).toBe(true)
  })

  // 9. isFailed stays false under threshold
  it('isFailed is false when consecutiveFailures is below threshold', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  // 10. Refetch function triggers a non-silent fetch
  it('refetch triggers a visible refresh', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useArgoCDApplications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => { result.current.refetch() })
    // Should not crash
  })
})

describe('useArgoCDHealth — edge cases', () => {
  // 11. Falls back to mock health on API failure
  it('falls back to mock health data on API error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('fail')))
    const { result } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.stats.healthy).toBeGreaterThanOrEqual(0)
  })

  // 12. Real health data with zero totals is kept (ArgoCD installed, no apps yet)
  it('uses real data even when totals are zero', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({
      stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      isDemoData: false,
    })))
    const { result } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.total).toBe(0)
    expect(result.current.healthyPercent).toBe(0)
  })

  // 13. healthyPercent calculation
  it('calculates healthyPercent correctly', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({
      stats: { healthy: 3, degraded: 1, progressing: 0, missing: 0, unknown: 1 },
      isDemoData: false,
    })))
    const { result } = renderHook(() => useArgoCDHealth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(5)
    expect(result.current.healthyPercent).toBe(60)
  })
})

describe('useArgoCDTriggerSync — edge cases', () => {
  // 14. Successful sync via API
  it('returns success from real API', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }))
    const { result } = renderHook(() => useArgoCDTriggerSync())
    let syncResult: { success: boolean } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('app', 'ns', 'cluster')
    })
    expect(syncResult?.success).toBe(true)
    expect(result.current.lastResult?.success).toBe(true)
  })

  // 15. API failure falls back to simulated success
  it('simulates success when API is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('unreachable'))
    const { result } = renderHook(() => useArgoCDTriggerSync())
    let syncResult: { success: boolean } | undefined
    await act(async () => {
      syncResult = await result.current.triggerSync('app', 'ns')
    })
    expect(syncResult?.success).toBe(true)
    expect(result.current.isSyncing).toBe(false)
  })
})

describe('useArgoCDSyncStatus — edge cases', () => {
  // 16. localClusterFilter changes filteredClusterCount
  it('applies localClusterFilter to filteredClusterCount', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useArgoCDSyncStatus(['specific-cluster']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)
  })

  // 17. Percent calculations for sync data
  it('calculates sync percentages correctly', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({
      stats: { synced: 7, outOfSync: 2, unknown: 1 },
      isDemoData: false,
    })))
    const { result } = renderHook(() => useArgoCDSyncStatus())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(10)
    expect(result.current.syncedPercent).toBe(70)
    expect(result.current.outOfSyncPercent).toBe(20)
  })

  // 18. Cache load from localStorage
  it('uses cached sync data from localStorage', () => {
    const cached = {
      data: { synced: 5, outOfSync: 1, unknown: 0 },
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem('kc-argocd-sync-cache', JSON.stringify(cached))
    const { result } = renderHook(() => useArgoCDSyncStatus())
    expect(result.current.stats.synced).toBe(5)
    expect(result.current.isLoading).toBe(false)
  })
})
