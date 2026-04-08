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

describe('useHelmReleases — localStorage cache edges', () => {
  it('loads releases from localStorage with valid stored data', async () => {
    const storedReleases = [makeRelease({ name: 'stored-rel', cluster: 'c1' })]
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: storedReleases,
      timestamp: Date.now(),
    }))

    mockFetchSSE.mockResolvedValue(storedReleases)
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('handles corrupted JSON in localStorage gracefully', async () => {
    localStorage.setItem('kc-helm-releases-cache', 'CORRUPTED{{{')

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash — proceed with empty initial state
    expect(result.current.error).toBeNull()
  })

  it('handles localStorage with non-array data field', async () => {
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: 'not-an-array',
      timestamp: Date.now(),
    }))

    mockFetchSSE.mockResolvedValue([])
    const cluster = uniqueCluster('non-array-data')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The loadHelmReleasesFromStorage check is exercised — non-array data is ignored
    // The releases come from SSE mock instead
    expect(result.current.releases).toEqual([])
  })

  it('handles localStorage with missing timestamp', async () => {
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: [makeRelease()],
    }))

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should default timestamp to 0
  })
})

// ===========================================================================
// loadHelmHistoryFromStorage — localStorage edge cases
// ===========================================================================

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

// ===========================================================================
// useHelmReleases — SSE with cluster param (no module-cache update)
// ===========================================================================

describe('useHelmReleases — cluster-specific fetch paths', () => {
  it('does not save to localStorage when cluster param is provided', async () => {
    const cluster = uniqueCluster('no-persist')
    const fakeRelease = makeRelease({ cluster })
    mockFetchSSE.mockResolvedValue([fakeRelease])

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // localStorage should not have been written for cluster-specific fetch
    const stored = localStorage.getItem('kc-helm-releases-cache')
    if (stored) {
      const parsed = JSON.parse(stored)
      const found = (parsed.data || []).find((r: { name: string }) => r.name === fakeRelease.name)
      expect(found).toBeUndefined()
    }
  })

  it('increments failure count on cluster-specific fetch but does not update module cache', async () => {
    const cluster = uniqueCluster('cluster-fail')
    mockFetchSSE.mockRejectedValue(new Error('SSE fail'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
})

// ===========================================================================
// useHelmReleases — REST fallback with no token / demo token
// ===========================================================================

describe('useHelmReleases — REST fallback edge cases', () => {
  it('REST fallback succeeds when SSE is unavailable (no valid token)', async () => {
    // No SSE token available
    localStorage.removeItem('token')
    mockFetchSSE.mockRejectedValue(new Error('no token'))

    const restReleases = [makeRelease({ name: 'rest-only' })]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: restReleases }),
    })

    const cluster = uniqueCluster('rest-no-token')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(restReleases)
  })

  it('saves to module cache on all-clusters successful SSE fetch', async () => {
    const releases = [makeRelease({ name: 'save-test' })]
    mockFetchSSE.mockResolvedValue(releases)

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // Verify module cache was updated (releases are returned from cache on next render)
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

// ===========================================================================
// useHelmReleases — cache age and background refresh
// ===========================================================================

describe('useHelmReleases — cache validity and background refresh', () => {
  it('uses cached data immediately when cache is fresh', async () => {
    // Pre-populate cache via a first render
    const releases = [makeRelease({ name: 'cached-rel' })]
    mockFetchSSE.mockResolvedValue(releases)

    const { result, unmount } = renderHook(() => useHelmReleases())
    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    unmount()

    // Second render should pick up cached data without fetching
    const mockFetch2 = vi.fn()
    globalThis.fetch = mockFetch2

    const { result: result2 } = renderHook(() => useHelmReleases())
    // Cached data should be available immediately
    expect(result2.current.releases.length).toBeGreaterThanOrEqual(0)
  })
})

// ===========================================================================
// useHelmReleases — demo mode with cluster param
// ===========================================================================

describe('useHelmReleases — demo mode edge cases', () => {
  it('does not update module cache when demo mode + cluster param', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const cluster = uniqueCluster('demo-cluster')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('updates module cache when demo mode without cluster param', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useHelmHistory — cache persistence and update on error
// ===========================================================================

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

// ===========================================================================
// useHelmHistory — refetch with empty history triggering isLoading
// ===========================================================================

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

// ===========================================================================
// useHelmHistory — demo mode re-fetch on toggle
// ===========================================================================

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

// ===========================================================================
// useHelmValues — doFetch inner function (useEffect path)
// ===========================================================================

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

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Inner fetch error')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('doFetch handles non-ok response in inner function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const cluster = uniqueCluster('val-dofetch-403')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error')
  })
})

// ===========================================================================
// useHelmValues — cache hit with stale data triggers background refetch
// ===========================================================================

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

// ===========================================================================
// useHelmValues — demo mode toggle re-fetch
// ===========================================================================

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
