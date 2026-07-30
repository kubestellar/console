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
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmHistory('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.error).toBe('Network error'))
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

    await waitFor(() => expect(result.current.error).toContain('API error'))
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
    mockUseDemoMode.mockReturnValue(true)

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
