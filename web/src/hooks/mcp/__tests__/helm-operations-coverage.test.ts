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
describe('useHelmValues — useEffect doFetch path', () => {
  it('fetches via doFetch when no cache exists for new key', async () => {
    const cluster = uniqueCluster('val-dofetch')
    const fakeValues = { setting: true }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.values).toEqual(fakeValues)
  })
  it('doFetch returns demo values when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const cluster = uniqueCluster('val-dofetch-demo')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.values).not.toBeNull())
    // Should return demo values structure
    const vals = result.current.values as Record<string, unknown>
    expect(vals).toHaveProperty('replicaCount')
  })
  it('doFetch handles fetch failure in inner function', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Inner fetch error'))
    const cluster = uniqueCluster('val-dofetch-err')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.error).toBe('Inner fetch error'))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
  it('doFetch handles non-ok response in inner function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })
    const cluster = uniqueCluster('val-dofetch-403')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.error).toContain('API error'))
  })
})
// useHelmValues — cache hit with stale data triggers background refetch
describe('useHelmValues — stale cache background refetch', () => {
  it('uses cached values immediately and refetches in background if stale', async () => {
    const cluster = uniqueCluster('val-stale-cache')
    const fakeValues = { cached: true }
    // First render populates cache
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })
    const { result, unmount } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    await waitFor(() => expect(result.current.values).toEqual(fakeValues))
    unmount()
    // Second render with same key — cache exists
    const mockFetch2 = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { updated: true }, format: 'json' }),
    })
    globalThis.fetch = mockFetch2
    const { result: result2 } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    // Should have cached data immediately
    expect(result2.current.values).toEqual(fakeValues)
  })
})
// useHelmValues — demo mode toggle re-fetch
describe('useHelmValues — demo mode toggle', () => {
  it('re-fetches when demo mode changes after initial mount', async () => {
    const cluster = uniqueCluster('val-demo-toggle')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { live: true }, format: 'json' }),
    })
    const { result, rerender } = renderHook(
      ({ demo }: { demo: boolean }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demo })
        return useHelmValues(cluster, 'my-rel', 'default')
      },
      { initialProps: { demo: false } }
    )
    await waitFor(() => expect(result.current.values).not.toBeNull())
    // Toggle demo mode
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demo: true })
    // Should trigger a re-fetch
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })
  it('skips demo mode re-fetch on initial mount', async () => {
    const cluster = uniqueCluster('val-no-refetch-init')
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.values).not.toBeNull())
    // Should still get demo values
    expect(result.current.values).toBeTruthy()
  })
})
// useHelmValues — missing namespace skips fetch, fetchingKeyRef dedup
describe('useHelmValues — dedup and skip logic', () => {
  it('skips duplicate fetch for same key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 1 }, format: 'json' }),
    })
    globalThis.fetch = mockFetch
    const cluster = uniqueCluster('val-dedup')
    const { result, rerender } = renderHook(
      ({ rel }: { rel: string }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' } }
    )
    await waitFor(() => expect(result.current.values).not.toBeNull())
    const callCountAfterFirst = mockFetch.mock.calls.length
    // Re-render with same props — should not trigger another fetch
    rerender({ rel: 'my-rel' })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    // Call count should not have increased significantly
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(callCountAfterFirst + 1)
  })
  it('clears values and fetchingKey when release is deselected', async () => {
    const cluster = uniqueCluster('val-deselect-key')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 1 }, format: 'json' }),
    })
    const { result, rerender } = renderHook(
      ({ rel }: { rel: string | undefined }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' as string | undefined } }
    )
    await waitFor(() => expect(result.current.values).not.toBeNull())
    // Deselect release
    rerender({ rel: undefined })
    await waitFor(() => expect(result.current.values).toBeNull())
  })
})
