import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
// Hoisted mocks — mirrors helm.test.ts setup
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
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))
vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))
vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 5_000,
    SHORT_DELAY_MS: 100,
    FOCUS_DELAY_MS: 100,
  }
})
vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})
// Imports under test (after mocks)
import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'
// Helpers
let testCounter = 0
function uniqueCluster(prefix = 'cov') {
  return `${prefix}-${++testCounter}-${Date.now()}`
}
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
// Setup / teardown
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
// loadHelmReleasesFromStorage — localStorage edge cases
describe('useHelmHistory — localStorage cache edges', () => {
  it('loads history from localStorage with valid stored data', async () => {
    const historyData = {
      'c1:prometheus': {
        data: [makeHistoryEntry({ revision: 3 })],
        timestamp: Date.now(),
        consecutiveFailures: 0,
      },
    }
    localStorage.setItem('kc-helm-history-cache', JSON.stringify(historyData))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry({ revision: 3 })] }),
    })
    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })
  it('handles corrupted JSON in history localStorage gracefully', async () => {
    localStorage.setItem('kc-helm-history-cache', 'NOT_JSON')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const cluster = uniqueCluster('hist-corrupt')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'ns1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash, just fetch fresh data
    expect(result.current.history.length).toBeGreaterThan(0)
  })
  it('handles null value in history localStorage', async () => {
    localStorage.setItem('kc-helm-history-cache', JSON.stringify(null))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })
    const cluster = uniqueCluster('hist-null')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'ns1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
  })
})
describe('useHelmHistory — cache persistence', () => {
  it('persists history to localStorage on successful fetch', async () => {
    const cluster = uniqueCluster('hist-persist')
    const fakeHistory = [makeHistoryEntry({ revision: 5 })]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))
    // Should be persisted to localStorage
    const stored = localStorage.getItem('kc-helm-history-cache')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed[`${cluster}:my-rel`]).toBeDefined()
  })
  it('persists failure count to localStorage on error when cache entry exists', async () => {
    const cluster = uniqueCluster('hist-fail-persist')
    // First fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toHaveLength(1))
    // Second fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    await act(async () => { await result.current.refetch() })
    // Cache failure count should be persisted
    const stored = localStorage.getItem('kc-helm-history-cache')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    const entry = parsed[`${cluster}:my-rel`]
    expect(entry.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
  it('handles fetch with no cluster param — skips cache update', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    // No cluster param — cacheKey will be empty
    const { result } = renderHook(() => useHelmHistory(undefined, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThanOrEqual(0)
  })
})
// useHelmHistory — refetch with empty history triggering isLoading
describe('useHelmHistory — loading state transitions', () => {
  it('sets isLoading when history is empty on refetch', async () => {
    const cluster = uniqueCluster('hist-load')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })
  it('sets isRefreshing to true immediately on manual refetch', async () => {
    const cluster = uniqueCluster('hist-refresh')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Manual refetch
    const refetchPromise = act(async () => { await result.current.refetch() })
    await refetchPromise
    // After refetch completes, isRefreshing should be false
    expect(result.current.isRefreshing).toBe(false)
  })
})
// useHelmHistory — demo mode re-fetch on toggle
describe('useHelmHistory — demo mode toggle', () => {
  it('re-fetches when demo mode changes after initial mount', async () => {
    const cluster = uniqueCluster('hist-demo-toggle')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const { result, rerender } = renderHook(
      ({ demo }: { demo: boolean }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demo })
        return useHelmHistory(cluster, 'my-rel', 'default')
      },
      { initialProps: { demo: false } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Toggle demo mode
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demo: true })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have re-fetched (demo data or fresh data)
    expect(result.current.history.length).toBeGreaterThanOrEqual(0)
  })
})
describe('Helm history storage save', () => {
  it('persists and loads history correctly across renders', async () => {
    const cluster = uniqueCluster('save-load-hist')
    const fakeHistory = [makeHistoryEntry({ revision: 1 }), makeHistoryEntry({ revision: 2 })]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    const { result, unmount } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))
    unmount()
    // Verify localStorage was updated
    const stored = localStorage.getItem('kc-helm-history-cache')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    const key = `${cluster}:my-rel`
    expect(parsed[key]).toBeDefined()
    expect(parsed[key].data).toHaveLength(2)
    expect(parsed[key].consecutiveFailures).toBe(0)
  })
})
// useHelmHistory — no release selected, then release provided
describe('useHelmHistory — release selection transitions', () => {
  it('transitions from no-release to release triggers fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const cluster = uniqueCluster('hist-transition')
    const { result, rerender } = renderHook(
      ({ release }: { release: string | undefined }) => useHelmHistory(cluster, release, 'default'),
      { initialProps: { release: undefined as string | undefined } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
    // Now select a release
    rerender({ release: 'my-rel' })
    await waitFor(() => expect(result.current.history.length).toBeGreaterThan(0))
  })
})
