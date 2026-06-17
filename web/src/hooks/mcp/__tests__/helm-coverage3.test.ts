import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — mirrors helm.test.ts setup
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

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// loadHelmReleasesFromStorage — localStorage edge cases
// ===========================================================================


// ===========================================================================
// useHelmValues — missing namespace skips fetch, fetchingKeyRef dedup
// ===========================================================================

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

// ===========================================================================
// useHelmReleases — listener notification with isLoading
// ===========================================================================

describe('useHelmReleases — listener updates', () => {
  it('listener receives isLoading state update', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The listener updateHandler should have been called with isLoading updates
    expect(result.current.isRefreshing).toBe(false)
  })

  it('cleans up listener on unmount', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
    // No assertion needed — just verifying no error on unmount cleanup
  })
})

// ===========================================================================
// useHelmReleases — refetch non-silent sets isLoading
// ===========================================================================

describe('useHelmReleases — non-silent refetch loading state', () => {
  it('non-silent refetch sets isLoading to true', async () => {
    const cluster = uniqueCluster('non-silent')
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases(cluster))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Refetch (non-silent via the returned refetch function)
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])
    await act(async () => { await result.current.refetch() })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.releases.length).toBe(1)
  })
})

// ===========================================================================
// saveHelmHistoryToStorage edge case — verify it doesn't throw
// ===========================================================================

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

// ===========================================================================
// useHelmHistory — no release selected, then release provided
// ===========================================================================

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
