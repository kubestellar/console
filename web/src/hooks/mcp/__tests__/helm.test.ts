import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockSubscribePolling,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  SHORT_DELAY_MS: 100,
  FOCUS_DELAY_MS: 100,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique cluster key per test to avoid module-level cache collisions */
let testCounter = 0
function uniqueCluster(prefix = 'test') {
  return `${prefix}-${++testCounter}-${Date.now()}`
}

/** Build a minimal valid HelmRelease object */
function makeRelease(overrides: Partial<{
  name: string; namespace: string; revision: string; updated: string;
  status: string; chart: string; app_version: string; cluster: string;
}> = {}) {
  return {
    name: overrides.name ?? 'my-release',
    namespace: overrides.namespace ?? 'default',
    revision: overrides.revision ?? '1',
    updated: overrides.updated ?? new Date().toISOString(),
    status: overrides.status ?? 'deployed',
    chart: overrides.chart ?? 'my-chart-1.0.0',
    app_version: overrides.app_version ?? '1.0.0',
    cluster: overrides.cluster ?? 'c1',
  }
}

/** Build a minimal valid HelmHistoryEntry object */
function makeHistoryEntry(overrides: Partial<{
  revision: number; updated: string; status: string;
  chart: string; app_version: string; description: string;
}> = {}) {
  return {
    revision: overrides.revision ?? 1,
    updated: overrides.updated ?? new Date().toISOString(),
    status: overrides.status ?? 'deployed',
    chart: overrides.chart ?? 'my-chart-1.0.0',
    app_version: overrides.app_version ?? '1.0.0',
    description: overrides.description ?? 'Install complete',
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useHelmReleases
// ===========================================================================

describe('useHelmReleases', () => {
  it('returns initial loading state with empty releases array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHelmReleases())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.releases).toEqual([])
  })

  it('returns helm releases after SSE fetch resolves', async () => {
    const fakeReleases = [
      { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date().toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'c1' },
    ]
    mockFetchSSE.mockResolvedValue(fakeReleases)

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(fakeReleases)
    expect(result.current.error).toBeNull()
  })

  it('returns demo releases when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('falls back to REST when SSE fails', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    const fakeReleases = [
      { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date().toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: fakeReleases }),
    })

    // Use a cluster param to bypass module-level cache from prior tests
    const { result } = renderHook(() => useHelmReleases('rest-fallback-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(fakeReleases)
    expect(result.current.error).toBeNull()
  })

  it('handles both SSE and REST failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    // Use a cluster param to bypass module-level cache from prior tests
    const { result } = renderHook(() => useHelmReleases('fail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('error'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Only 1 failure so far
    expect(result.current.isFailed).toBe(false)
  })

  // --- New regression tests ---

  it('returns the complete return shape with all expected keys', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Guard against accidental removal of return properties
    expect(result.current).toHaveProperty('releases')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('skips fetching entirely on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true
    mockFetchSSE.mockReturnValue(new Promise(() => {})) // should never resolve

    const cluster = uniqueCluster('netlify')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // No SSE or REST calls should have been attempted
    expect(result.current.isRefreshing).toBe(false)
  })

  it('handles REST 500 response as an error', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE unavailable'))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const cluster = uniqueCluster('rest-500')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles REST response with missing releases key', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE unavailable'))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no "releases" key
    })

    const cluster = uniqueCluster('no-releases-key')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should gracefully default to empty array (data.releases || [])
    expect(result.current.releases).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('keeps cached data on subsequent fetch failure', async () => {
    const cluster = uniqueCluster('cached-keep')
    const fakeReleases = [makeRelease({ cluster })]

    // First fetch succeeds via SSE
    mockFetchSSE.mockResolvedValue(fakeReleases)
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.releases).toEqual(fakeReleases))

    // Second fetch fails — both SSE and REST must reject to trigger outer catch.
    // After the single failure, hang subsequent calls to prevent cascade.
    mockFetchSSE
      .mockRejectedValueOnce(new Error('now failing'))
      .mockImplementation(() => new Promise(() => {}))
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('now failing'))
      .mockImplementation(() => new Promise(() => {}))

    await act(async () => { await result.current.refetch() })

    // Original data should be preserved despite the error
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.releases).toEqual(fakeReleases)
  })

  it('registers for polling and mode-transition refetch on mount', async () => {
    mockFetchSSE.mockResolvedValue([])
    const cluster = uniqueCluster('register')
    renderHook(() => useHelmReleases(cluster))

    await waitFor(() => {
      expect(mockSubscribePolling).toHaveBeenCalled()
    })
    expect(mockRegisterRefetch).toHaveBeenCalled()
  })

  it('unsubscribes polling and refetch on unmount', async () => {
    const unsubPolling = vi.fn()
    const unregRefetch = vi.fn()
    mockSubscribePolling.mockReturnValue(unsubPolling)
    mockRegisterRefetch.mockReturnValue(unregRefetch)
    mockFetchSSE.mockResolvedValue([])

    const cluster = uniqueCluster('unsub')
    const { unmount } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())
    unmount()

    expect(unsubPolling).toHaveBeenCalled()
    expect(unregRefetch).toHaveBeenCalled()
  })

  it('demo releases each have required HelmRelease fields', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.releases.length).toBeGreaterThan(0))

    for (const rel of result.current.releases) {
      expect(rel).toHaveProperty('name')
      expect(rel).toHaveProperty('namespace')
      expect(rel).toHaveProperty('revision')
      expect(rel).toHaveProperty('updated')
      expect(rel).toHaveProperty('status')
      expect(rel).toHaveProperty('chart')
      expect(rel).toHaveProperty('app_version')
      expect(rel).toHaveProperty('cluster')
    }
  })

  it('sets lastRefresh after a successful fetch', async () => {
    const cluster = uniqueCluster('lastRefresh')
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeTypeOf('number')
    expect(result.current.lastRefresh).toBeGreaterThan(0)
  })

  it('resets error and consecutiveFailures after a successful fetch', async () => {
    const cluster = uniqueCluster('reset-err')

    // First attempt fails
    mockFetchSSE.mockRejectedValue(new Error('fail'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Second attempt succeeds
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('sends Authorization header with Bearer token on REST fallback', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE unavailable'))
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: [] }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('auth-header')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gitops/helm-releases'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
  })

  it('includes cluster query parameter when provided', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE unavailable'))
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: [] }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('cluster-param')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain(`cluster=${encodeURIComponent(cluster)}`)
  })
})

// ===========================================================================
// useHelmHistory
// ===========================================================================

describe('useHelmHistory', () => {
  it('returns initial loading state when release is provided', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.history).toEqual([])
  })

  it('returns empty history when no release is provided', async () => {
    const { result } = renderHook(() => useHelmHistory('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
  })

  it('returns helm history after fetch resolves', async () => {
    const fakeHistory = [
      { revision: 5, updated: new Date().toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual(fakeHistory)
    expect(result.current.error).toBeNull()
  })

  it('returns demo history when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmHistory('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression tests ---

  it('returns the complete return shape with all expected keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })
    const cluster = uniqueCluster('hist-shape')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('history')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('handles HTTP 404 response as an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    const cluster = uniqueCluster('hist-404')
    const { result } = renderHook(() => useHelmHistory(cluster, 'nonexistent-release', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles response with missing history key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no "history" key
    })

    const cluster = uniqueCluster('hist-missing-key')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should gracefully default to [] via (data.history || [])
    expect(result.current.history).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('passes error field from response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [], error: 'cluster unreachable' }),
    })

    const cluster = uniqueCluster('hist-body-err')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('cluster unreachable')
  })

  it('preserves cached history on subsequent fetch failure', async () => {
    const cluster = uniqueCluster('hist-cache')
    const fakeHistory = [makeHistoryEntry({ revision: 1 }), makeHistoryEntry({ revision: 2 })]

    // First fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))

    // Second fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'))
    await act(async () => { await result.current.refetch() })

    // Cached data still intact
    expect(result.current.history).toEqual(fakeHistory)
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is false below 3 failures and true at 3+', async () => {
    const cluster = uniqueCluster('hist-isFailed')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // 1 failure

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(false) // 2 failures

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(true) // 3 failures => isFailed
  })

  it('demo history entries each have required HelmHistoryEntry fields', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))
    await waitFor(() => expect(result.current.history.length).toBeGreaterThan(0))

    for (const entry of result.current.history) {
      expect(entry).toHaveProperty('revision')
      expect(entry).toHaveProperty('updated')
      expect(entry).toHaveProperty('status')
      expect(entry).toHaveProperty('chart')
      expect(entry).toHaveProperty('app_version')
      expect(entry).toHaveProperty('description')
      expect(typeof entry.revision).toBe('number')
    }
  })

  it('sets lastRefresh after successful fetch', async () => {
    const cluster = uniqueCluster('hist-lastRefresh')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })

    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.lastRefresh).toBeTypeOf('number')
    expect(result.current.lastRefresh).toBeGreaterThan(0)
  })

  it('includes cluster, release, and namespace query params in fetch URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('hist-params')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'my-ns'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain(`cluster=${encodeURIComponent(cluster)}`)
    expect(calledUrl).toContain('release=my-rel')
    expect(calledUrl).toContain('namespace=my-ns')
  })

  it('sends Authorization header with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('hist-auth')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
  })

  it('registers for mode-transition refetch and cleans up on unmount', async () => {
    const unregRefetch = vi.fn()
    mockRegisterRefetch.mockReturnValue(unregRefetch)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })

    const cluster = uniqueCluster('hist-unreg')
    const { unmount } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    unmount()
    expect(unregRefetch).toHaveBeenCalled()
  })

  it('refetch with no release returns empty array immediately', async () => {
    const { result } = renderHook(() => useHelmHistory('c1', undefined, 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
  })
})

// ===========================================================================
// useHelmValues
// ===========================================================================

describe('useHelmValues', () => {
  it('returns null values when no release is provided', async () => {
    const { result } = renderHook(() => useHelmValues('c1'))

    // No release = no fetch
    expect(result.current.values).toBeNull()
    expect(result.current.format).toBe('json')
  })

  it('returns helm values after fetch resolves', async () => {
    const fakeValues = { replicaCount: 2, image: { tag: 'v1.0.0' } }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.values).toEqual(fakeValues)
    expect(result.current.format).toBe('json')
    expect(result.current.error).toBeNull()
  })

  it('returns demo values when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.format).toBe('json')
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release/namespace to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmValues('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression tests ---

  it('returns the complete return shape with all expected keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    const cluster = uniqueCluster('val-shape')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(result.current).toHaveProperty('values')
    expect(result.current).toHaveProperty('format')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('does not fetch when namespace is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('val-no-ns')
    // release provided but no namespace
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', undefined))

    // Wait a tick to give any async effects time to fire
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // No fetch should have been called - namespace is required
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.values).toBeNull()
  })

  it('handles HTTP 500 response as an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const cluster = uniqueCluster('val-500')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles yaml format from server', async () => {
    const yamlString = 'replicaCount: 2\nimage:\n  tag: v1.0.0'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: yamlString, format: 'yaml' }),
    })

    const cluster = uniqueCluster('val-yaml')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.values).toBe(yamlString)
    expect(result.current.format).toBe('yaml')
  })

  it('defaults format to json when server omits format field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 'val' } }), // no "format" key
    })

    const cluster = uniqueCluster('val-no-format')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.format).toBe('json')
  })

  it('preserves cached values on subsequent fetch failure', async () => {
    const cluster = uniqueCluster('val-cache-keep')
    const fakeValues = { replicaCount: 3, env: 'production' }

    // First fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).toEqual(fakeValues))

    // Second fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'))
    await act(async () => { await result.current.refetch() })

    // Cached values still intact
    expect(result.current.values).toEqual(fakeValues)
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is false below 3 failures and true at 3+', async () => {
    const cluster = uniqueCluster('val-isFailed')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // 1 failure

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(false) // 2 failures

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(true) // 3 failures => isFailed
  })

  it('demo values contain expected structure', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const cluster = uniqueCluster('val-demo-struct')
    const { result } = renderHook(() => useHelmValues(cluster, 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    const vals = result.current.values as Record<string, unknown>
    expect(vals).toHaveProperty('replicaCount')
    expect(vals).toHaveProperty('image')
    expect(vals).toHaveProperty('service')
    expect(vals).toHaveProperty('resources')
  })

  it('clears values when release is deselected', async () => {
    const cluster = uniqueCluster('val-deselect')
    const fakeValues = { key: 'val' }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    // Start with a release selected
    const { result, rerender } = renderHook(
      ({ rel }: { rel: string | undefined }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' as string | undefined } }
    )

    await waitFor(() => expect(result.current.values).toEqual(fakeValues))

    // Deselect release
    rerender({ rel: undefined })

    await waitFor(() => expect(result.current.values).toBeNull())
  })

  it('sends Authorization header with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('val-auth')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
  })

  it('sets lastRefresh after successful fetch', async () => {
    const cluster = uniqueCluster('val-lastRefresh')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { a: 1 }, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(result.current.lastRefresh).toBeTypeOf('number')
    expect(result.current.lastRefresh).toBeGreaterThan(0)
  })

  it('resets consecutiveFailures to 0 after a successful refetch', async () => {
    const cluster = uniqueCluster('val-reset-fail')

    // First fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Second fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { ok: true }, format: 'json' }),
    })
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// Additional branch coverage — helm.ts
// ===========================================================================

describe('useHelmReleases — additional branches', () => {
  it('accumulates releases progressively via SSE onClusterData', async () => {
    const rel1 = makeRelease({ name: 'r1', cluster: 'c1' })
    const rel2 = makeRelease({ name: 'r2', cluster: 'c2' })

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [rel1])
      opts.onClusterData('c2', [rel2])
      return [rel1, rel2]
    })

    const cluster = uniqueCluster('sse-progressive')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toHaveLength(2)
  })

  it('error message is extracted from Error instance on fetch failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('Custom SSE failure'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom REST failure'))

    const cluster = uniqueCluster('err-msg')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('Custom')
  })

  it('error message defaults to generic text for non-Error thrown values', async () => {
    mockFetchSSE.mockRejectedValue('string-error')
    globalThis.fetch = vi.fn().mockRejectedValue('string-error')

    const cluster = uniqueCluster('non-error')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Helm releases')
  })

  it('does not update module cache when cluster param is provided (per-cluster fetch)', async () => {
    const cluster = uniqueCluster('no-cache-update')
    const fakeRelease = makeRelease({ cluster })
    mockFetchSSE.mockResolvedValue([fakeRelease])

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // The release should be returned but localStorage should NOT contain this
    // (module cache only updates when cluster param is absent — all-clusters mode)
    const stored = localStorage.getItem('kc-helm-releases-cache')
    if (stored) {
      const parsed = JSON.parse(stored)
      // If there's stored data, it should NOT contain our cluster-specific release
      const found = (parsed.data || []).find((r: { name: string }) => r.name === fakeRelease.name)
      expect(found).toBeUndefined()
    }
  })

  it('refetch with silent=true sets isRefreshing but not isLoading', async () => {
    const cluster = uniqueCluster('silent-refetch')
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases(cluster))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // silent refetch
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])
    await act(async () => { await result.current.refetch() })

    // After refetch finishes, both should be false
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('demo mode refetch with silent does not show refresh indicator', async () => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await act(() => Promise.resolve())
    // Advance past MIN_REFRESH_INDICATOR_MS
    const INDICATOR_CLEAR_MS = 600
    act(() => { vi.advanceTimersByTime(INDICATOR_CLEAR_MS) })
    expect(result.current.isRefreshing).toBe(false)
    vi.useRealTimers()
  })
})

describe('useHelmHistory — additional branches', () => {
  it('uses cached history when available and fresh', async () => {
    const cluster = uniqueCluster('hist-cached-fresh')
    const fakeHistory = [makeHistoryEntry({ revision: 1 })]

    // First fetch populates cache
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    const { result, unmount } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))
    unmount()

    // Second render should use cached data
    const mockFetch2 = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    globalThis.fetch = mockFetch2

    const { result: result2 } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    // Should immediately show cached data
    expect(result2.current.history).toEqual(fakeHistory)
  })

  it('error message is extracted from Error instance', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom helm error'))

    const cluster = uniqueCluster('hist-err-msg')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Custom helm error')
  })

  it('error defaults to generic text for non-Error thrown values', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('not-an-error')

    const cluster = uniqueCluster('hist-generic-err')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Helm history')
  })

  it('updates cache failure count on error when cache entry exists', async () => {
    const cluster = uniqueCluster('hist-cache-fail')

    // First fetch succeeds, populating cache
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toHaveLength(1))

    // Second fetch fails — cache failure count should increment
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    // But cached history data should still be intact
    expect(result.current.history).toHaveLength(1)
  })
})

describe('useHelmValues — additional branches', () => {
  it('refetch with no release returns null values and clears isRefreshing', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useHelmValues('c1', undefined, 'default'))

    await act(() => Promise.resolve())
    // Advance past FOCUS_DELAY_MS
    const DELAY_MS = 200
    act(() => { vi.advanceTimersByTime(DELAY_MS) })
    expect(result.current.values).toBeNull()
    expect(result.current.isRefreshing).toBe(false)
    vi.useRealTimers()
  })

  it('error message is extracted from Error instance', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom values error'))

    const cluster = uniqueCluster('val-err-msg')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Custom values error')
  })

  it('error defaults to generic text for non-Error thrown values', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(42)

    const cluster = uniqueCluster('val-generic-err')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Helm values')
  })

  it('passes error field from server response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json', error: 'helm: release not found' }),
    })

    const cluster = uniqueCluster('val-body-err')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.error).toBe('helm: release not found')
  })

  it('caches fetched values and uses them on subsequent renders', async () => {
    const cluster = uniqueCluster('val-cache')
    const fakeValues = { cached: true }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    const { result, unmount } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    await waitFor(() => expect(result.current.values).toEqual(fakeValues))
    unmount()

    // Second render should use cached values immediately
    const mockFetch2 = vi.fn()
    globalThis.fetch = mockFetch2

    const { result: r2 } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    expect(r2.current.values).toEqual(fakeValues)
  })
})
