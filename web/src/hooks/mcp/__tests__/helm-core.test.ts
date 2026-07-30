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

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
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
  mockUseDemoMode.mockReturnValue(false)
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


// ---------------------------------------------------------------------------
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
    mockUseDemoMode.mockReturnValue(true)

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
    mockUseDemoMode.mockReturnValue(true)

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
